import { getSettings, settingsSource, SECRET_KEYS, type Settings } from "@/lib/settings";
import { listModels } from "@/lib/llm";
import { updateSettings } from "./actions";
import { ModelPicker } from "@/components/ModelPicker";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [s, src, models] = await Promise.all([getSettings(true), settingsSource(), listModels().catch(() => [])]);

  const mask = (v: string) => (v ? `${v.slice(0, 6)}…${v.slice(-4)}` : "");
  const Src = ({ k }: { k: keyof Settings }) => (
    <span className="ml-2 text-xs text-neutral-400">{src[k] === "db" ? "setat aici" : src[k] === "env" ? "din .env.local" : "nesetat"}</span>
  );

  return (
    <form action={updateSettings} className="mx-auto max-w-3xl space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Setări</h1>
        <button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">Salvează</button>
      </div>

      <Section title="Chei API" hint="Se salvează în baza ta Supabase. Câmp gol = păstrează cheia existentă; scrie „-” ca să ștergi.">
        {(["openrouter_api_key", "google_places_api_key", "resend_api_key", "screenshot_api_key"] as const).map((k) => (
          <Field key={k} label={labelOf(k)} extra={<Src k={k} />}>
            <input name={k} type="password" placeholder={s[k] ? mask(s[k]) : "lipsă"} autoComplete="off" className="w-full rounded border px-3 py-1.5 font-mono text-sm" />
          </Field>
        ))}
        <Field label="OpenRouter base URL" extra={<Src k="openrouter_base_url" />} hint="Pentru Ollama local: http://localhost:11434/v1">
          <input name="openrouter_base_url" defaultValue={s.openrouter_base_url} className="w-full rounded border px-3 py-1.5 font-mono text-sm" />
        </Field>
        <Field label="Screenshot API URL" extra={<Src k="screenshot_api_url" />} hint="Opțional (ScreenshotOne / Browserless). Fără el, emailul merge doar cu link.">
          <input name="screenshot_api_url" defaultValue={s.screenshot_api_url} className="w-full rounded border px-3 py-1.5 font-mono text-sm" />
        </Field>
      </Section>

      <Section title="Modele LLM" hint={`${models.length ? `${models.length} modele de pe OpenRouter, ${models.filter((m) => m.free).length} gratuite.` : "Nu am putut încărca lista — scrie ID-ul manual."} Modelele cu „JSON” suportă răspuns structurat (recomandat pentru audit / extragere / email).`}>
        <ModelPicker name="model_judge" label="Audit (judecă vechimea site-ului)" value={s.model_judge} models={models} hint="ieftin, mult volum" />
        <ModelPicker name="model_extract" label="Extragere conținut" value={s.model_extract} models={models} hint="JSON necesar" />
        <ModelPicker name="model_mockup" label="Generare site (HTML)" value={s.model_mockup} models={models} hint="aici contează calitatea — Claude Sonnet / GPT dau cel mai bun design" />
        <ModelPicker name="model_email" label="Personalizare email" value={s.model_email} models={models} hint="JSON necesar" />
      </Section>

      <Section title="Expeditor" hint="Apar în șabloane ({{expeditor}}, {{firma_expeditor}}) și în antetul emailului.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Numele tău"><input name="sender_name" defaultValue={s.sender_name} className="w-full rounded border px-3 py-1.5 text-sm" /></Field>
          <Field label="Firma ta"><input name="sender_company" defaultValue={s.sender_company} className="w-full rounded border px-3 py-1.5 text-sm" /></Field>
          <Field label="From (Resend)" hint='ex: Ovidiu <ovidiu@outreach.firma.ro> — domeniu verificat în Resend'>
            <input name="email_from" defaultValue={s.email_from} className="w-full rounded border px-3 py-1.5 text-sm" />
          </Field>
          <Field label="Reply-To" hint="unde ajung răspunsurile"><input name="email_reply_to" defaultValue={s.email_reply_to} className="w-full rounded border px-3 py-1.5 text-sm" /></Field>
        </div>
        <Field label="URL aplicație" hint="apare în link-urile din email; pe Vercel pune domeniul public">
          <input name="app_url" defaultValue={s.app_url} className="w-full rounded border px-3 py-1.5 font-mono text-sm" />
        </Field>
      </Section>

      <Section title="Pipeline">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prag „site vechi” (0–100)" hint="sub prag → Respinse automat la audit">
            <input name="old_site_threshold" type="number" min={0} max={100} defaultValue={s.old_site_threshold} className="w-32 rounded border px-3 py-1.5 text-sm" />
          </Field>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input name="auto_generate" type="checkbox" defaultChecked={s.auto_generate} />
            Generează prototipul automat după audit (altfel apeși tu ▶ Prototip)
          </label>
        </div>
      </Section>

      <div className="flex justify-end">
        <button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white hover:bg-neutral-700">Salvează</button>
      </div>
    </form>
  );
}

function labelOf(k: string) {
  return { openrouter_api_key: "OpenRouter API key", google_places_api_key: "Google Places API key", resend_api_key: "Resend API key", screenshot_api_key: "Screenshot API key" }[k] ?? k;
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-white p-5">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, extra, children }: { label: string; hint?: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-neutral-700">{label}</span>{extra}
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>}
    </label>
  );
}
