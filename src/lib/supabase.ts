import { createClient } from "@supabase/supabase-js";

// Folosit DOAR pe server (service role). Nu importa în componente client.
export const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

export type LeadStatus =
  | "discovered" | "no_website" | "auditing" | "audited" | "rejected"
  | "generating" | "mockup_ready" | "approved" | "sending" | "sent"
  | "replied" | "failed" | "negotiating" | "won" | "lost";

export type Audit = {
  reachable: boolean;
  https: boolean;
  hasViewport: boolean;
  usesTables: boolean;
  jqueryVersion: string | null;
  copyrightYear: number | null;
  generator: string | null;     // ex: "WordPress 4.1", "Joomla!"
  hasFlash: boolean;
  title: string | null;
  htmlBytes: number;
  llmScore?: number;            // scor estetic dat de LLM pe screenshot/HTML (0-100)
  llmReason?: string;
};

export type Extracted = {
  tagline: string;
  about: string;
  services: string[];
  phone?: string;
  email?: string;
  address?: string;
  colors?: string[];
  logo_url?: string;
};

export type Lead = {
  id: string;
  campaign_id: string;
  slug: string;
  place_id: string | null;
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  cui: string | null;
  status: LeadStatus;
  audit: Audit | null;
  old_site_score: number | null;
  old_site_reason: string | null;
  extracted: Extracted | null;
  mockup_html: string | null;
  mockup_screenshot_url: string | null;
  email_subject: string | null;
  email_body: string | null;
  sent_at: string | null;
  resend_id: string | null;
  opened_at: string | null;
  replied_at: string | null;
  error: string | null;
  notes: string | null;
  contract_value: number | null;
  last_followup_at: string | null;
  template_id: string | null;
  domain: string | null;
  source: string;
  starred: boolean;
  bookmarked: boolean;
  archived: boolean;
  caen: string | null;
  created_at: string;
  updated_at: string;
};

export type Campaign = {
  id: string;
  name: string;
  region: string;
  category: string;
  max_results: number;
  found: number | null;
  new_leads: number | null;
  target: number;
  sources: string[];
  queries_total: number | null;
  queries_done: number;
  log: { query: string; source: string; found: number; new: number }[];
  status: "queued" | "discovering" | "done" | "failed";
  created_at: string;
};

export async function logEvent(leadId: string, step: string, message?: string, payload?: unknown) {
  await db.from("lead_events").insert({ lead_id: leadId, step, message, payload: payload ?? null });
}

export async function setStatus(leadId: string, status: LeadStatus, extra: Partial<Lead> = {}) {
  const { error } = await db.from("leads").update({ status, ...extra }).eq("id", leadId);
  if (error) throw new Error(`setStatus(${status}) failed: ${error.message}`);
}

export function slugify(s: string) {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
    .slice(0, 60);
}
