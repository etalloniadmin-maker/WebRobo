"use server";

import { revalidatePath } from "next/cache";
import { saveSettings, SECRET_KEYS, type Settings } from "@/lib/settings";

const FIELDS: (keyof Settings)[] = [
  "openrouter_api_key", "openrouter_base_url", "google_places_api_key", "resend_api_key", "screenshot_api_url", "screenshot_api_key",
  "model_judge", "model_extract", "model_mockup", "model_email",
  "sender_name", "sender_company", "email_from", "email_reply_to", "app_url",
  "old_site_threshold", "auto_generate",
];

export async function updateSettings(formData: FormData) {
  const patch: Record<string, unknown> = {};
  for (const k of FIELDS) {
    if (!formData.has(k) && k !== "auto_generate") continue;
    const raw = String(formData.get(k) ?? "").trim();
    if (k === "auto_generate") { patch[k] = formData.get(k) === "on"; continue; }
    if (k === "old_site_threshold") { patch[k] = Number(raw) || 40; continue; }
    // cheile secrete: câmp gol = păstrează valoarea existentă; "-" = șterge
    if (SECRET_KEYS.includes(k)) {
      if (raw === "") continue;
      patch[k] = raw === "-" ? "" : raw;
      continue;
    }
    patch[k] = raw;
  }
  await saveSettings(patch);
  revalidatePath("/settings");
}
