"use server";

import { revalidatePath } from "next/cache";
import { db, setStatus, type Lead, type LeadStatus } from "@/lib/supabase";
import { buildDraft } from "@/lib/draft";
import { fetchHomepage, findContactInfo, isThirdPartyUrl } from "@/lib/audit";
import { logEvent } from "@/lib/supabase";
import { inngest } from "@/lib/inngest/client";

export async function createCampaign(formData: FormData) {
  const region = String(formData.get("region") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const target = Math.max(1, Math.min(500, Number(formData.get("target") ?? 20)));
  const sources = formData.getAll("sources").map(String).filter(Boolean);
  if (!region || !category) return;

  const { data, error } = await db
    .from("campaigns")
    .insert({ name: `${category} · ${region}`, region, category, max_results: target, target, sources: sources.length ? sources : ["places"] })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await inngest.send({ name: "campaign/discover", data: { campaignId: data.id } });
  revalidatePath("/", "layout");
}

// Re-auditează toate lead-urile unei campanii (după schimbări la heuristici/prag).
export async function reauditCampaign(campaignId: string) {
  // Nu atingem gunoiul și nici ce e deja trimis/în contract.
  const { data } = await db.from("leads").select("id").eq("campaign_id", campaignId)
    .not("status", "in", "(rejected,sent,replied,sending,approved,negotiating,won,lost)");
  if (data?.length) {
    await inngest.send(data.map((l) => ({ name: "lead/audit" as const, data: { leadId: l.id } })));
  }
  revalidatePath("/", "layout");
}

export async function runStep(leadId: string, step: "audit" | "generate") {
  await inngest.send({ name: `lead/${step}`, data: { leadId } });
  revalidatePath(`/leads/${leadId}`);
}

export async function saveEmailDraft(leadId: string, formData: FormData) {
  await db
    .from("leads")
    .update({
      email: String(formData.get("email") ?? "").trim() || null,
      email_subject: String(formData.get("email_subject") ?? ""),
      email_body: String(formData.get("email_body") ?? ""),
    })
    .eq("id", leadId);
  revalidatePath(`/leads/${leadId}`);
}

// Schimbă șablonul unui lead și regenerează draftul (cu AI dacă șablonul o cere).
export async function applyTemplate(leadId: string, formData: FormData) {
  const templateId = String(formData.get("template_id") ?? "") || null;
  const { data } = await db.from("leads").select("*, campaigns(category)").eq("id", leadId).single();
  if (!data) return;
  const { campaigns, ...lead } = data as Lead & { campaigns: { category: string } | null };
  const draft = await buildDraft(lead, campaigns?.category ?? "firmă", templateId);
  await db.from("leads").update({ template_id: draft.templateId, email_subject: draft.subject, email_body: draft.body }).eq("id", leadId);
  revalidatePath(`/leads/${leadId}`);
}

export async function approveAndSend(leadId: string, formData: FormData) {
  await saveEmailDraft(leadId, formData);
  await setStatus(leadId, "approved");
  await inngest.send({ name: "lead/send", data: { leadId } });
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/", "layout");
}

// Trimite din tabel, cu draftul deja generat (fără editare).
export async function approveAndSendQuick(leadId: string) {
  const { data } = await db.from("leads").select("email, email_subject, email_body, mockup_html").eq("id", leadId).single();
  if (!data?.email || !data.email_subject || !data.email_body || !data.mockup_html) return;
  await setStatus(leadId, "approved");
  await inngest.send({ name: "lead/send", data: { leadId } });
  revalidatePath("/", "layout");
}

export async function setLeadStatus(leadId: string, status: LeadStatus) {
  const extra: Record<string, unknown> = {};
  if (status === "replied") extra.replied_at = new Date().toISOString();
  if (status === "rejected") extra.error = "respins manual";
  if (status === "audited") extra.error = null; // readus din gunoi
  await setStatus(leadId, status, extra);
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/", "layout");
}

// Caută email + telefon pe site-ul firmei (homepage + pagini de contact).
export async function findEmailAction(leadId: string) {
  await findEmailFor(leadId);
  revalidatePath("/", "layout");
}
async function findEmailFor(leadId: string) {
  const { data } = await db.from("leads").select("website, email, phone").eq("id", leadId).single();
  if (!data?.website || isThirdPartyUrl(data.website)) return;
  const page = await fetchHomepage(data.website);
  if (!page) return;
  const c = await findContactInfo(page.html, page.finalUrl);
  const patch: Record<string, unknown> = {};
  if (c.email && !data.email) patch.email = c.email;
  if (c.phone && !data.phone) patch.phone = c.phone;
  if (Object.keys(patch).length) {
    await db.from("leads").update(patch).eq("id", leadId);
    await logEvent(leadId, "email", c.email ? `găsit ${c.email}${c.from ? ` pe ${c.from}` : ""}` : "telefon găsit");
  } else {
    await logEvent(leadId, "email", "nu am găsit email pe site");
  }
}

// Marcaje: stea / bookmark / arhivă (nu schimbă etapa)
export async function toggleFlag(leadId: string, flag: "starred" | "bookmarked" | "archived") {
  const { data } = await db.from("leads").select(flag).eq("id", leadId).single();
  const cur = (data as Record<string, boolean> | null)?.[flag] ?? false;
  await db.from("leads").update({ [flag]: !cur }).eq("id", leadId);
  revalidatePath("/", "layout");
}

// Etapa Contract: notițe + valoare
export async function saveContract(leadId: string, formData: FormData) {
  const v = String(formData.get("contract_value") ?? "").replace(",", ".").trim();
  await db
    .from("leads")
    .update({ notes: String(formData.get("notes") ?? "") || null, contract_value: v ? Number(v) : null })
    .eq("id", leadId);
  revalidatePath("/", "layout");
}

// Acțiuni în masă dintr-o etapă (checkbox-uri)
export async function bulkAction(formData: FormData) {
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = String(formData.get("action") ?? "");
  if (!ids.length) return;
  if (action === "generate") {
    await inngest.send(ids.map((leadId) => ({ name: "lead/generate" as const, data: { leadId } })));
  } else if (action === "reject") {
    await db.from("leads").update({ status: "rejected", error: "respins manual" }).in("id", ids);
  } else if (action === "send") {
    const { data } = await db.from("leads").select("id").in("id", ids).eq("status", "mockup_ready").not("email", "is", null).not("mockup_html", "is", null);
    const ok = (data ?? []).map((l) => l.id as string);
    if (ok.length) {
      await db.from("leads").update({ status: "approved" }).in("id", ok);
      await inngest.send(ok.map((leadId) => ({ name: "lead/send" as const, data: { leadId } })));
    }
  } else if (action === "find_email") {
    for (const id of ids) await findEmailFor(id);
  } else if (action === "restore") {
    await db.from("leads").update({ status: "audited", error: null }).in("id", ids);
  }
  revalidatePath("/", "layout");
}
