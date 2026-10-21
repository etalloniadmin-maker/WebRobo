import { inngest } from "../client";
import { db, logEvent, setStatus, type Lead } from "@/lib/supabase";
import { sendProposal } from "@/lib/email";
import { getSettings } from "@/lib/settings";

// Se declanșează DOAR din butonul "Aprobă și trimite" din dashboard.
export const sendLead = inngest.createFunction(
  { id: "send-lead", retries: 2, concurrency: { limit: 2 }, throttle: { limit: 30, period: "1h" } },
  { event: "lead/send" },
  async ({ event, step }) => {
    const { leadId } = event.data;

    const lead = await step.run("load", async () => {
      const { data, error } = await db.from("leads").select("*").eq("id", leadId).single();
      if (error) throw error;
      const l = data as Lead;
      if (l.status !== "approved") throw new Error(`lead în status ${l.status}, nu 'approved'`);
      if (!l.email) throw new Error("lead fără email");
      if (!l.email_subject || !l.email_body) throw new Error("lead fără draft de email");
      await setStatus(leadId, "sending");
      return l;
    });

    const resendId = await step.run("send", async () => {
      const s = await getSettings(true);
      return sendProposal({
        to: lead.email!,
        subject: lead.email_subject!,
        body: lead.email_body!,
        previewUrl: `${s.app_url}/preview/${lead.slug}`,
        screenshotUrl: lead.mockup_screenshot_url,
        leadId,
      });
    });

    await step.run("mark-sent", async () => {
      await setStatus(leadId, "sent", { sent_at: new Date().toISOString(), resend_id: resendId });
      await logEvent(leadId, "send", resendId);
    });

    return { resendId };
  }
);
