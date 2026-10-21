import { db, type Lead } from "./supabase";
import { getSettings } from "./settings";
import { fillTemplate, templateVars, type EmailTemplate } from "./email";
import { personalizeEmail } from "./llm";

export async function getTemplate(id?: string | null): Promise<EmailTemplate | null> {
  if (id) {
    const { data } = await db.from("email_templates").select("*").eq("id", id).maybeSingle();
    if (data) return data as EmailTemplate;
  }
  const { data } = await db.from("email_templates").select("*").eq("is_default", true).limit(1).maybeSingle();
  return (data as EmailTemplate) ?? null;
}

// Construiește subiect+corp pentru un lead dintr-un șablon; dacă șablonul are ai_rewrite, LLM-ul îl personalizează.
export async function buildDraft(lead: Lead, category: string, templateId?: string | null, opts: { allowAi?: boolean } = {}) {
  const s = await getSettings();
  const tpl = await getTemplate(templateId ?? lead.template_id);
  const vars = templateVars(lead, category, s);
  let subject = tpl ? fillTemplate(tpl.subject, vars) : `O idee pentru site-ul ${lead.name}`;
  let body = tpl ? fillTemplate(tpl.body, vars) : `Bună ziua,\n\nAm pregătit o propunere pentru site-ul dumneavoastră: ${vars.link}\n\n${s.sender_name}`;

  if (tpl?.ai_rewrite && opts.allowAi !== false) {
    const reasons = lead.status === "no_website" || !lead.old_site_score
      ? ["nu există un site propriu"]
      : (lead.old_site_reason ?? "").split(", ").filter(Boolean);
    const r = await personalizeEmail({ subject, body, name: lead.name, category, reasons, tagline: lead.extracted?.tagline });
    subject = r.subject;
    body = r.body;
  }
  return { subject, body, templateId: tpl?.id ?? null };
}
