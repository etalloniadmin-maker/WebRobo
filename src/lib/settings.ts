import { db } from "./supabase";

// Setările aplicației: valorile din DB (pagina /settings) au prioritate; .env.local e fallback.
export type Settings = {
  // chei
  openrouter_api_key: string;
  openrouter_base_url: string;
  google_places_api_key: string;
  resend_api_key: string;
  screenshot_api_url: string;
  screenshot_api_key: string;
  // modele per sarcină
  model_judge: string;
  model_extract: string;
  model_mockup: string;
  model_email: string;
  // expeditor
  sender_name: string;
  sender_company: string;
  email_from: string;
  email_reply_to: string;
  app_url: string;
  // pipeline
  old_site_threshold: number;
  auto_generate: boolean;
};

export const SECRET_KEYS: (keyof Settings)[] = ["openrouter_api_key", "google_places_api_key", "resend_api_key", "screenshot_api_key"];

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

function envDefaults(): Settings {
  const e = process.env;
  const m = e.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  return {
    openrouter_api_key: e.OPENROUTER_API_KEY ?? "",
    openrouter_base_url: e.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    google_places_api_key: e.GOOGLE_PLACES_API_KEY ?? "",
    resend_api_key: e.RESEND_API_KEY ?? "",
    screenshot_api_url: e.SCREENSHOT_API_URL ?? "",
    screenshot_api_key: e.SCREENSHOT_API_KEY ?? "",
    model_judge: m,
    model_extract: m,
    model_mockup: m,
    model_email: m,
    sender_name: e.SENDER_NAME ?? "",
    sender_company: e.SENDER_COMPANY ?? "",
    email_from: e.EMAIL_FROM ?? "",
    email_reply_to: e.EMAIL_REPLY_TO ?? "",
    app_url: e.APP_URL ?? "http://localhost:3000",
    old_site_threshold: Number(e.OLD_SITE_THRESHOLD ?? 40),
    auto_generate: e.AUTO_GENERATE !== "false",
  };
}

let cache: { at: number; value: Settings } | null = null;

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 10_000) return cache.value;
  const base = envDefaults();
  const { data } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  const over = (data?.data ?? {}) as Partial<Record<keyof Settings, unknown>>;
  const merged = { ...base } as Settings;
  for (const k of Object.keys(base) as (keyof Settings)[]) {
    const v = over[k];
    if (v === undefined || v === null || v === "") continue;
    (merged as Record<string, unknown>)[k] = typeof base[k] === "number" ? Number(v) : typeof base[k] === "boolean" ? v === true || v === "true" : String(v);
  }
  cache = { at: Date.now(), value: merged };
  return merged;
}

export async function saveSettings(patch: Partial<Record<keyof Settings, unknown>>) {
  const { data } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  const next = { ...((data?.data as object) ?? {}), ...patch };
  const { error } = await db.from("settings").upsert({ id: 1, data: next });
  if (error) throw new Error(error.message);
  cache = null;
}

// Care setări vin din DB (ca să arătăm în UI "setat aici" vs "din .env")
export async function settingsSource(): Promise<Record<string, "db" | "env" | "none">> {
  const { data } = await db.from("settings").select("data").eq("id", 1).maybeSingle();
  const over = (data?.data ?? {}) as Record<string, unknown>;
  const env = envDefaults();
  const out: Record<string, "db" | "env" | "none"> = {};
  for (const k of Object.keys(env)) {
    out[k] = over[k] !== undefined && over[k] !== "" ? "db" : (env as Record<string, unknown>)[k] !== "" ? "env" : "none";
  }
  return out;
}
