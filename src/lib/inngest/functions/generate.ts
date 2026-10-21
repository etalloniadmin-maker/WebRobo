import { inngest } from "../client";
import { db, logEvent, setStatus, type Lead } from "@/lib/supabase";
import { extractText, fetchHomepage, isThirdPartyUrl } from "@/lib/audit";
import { extractBusiness, generateMockup } from "@/lib/llm";
import { buildDraft } from "@/lib/draft";
import { getSettings } from "@/lib/settings";
import { screenshotPreview } from "@/lib/screenshot";

export const generateLead = inngest.createFunction(
  { id: "generate-lead", retries: 1, concurrency: { limit: 3 } },
  { event: "lead/generate" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const { lead, category } = await step.run("load", async () => {
      const { data, error } = await db.from("leads").select("*, campaigns(category)").eq("id", leadId).single();
      if (error) throw error;
      await setStatus(leadId, "generating", { error: null });
      const { campaigns, ...lead } = data as Lead & { campaigns: { category: string } | null };
      return { lead, category: campaigns?.category ?? "firmă" };
    });

    // 1. Conținut din site-ul vechi
    const extracted = await step.run("extract", async () => {
      // Fără site propriu (sau doar Facebook/Booking) → generăm doar din datele Google.
      const page = lead.website && !isThirdPartyUrl(lead.website) ? await fetchHomepage(lead.website) : null;
      const siteText = page ? extractText(page.html) : "";
      const ex = await extractBusiness({
        name: lead.name,
        category,
        siteText,
        address: lead.address ?? undefined,
        phone: lead.phone ?? undefined,
      });
      await db.from("leads").update({ extracted: ex, email: lead.email ?? ex.email ?? null }).eq("id", leadId);
      await logEvent(leadId, "extract", ex.tagline);
      return ex;
    });

    // 2. HTML-ul noului homepage
    await step.run("mockup", async () => {
      const html = await generateMockup({ name: lead.name, category, extracted });
      if (!/<html/i.test(html)) throw new Error("LLM nu a returnat HTML valid");
      await db.from("leads").update({ mockup_html: html }).eq("id", leadId);
      await logEvent(leadId, "mockup", `${html.length} bytes`);
    });

    const previewUrl = `${(await getSettings()).app_url}/preview/${lead.slug}`;

    // 3. Screenshot (opțional)
    await step.run("screenshot", async () => {
      try {
        const url = await screenshotPreview(leadId, previewUrl);
        if (url) await db.from("leads").update({ mockup_screenshot_url: url }).eq("id", leadId);
      } catch (e) {
        await logEvent(leadId, "screenshot", `skipped: ${(e as Error).message}`);
      }
    });

    // 4. Draft email din șablon (implicit sau cel ales pe lead) — nu se trimite; așteaptă Review
    await step.run("email-draft", async () => {
      const { data } = await db.from("leads").select("*").eq("id", leadId).single();
      const fresh = data as Lead;
      const draft = await buildDraft(fresh, category);
      await setStatus(leadId, "mockup_ready", { email_subject: draft.subject, email_body: draft.body, template_id: draft.templateId });
    });

    return { previewUrl };
  }
);
