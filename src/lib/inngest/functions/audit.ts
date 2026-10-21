import { inngest } from "../client";
import { db, logEvent, setStatus, type Lead } from "@/lib/supabase";
import { auditHtml, extractText, fetchHomepage, findContactInfo, isThirdPartyUrl } from "@/lib/audit";
import { judgeSiteAge } from "@/lib/llm";
import { getSettings } from "@/lib/settings";


export const auditLead = inngest.createFunction(
  { id: "audit-lead", retries: 1, concurrency: { limit: 5 } },
  { event: "lead/audit" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const lead = await step.run("load", async () => {
      const { data, error } = await db.from("leads").select("*").eq("id", leadId).single();
      if (error) throw error;
      await setStatus(leadId, "auditing");
      return data as Lead;
    });

    if (!lead.website || isThirdPartyUrl(lead.website)) {
      // Facebook/Booking etc. nu sunt site propriu → candidat bun, dar nu auditabil
      await step.run("no-website", () => setStatus(leadId, "no_website", { old_site_reason: lead.website ? "doar pagină pe platformă terță" : null }));
      return { skipped: "no website" };
    }

    const result = await step.run("fetch-and-audit", async () => {
      const page = await fetchHomepage(lead.website!);
      if (!page) {
        await setStatus(leadId, "audited", {
          audit: { reachable: false } as never,
          old_site_score: 100,
          old_site_reason: "site inaccesibil (posibil expirat)",
        });
        await logEvent(leadId, "audit", "unreachable");
        return { score: 100, reasons: ["inaccesibil"] };
      }
      const { audit, score: techScore, reasons } = auditHtml(page.html, page.finalUrl);
      const contact = lead.email ? { email: lead.email, phone: null, from: null } : await findContactInfo(page.html, page.finalUrl);
      const email = contact.email;
      if (contact.from && contact.from !== page.finalUrl) await logEvent(leadId, "email", `găsit pe ${contact.from}`);

      // Semnalele tehnice nu prind "arată ca în 2010". Un LLM judecă structura HTML.
      let score = techScore;
      try {
        const judged = await judgeSiteAge(extractText(page.html, 3000), page.html.slice(0, 12000));
        audit.llmScore = judged.score;
        audit.llmReason = judged.reason;
        score = Math.round(techScore * 0.4 + judged.score * 0.6);
        if (judged.reason) reasons.push(judged.reason);
      } catch (e) {
        await logEvent(leadId, "audit", `llm judge skipped: ${(e as Error).message}`);
      }

      await setStatus(leadId, "audited", {
        audit,
        old_site_score: score,
        old_site_reason: reasons.join(", ") || "nimic suspect",
        email,
        ...(lead.phone ? {} : { phone: contact.phone }),
      });
      await logEvent(leadId, "audit", `score ${score} (tehnic ${techScore}, llm ${audit.llmScore ?? "-"})`, { reasons });
      return { score, reasons };
    });

    const settings = await step.run("settings", () => getSettings(true));
    if (result.score < settings.old_site_threshold) {
      await step.run("reject", () => setStatus(leadId, "rejected", { error: `scor ${result.score} < prag ${settings.old_site_threshold}` }));
      return { rejected: true, ...result };
    }

    if (settings.auto_generate) {
      await step.sendEvent("queue-generate", { name: "lead/generate", data: { leadId } });
    }
    return result;
  }
);
