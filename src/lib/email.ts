import { Resend } from "resend";
import { getSettings } from "./settings";
import type { Lead } from "./supabase";

export type EmailTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
  ai_rewrite: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export const TEMPLATE_VARS: { key: string; desc: string }[] = [
  { key: "firma", desc: "numele firmei destinatare" },
  { key: "categorie", desc: "categoria (pensiune, cabinet…)" },
  { key: "oras", desc: "localitatea din adresă" },
  { key: "link", desc: "link-ul către site-ul nou (preview)" },
  { key: "site_vechi", desc: "adresa site-ului actual" },
  { key: "motive", desc: "problemele găsite la audit" },
  { key: "expeditor", desc: "numele tău" },
  { key: "firma_expeditor", desc: "firma ta" },
];

export function templateVars(lead: Lead, category: string, s: { app_url: string; sender_name: string; sender_company: string }): Record<string, string> {
  const oras = (lead.address ?? "").split(",").slice(-1)[0]?.replace(/\d{6}/, "").trim() || "";
  return {
    firma: lead.name,
    categorie: category,
    oras,
    link: `${s.app_url}/preview/${lead.slug}`,
    site_vechi: lead.website ?? "",
    motive: lead.old_site_reason ?? "",
    expeditor: s.sender_name,
    firma_expeditor: s.sender_company,
  };
}

export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => vars[k] ?? "");
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

// HTML-ul exact care pleacă (folosit și pentru preview în dashboard).
export function renderEmailHtml(input: { body: string; previewUrl: string; screenshotUrl?: string | null; leadId: string; appUrl: string }) {
  const paragraphs = input.body
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p.trim()).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#1d4ed8">$1</a>')}</p>`)
    .join("");

  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f6">
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1f2937;max-width:600px;margin:0 auto;background:#fff;padding:28px;border-radius:10px">
  ${paragraphs}
  ${input.screenshotUrl ? `<a href="${input.previewUrl}"><img src="${input.screenshotUrl}" alt="Preview" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;margin:8px 0 16px"></a>` : ""}
  <p><a href="${input.previewUrl}" style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Vezi propunerea</a></p>
  <p style="font-size:12px;color:#9ca3af;margin-top:28px;border-top:1px solid #eee;padding-top:12px">
    Acest mesaj este o propunere comercială unică, trimisă pe baza datelor publice ale firmei.
    Dacă nu doriți alte mesaje sau doriți ștergerea preview-ului, răspundeți cu „stop” sau
    <a href="${input.appUrl}/api/unsubscribe?lead=${input.leadId}" style="color:#9ca3af">dezabonați-vă aici</a>.
  </p>
</div></body></html>`;
}

export async function sendProposal(input: { to: string; subject: string; body: string; previewUrl: string; screenshotUrl?: string | null; leadId: string }): Promise<string> {
  const s = await getSettings();
  if (!s.resend_api_key) throw new Error("Lipsește cheia Resend (Setări → Chei API)");
  if (!s.email_from) throw new Error("Lipsește adresa expeditor (Setări → Expeditor)");
  const resend = new Resend(s.resend_api_key);

  const html = renderEmailHtml({ body: input.body, previewUrl: input.previewUrl, screenshotUrl: input.screenshotUrl, leadId: input.leadId, appUrl: s.app_url });
  const { data, error } = await resend.emails.send({
    from: s.email_from,
    to: input.to,
    replyTo: s.email_reply_to || undefined,
    subject: input.subject,
    html,
    text: `${input.body}\n\nVezi propunerea: ${input.previewUrl}`,
    tags: [{ name: "lead", value: input.leadId }],
  });
  if (error) throw new Error(`Resend: ${error.message}`);
  return data!.id;
}
