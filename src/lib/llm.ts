import { z } from "zod";
import type { Extracted } from "./supabase";
import { getSettings } from "./settings";

// OpenRouter — compatibil OpenAI. Modelul și cheia vin din /settings (sau .env.local).
// Pentru LLM local: openrouter_base_url = http://localhost:11434/v1 (Ollama) și orice cheie.

type Task = "judge" | "extract" | "mockup" | "email";

async function chat(task: Task, messages: { role: "system" | "user"; content: string }[], opts: { json?: boolean; maxTokens?: number } = {}) {
  const s = await getSettings();
  const model = s[`model_${task}`] || s.model_mockup;
  if (!s.openrouter_api_key) throw new Error("Lipsește cheia OpenRouter (Setări → Chei API)");

  const res = await fetch(`${s.openrouter_base_url.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.openrouter_api_key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": s.app_url,
      "X-Title": "web-robo",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? 4000,
      temperature: 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status} (${model}): ${await res.text()}`);
  const json = await res.json();
  const content = (json.choices?.[0]?.message?.content ?? "") as string;
  return opts.json ? stripFences(content) : content;
}

function stripFences(s: string) {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (m) return m[1];
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  return a >= 0 && b > a ? t.slice(a, b + 1) : t;
}

const ExtractedSchema = z.object({
  tagline: z.string(),
  about: z.string(),
  services: z.array(z.string()).max(8),
  phone: z.string().optional(),
  email: z.string().optional(),
  address: z.string().optional(),
  colors: z.array(z.string()).max(3).optional(),
  logo_url: z.string().optional(),
});

// Audit: cât de învechit pare site-ul, judecat din HTML.
export async function judgeSiteAge(siteText: string, htmlHead: string): Promise<{ score: number; reason: string }> {
  const raw = await chat(
    "judge",
    [
      {
        role: "system",
        content:
          "Ești un web designer care evaluează cât de învechit arată un site de firmă mică, judecând DOAR din HTML/CSS și text. Semnale de vechime: layout fix/tabele, CSS inline peste tot, fonturi Arial/Verdana/Times fără web fonts, imagini cu nume gen DSC_0001, slidere jQuery, lipsa secțiunilor moderne (hero, carduri), text stufos, 'Bine ați venit pe site-ul nostru', butoane Flash, contoare de vizitatori, lipsă structură semantică. Semnale de modernitate: Tailwind/Bootstrap 5, grid/flex, web fonts, componente, Next/Nuxt/WordPress recent cu blocuri. Răspunzi DOAR JSON: {\"score\": 0-100 (100 = sigur arată învechit și ar beneficia de redesign), \"reason\": max 12 cuvinte în română}.",
      },
      { role: "user", content: `TEXT:\n${siteText}\n\nHTML (început):\n${htmlHead}` },
    ],
    { json: true, maxTokens: 150 }
  );
  const j = JSON.parse(raw);
  return { score: Math.max(0, Math.min(100, Number(j.score) || 0)), reason: String(j.reason ?? "") };
}

// Extrage esența afacerii din site-ul vechi (sau o inventează plauzibil dacă nu există site).
export async function extractBusiness(input: { name: string; category: string; siteText: string; address?: string; phone?: string }): Promise<Extracted> {
  const raw = await chat(
    "extract",
    [
      {
        role: "system",
        content:
          "Ești un copywriter român. Primești textul brut al unui site vechi de firmă și extragi esența afacerii, în română, concis și fără clișee. Răspunzi DOAR cu JSON.",
      },
      {
        role: "user",
        content: `Firma: ${input.name} (${input.category})
Adresă (din Google): ${input.address ?? "-"}
Telefon (din Google): ${input.phone ?? "-"}

TEXT SITE:
${input.siteText || "(nu există site — scrie un text plauzibil, generic dar credibil, pentru categoria dată)"}

Returnează JSON cu: tagline (max 10 cuvinte), about (2-3 propoziții), services (3-8 servicii scurte), phone, email, address, colors (1-3 culori hex sugerate de brand, dacă se pot deduce), logo_url (dacă există în text).`,
      },
    ],
    { json: true, maxTokens: 1200 }
  );
  return ExtractedSchema.parse(JSON.parse(raw));
}

// Homepage-ul nou ca HTML complet, self-contained.
export async function generateMockup(input: { name: string; category: string; extracted: Extracted }): Promise<string> {
  const e = input.extracted;
  const html = await chat(
    "mockup",
    [
      {
        role: "system",
        content: `Ești un web designer senior. Produci O SINGURĂ pagină HTML completă, modernă, responsive, folosind Tailwind prin CDN (<script src="https://cdn.tailwindcss.com"></script>) și Google Fonts. Fără framework JS, fără imagini externe (folosește gradienturi, forme SVG inline, emoji discret sau placeholdere elegante). Textul este în română, cu diacritice. Stil: curat, mult spațiu alb, o culoare de accent, tipografie clară. Secțiuni: hero cu CTA (telefon), servicii (carduri), despre, de ce noi (3 beneficii), contact (adresă, telefon, email) și footer. Nu adăuga comentarii sau explicații — răspunsul este DOAR codul HTML, începând cu <!DOCTYPE html>.`,
      },
      {
        role: "user",
        content: `Firma: ${input.name}
Categorie: ${input.category}
Tagline: ${e.tagline}
Despre: ${e.about}
Servicii: ${e.services.join("; ")}
Telefon: ${e.phone ?? "-"}
Email: ${e.email ?? "-"}
Adresă: ${e.address ?? "-"}
Culori sugerate: ${e.colors?.join(", ") ?? "alege tu, potrivit domeniului"}`,
      },
    ],
    { maxTokens: 6000 }
  );
  return html.replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

// Email: pornind de la un șablon deja completat, LLM-ul îl personalizează (dacă șablonul are ai_rewrite).
export async function personalizeEmail(input: {
  subject: string;
  body: string;
  name: string;
  category: string;
  reasons: string[];
  tagline?: string;
}): Promise<{ subject: string; body: string }> {
  const raw = await chat(
    "email",
    [
      {
        role: "system",
        content:
          "Primești un email șablon deja completat și detalii despre destinatar. Rescrie-l ca să sune personal și natural pentru acea firmă, în română cu diacritice, cu 'dumneavoastră', păstrând structura, lungimea (±20%), toate linkurile și semnătura exact ca în original. Fără limbaj agresiv de vânzări. Răspunzi DOAR JSON {\"subject\", \"body\"}; body-ul e text simplu, paragrafe separate prin linie goală.",
      },
      {
        role: "user",
        content: `Destinatar: ${input.name} (${input.category})${input.tagline ? ` — ${input.tagline}` : ""}
Observații despre site-ul lor: ${input.reasons.join(", ") || "-"}

SUBIECT: ${input.subject}

EMAIL:
${input.body}`,
      },
    ],
    { json: true, maxTokens: 900 }
  );
  const j = JSON.parse(raw);
  return { subject: String(j.subject || input.subject), body: String(j.body || input.body) };
}

// Variante de căutare: sinonime ale categoriei × localități din regiune. Folosit de "caută până găsești N".
export async function expandQueries(category: string, region: string, n = 12): Promise<string[]> {
  const fallback = [`${category} ${region}`, `${category} în ${region}`, `${category} județul ${region}`, `firma ${category} ${region}`];
  try {
    const raw = await chat(
      "extract",
      [
        {
          role: "system",
          content:
            "Generezi interogări pentru Google Maps ca să găsești firme locale din România. Răspunzi DOAR JSON: {\"queries\": [...]} — fiecare interogare = un sinonim/termen înrudit al categoriei + o localitate (orașe și comune mai mari din regiunea dată, inclusiv regiunea însăși). Fără duplicate, fără explicații.",
        },
        { role: "user", content: `Categorie: ${category}\nRegiune: ${region}\nNumăr de interogări: ${n}` },
      ],
      { json: true, maxTokens: 600 }
    );
    const j = JSON.parse(raw);
    const qs = Array.isArray(j.queries) ? j.queries.map(String).filter(Boolean) : [];
    const all = [...new Set([fallback[0], ...qs])];
    return all.slice(0, n);
  } catch {
    return fallback;
  }
}

// Lista de modele de pe OpenRouter (pentru pagina de setări).
export async function listModels(): Promise<{ id: string; name: string; free: boolean; context: number; json: boolean }[]> {
  const s = await getSettings();
  const res = await fetch(`${s.openrouter_base_url.replace(/\/$/, "")}/models`, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const j = await res.json();
  return ((j.data ?? []) as Array<Record<string, unknown>>)
    .map((m) => ({
      id: String(m.id),
      name: String(m.name ?? m.id),
      free: String(m.id).endsWith(":free"),
      context: Number(m.context_length ?? 0),
      json: Array.isArray(m.supported_parameters) && (m.supported_parameters as string[]).includes("response_format"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
