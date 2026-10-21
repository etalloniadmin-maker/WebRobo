# Web Robo

Platformă internă pentru prospectare B2B cu agenți AI: găsește firme locale dintr-o regiune, detectează site-urile învechite (sau lipsa unui site), generează un prototip de homepage pentru fiecare, și trimite — doar la aprobarea ta — un email de propunere cu link către prototip.

```
 Descoperire  →  Prototip  →  Review  →  Trimis  →  Contract        🗑 Gunoi
 (Places/OSM/    (LLM:        (tu:       (Resend,    (negociere,     (nu reintră
  CSV + audit)    site+email)  aprobi)    tracking)   câștigat/      niciodată
                                                      pierdut)       automat)
```

---

## 1. Stack

| Strat | Tehnologie | Rol |
|---|---|---|
| UI + API | **Next.js 14** (App Router, Server Components, Server Actions) | dashboard, rute de preview, webhook-uri |
| Bază de date | **Supabase** (Postgres) | lead-uri, campanii, șabloane, setări, jurnal |
| Joburi în fundal | **Inngest** | pașii pipeline-ului, cu retry, concurență limitată, idempotență; UI local pe `:8288` |
| LLM | **OpenRouter** (compatibil OpenAI; merge și Ollama local) | audit vizual, extragere conținut, generare HTML, personalizare email |
| Surse de firme | Google Places API (New), OpenStreetMap/Nominatim, import CSV | descoperire |
| Email | **Resend** | trimitere + webhook `email.opened` |
| Screenshot | ScreenshotOne / Browserless (opțional) | imagine a prototipului în email |
| Stil | Tailwind CSS | |

Nu există server separat: Next.js servește și UI-ul, și endpoint-ul `/api/inngest` prin care Inngest execută funcțiile.

---

## 2. Structura proiectului

```
src/
├─ app/
│  ├─ page.tsx                   → redirect la /flow/discovery
│  ├─ layout.tsx                 → meniul (Pipeline · Șabloane email · Setări)
│  ├─ actions.ts                 → Server Actions: campanii, mutări de etapă, trimitere, marcaje, bulk
│  ├─ flow/[stage]/page.tsx      → tabelul unei etape (sau al unui view ★🔖📦), sortare, acțiuni per rând
│  ├─ leads/[id]/page.tsx        → pagina unui lead: tab "Site nou" + tab "Email" (șablon, editare, preview)
│  ├─ templates/                 → CRUD șabloane de email, preview cu date de exemplu
│  ├─ settings/                  → chei API, modele LLM per sarcină, expeditor, prag, auto-generare
│  ├─ import/actions.ts          → import CSV (listafirme / termene / propriu)
│  ├─ preview/[slug]/route.ts    → servește HTML-ul prototipului (public, noindex, cu banner "propunere")
│  └─ api/
│     ├─ inngest/route.ts        → endpoint-ul prin care rulează funcțiile Inngest
│     ├─ email-preview/[id]      → randarea exactă a emailului (pentru iframe-ul din Review)
│     ├─ webhooks/resend         → marchează "deschis"
│     └─ unsubscribe             → dezabonare + ștergerea prototipului
├─ lib/
│  ├─ supabase.ts                → client (service role, doar server) + tipuri Lead/Campaign + helpers
│  ├─ stages.ts                  → definiția etapelor (status → etapă) și a view-urilor (marcaje)
│  ├─ settings.ts                → setări: DB (pagina Setări) > .env.local; cache 10s
│  ├─ sources.ts                 → surse de firme + dedublare (place_id, domeniu) + inserare
│  ├─ places.ts                  → Google Places Text Search
│  ├─ audit.ts                   → fetch homepage, heuristici "site vechi", extragere text, email/telefon, pagini de contact
│  ├─ llm.ts                     → apelurile LLM (judge, extract, mockup, personalize email, expandQueries, listModels)
│  ├─ draft.ts                   → construiește draftul de email dintr-un șablon (+ AI opțional)
│  ├─ email.ts                   → variabile șablon, randare HTML, trimitere Resend
│  ├─ screenshot.ts              → screenshot opțional → Supabase Storage
│  └─ inngest/
│     ├─ client.ts               → evenimentele tipate
│     └─ functions/
│        ├─ discover.ts          → campanie → "caută până găsești N"
│        ├─ audit.ts             → lead → scor site vechi + email/telefon
│        ├─ generate.ts          → lead → extragere → HTML → screenshot → draft email
│        └─ send.ts              → lead aprobat → Resend
└─ components/                   → StageTabs, StatusBadge, ModelPicker

supabase/migrations/             → 001…006, în ordine (rulează-le în SQL Editor)
```

---

## 3. Modelul de date

**`campaigns`** — o căutare: `category`, `region`, `target` (câte firme noi), `sources[]`, progres (`queries_done/queries_total`, `found`, `new_leads`, `log`).

**`leads`** — o firmă. Câmpuri importante:
- identitate: `name`, `address`, `phone`, `email`, `website`, `domain` (normalizat, unic), `place_id` (unic), `cui`, `caen`, `source`
- pipeline: `status` (enum), `campaign_id`, `template_id`, `error`
- audit: `audit` (jsonb), `old_site_score` (0–100), `old_site_reason`
- generare: `extracted` (jsonb), `mockup_html`, `mockup_screenshot_url`
- email: `email_subject`, `email_body`, `sent_at`, `resend_id`, `opened_at`, `replied_at`
- contract: `notes`, `contract_value`
- marcaje: `starred`, `bookmarked`, `archived` — nu afectează etapa

**`lead_events`** — jurnal per lead (pas, mesaj, payload). Apare în pagina lead-ului.

**`email_templates`** — `subject`, `body` cu `{{variabile}}`, `ai_rewrite`, `is_default`.

**`settings`** — un singur rând, `data` jsonb; valorile de aici au prioritate peste `.env.local`.

### Statusuri → etape (`src/lib/stages.ts`)

| Etapă | Statusuri |
|---|---|
| 1 Descoperire | `discovered`, `no_website`, `auditing`, `audited` |
| 2 Prototip | `generating`, `failed` |
| 3 Review | `mockup_ready` |
| 4 Trimis | `approved`, `sending`, `sent` |
| 5 Contract | `replied`, `negotiating`, `won`, `lost` |
| 🗑 Gunoi | `rejected` |

Etapa e **derivată din status**; nu există o coloană separată. Un lead e într-o singură etapă la un moment dat. View-urile ★ 🔖 📦 sunt filtre transversale pe marcaje, nu etape.

---

## 4. Pipeline-ul (Inngest)

Fiecare pas e o funcție Inngest declanșată de un eveniment. Pașii sunt memorizați (`step.run`), deci un retry nu reface ce a reușit deja.

### `campaign/discover` → `discover.ts`
1. LLM (`expandQueries`) generează până la 15 variante: sinonime ale categoriei × localități din regiune.
2. Pentru fiecare variantă × sursă bifată: caută, **dedublează** (pe `place_id` și pe `domain`, inclusiv față de Gunoi), inserează doar necunoscutele, actualizează progresul.
3. Se oprește când `new_leads ≥ target` sau când se termină variantele.
4. Trimite `lead/audit` pentru firmele noi care au site.
- `idempotency` pe `campaignId` + `concurrency 1` → nu rulează niciodată de două ori aceeași campanie.

### `lead/audit` → `audit.ts`
1. Dacă „site-ul” e Facebook/Booking/etc. → `no_website` (candidat bun, dar nimic de auditat).
2. Fetch homepage → heuristici tehnice (`auditHtml`: viewport, HTTPS, tabele, Flash, jQuery 1.x, © an, generator vechi) → scor tehnic.
3. LLM (`judgeSiteAge`) judecă HTML-ul: „arată învechit?” → scor 0–100. **Scor final = 40% tehnic + 60% LLM.**
4. Email + telefon: homepage, apoi pagini de contact (`findContactInfo`), cu de-obfuscare `[at]`/`%20` și preferință pentru `office@`/`contact@`.
5. Sub prag (`old_site_threshold`, default 40) → `rejected`. Altfel, dacă `auto_generate` → `lead/generate`.

### `lead/generate` → `generate.ts`
1. `extractBusiness`: din textul site-ului (sau doar din datele Google dacă nu are site) → tagline, despre, servicii, culori.
2. `generateMockup`: o pagină HTML completă (Tailwind CDN, fără imagini externe), salvată în `mockup_html`.
3. Screenshot (dacă e configurat) → Storage.
4. `buildDraft`: șablonul lead-ului (sau implicitul) cu variabilele completate; dacă șablonul are `ai_rewrite`, LLM-ul personalizează.
5. → `mockup_ready` (apare în Review).

### `lead/send` → `send.ts`
Doar din butoanele „Trimite” / „Aprobă și trimite”. Verifică `status = approved`, email și draft, trimite prin Resend, → `sent`. `throttle: 30/h`.

### Modele LLM per sarcină
`model_judge`, `model_extract`, `model_mockup`, `model_email` — setabile în Setări, cu lista live de pe OpenRouter și filtru „doar gratuite”. Recomandare: gratuite peste tot, plătit (Claude Sonnet / GPT) doar pentru `model_mockup`.

---

## 5. Fluxul de UI

- **`/flow/[stage]`** — un singur component servește toate etapele și view-urile. Coloanele și acțiunile depind de `mode`. Acțiunile în masă (bife) merg prin `bulkAction`. Sortarea e server-side (`?sort=&dir=`).
- **Server Actions** (`app/actions.ts`) — toate mutațiile: creare campanie, `runStep` (trimite un eveniment Inngest), `setLeadStatus`, `approveAndSend*`, `applyTemplate`, `toggleFlag`, `findEmailAction`, `saveContract`. După fiecare, `revalidatePath("/", "layout")`.
- **Pagina lead-ului** — tab „Site nou” (iframe la `/preview/[slug]`) și tab „Email” (dropdown șablon → regenerare, editare, iframe la `/api/email-preview/[id]` = HTML-ul exact care pleacă).
- **Preview public** — `/preview/[slug]` adaugă banner „propunere, nu site oficial” + `noindex`; 404 dacă lead-ul e respins/dezabonat.

---

## 6. Setup

```bash
npm install
cp .env.example .env.local      # minim: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
# Supabase → SQL Editor → rulează supabase/migrations/001…006 în ordine
npm run dev                      # http://localhost:3000
npm run inngest                  # http://localhost:8288 (alt terminal)
```
Pe Mac ai și `1 - Instalare.command` / `2 - Porneste.command` (dublu-click). Cheile pentru OpenRouter, Google Places, Resend le pui din **Setări** (se salvează în DB) sau în `.env.local`.

**Producție:** Vercel (+ `APP_URL` pe domeniul public) → Inngest Cloud sincronizat la `https://<app>/api/inngest` (chei `INNGEST_EVENT_KEY`/`INNGEST_SIGNING_KEY`) → Resend cu domeniu verificat, ideal separat de cel principal → webhook `email.opened` la `/api/webhooks/resend`. Pune autentificare pe dashboard (Vercel Password Protection sau Supabase Auth) înainte să-l expui.

---

## 7. Reguli de siguranță încorporate

- **Nimic nu se trimite automat.** Singura cale spre Resend e un click al tău în Review.
- **Gunoiul e definitiv** (până la „Readu”): re-auditul și campaniile noi îl sar.
- **Dedublare** pe `place_id` + `domain`: o firmă există o singură dată, indiferent de sursă.
- **Un singur run per campanie** (idempotency), **max 15 căutări** per campanie, **30 emailuri/oră**.
- Prototipul e marcat vizibil ca propunere, are `noindex` și link de dezabonare care îl șterge.
- Cheile API nu apar niciodată în UI (mascate) și nu sunt în cod.

---

## 8. Unde modifici ce

| Vreau să… | Fișier |
|---|---|
| schimb cum se calculează „site vechi” | `lib/audit.ts` (`auditHtml`) + `lib/llm.ts` (`judgeSiteAge`) + ponderea 40/60 în `inngest/functions/audit.ts` |
| schimb prompturile (design, extragere, email) | `lib/llm.ts` |
| adaug o sursă de firme | `lib/sources.ts` (`runSource`, `SOURCES`) |
| adaug o etapă sau un status | `supabase/migrations` (enum) + `lib/stages.ts` + `components/StatusBadge.tsx` |
| adaug o variabilă de șablon | `lib/email.ts` (`TEMPLATE_VARS`, `templateVars`) |
| schimb limita de emailuri | `inngest/functions/send.ts` (`throttle`) |
| adaug o setare | `lib/settings.ts` (tip + default) + `app/settings/page.tsx` |

---

## 9. Costuri orientative / 100 firme

Google Places ~3 €, LLM pe modele gratuite 0 € (limită 50 cereri/zi; 1000/zi după ce ai pus o dată 10 $ credit), Claude Sonnet doar pentru site ~4 €, Resend gratuit până la 3000/lună, Vercel Hobby gratuit.

---

## 10. Ce nu există încă

- Autentificare pe dashboard.
- Verificarea semnăturii webhook-ului Resend.
- Detectarea automată a răspunsurilor (acum apeși „A răspuns →”).
- Follow-up automat după X zile (`step.sleep` în `send.ts` ar fi suficient).
- Teste automate.
