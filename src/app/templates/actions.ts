"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";

export async function saveTemplate(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const row = {
    name: String(formData.get("name") ?? "").trim() || "Fără nume",
    subject: String(formData.get("subject") ?? ""),
    body: String(formData.get("body") ?? ""),
    ai_rewrite: formData.get("ai_rewrite") === "on",
  };
  let newId = id;
  if (id) {
    await db.from("email_templates").update(row).eq("id", id);
  } else {
    const { data } = await db.from("email_templates").insert(row).select("id").single();
    newId = data!.id;
  }
  revalidatePath("/templates");
  redirect(`/templates?t=${newId}`);
}

export async function setDefaultTemplate(id: string) {
  await db.from("email_templates").update({ is_default: false }).neq("id", id);
  await db.from("email_templates").update({ is_default: true }).eq("id", id);
  revalidatePath("/templates");
}

export async function duplicateTemplate(id: string) {
  const { data } = await db.from("email_templates").select("*").eq("id", id).single();
  if (!data) return;
  const { data: n } = await db
    .from("email_templates")
    .insert({ name: `${data.name} (copie)`, subject: data.subject, body: data.body, ai_rewrite: data.ai_rewrite })
    .select("id")
    .single();
  revalidatePath("/templates");
  redirect(`/templates?t=${n!.id}`);
}

export async function deleteTemplate(id: string) {
  const { data } = await db.from("email_templates").select("is_default").eq("id", id).single();
  if (data?.is_default) return; // nu ștergem implicitul
  await db.from("email_templates").delete().eq("id", id);
  revalidatePath("/templates");
  redirect("/templates");
}
