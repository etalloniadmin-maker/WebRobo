import Link from "next/link";
import { db } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { fillTemplate, TEMPLATE_VARS, type EmailTemplate } from "@/lib/email";
import { deleteTemplate, duplicateTemplate, saveTemplate, setDefaultTemplate } from "./actions";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: { t?: string } }) {
  const [{ data }, s] = await Promise.all([db.from("email_templates").select("*").order("created_at"), getSettings()]);
  const templates = (data ?? []) as EmailTemplate[];
  const current = searchParams.t === "new" ? null : templates.find((t) => t.id === searchParams.t) ?? templates.find((t) => t.is_default) ?? templates[0] ?? null;

  // Exemplu de randare cu date fictive
  const sampleVars = {
    firma: "Pensiunea Exemplu", categorie: "pensiune", oras: "Bistrița", link: `${s.app_url}/preview/pensiunea-exemplu`,
    site_vechi: "www.pensiunea-exemplu.ro", motive: "nu e responsive, © 2016", expeditor: s.sender_name || "Ovidiu", firma_expeditor: s.sender_company || "Studio Web",
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Șabloane email</h1>
          <Link href="/templates?t=new" className="rounded bg-neutral-900 px-2.5 py-1 text-xs text-white">+ Nou</Link>
        </div>
        <ul className="space-y-1 text-sm">
          {templates.map((t) => (
            <li key={t.id}>
              <Link href={`/templates?t=${t.id}`} className={`block rounded px-2 py-1.5 hover:bg-neutral-100 ${current?.id === t.id ? "bg-neutral-100 font-medium" : ""}`}>
                {t.name}
                {t.is_default && <span className="ml-1 rounded bg-emerald-100 px-1 text-xs text-emerald-700">implicit</span>}
                {t.ai_rewrite && <span className="ml-1 text-xs text-violet-600">AI</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="rounded border bg-white p-3 text-xs text-neutral-600">
          <div className="mb-1 font-medium text-neutral-800">Variabile</div>
          {TEMPLATE_VARS.map((v) => (
            <div key={v.key} className="flex gap-2 py-0.5"><code className="text-neutral-900">{`{{${v.key}}}`}</code><span>{v.desc}</span></div>
          ))}
        </div>
      </aside>

      <section className="grid gap-6 xl:grid-cols-2">
        <form action={saveTemplate} className="space-y-3 rounded-lg border bg-white p-5">
          <input type="hidden" name="id" value={current?.id ?? ""} />
          <label className="block text-sm">Nume
            <input name="name" defaultValue={current?.name ?? ""} placeholder="ex: Propunere pensiuni" className="mt-1 w-full rounded border px-3 py-1.5" />
          </label>
          <label className="block text-sm">Subiect
            <input name="subject" defaultValue={current?.subject ?? "O idee pentru site-ul {{firma}}"} className="mt-1 w-full rounded border px-3 py-1.5" />
          </label>
          <label className="block text-sm">Mesaj
            <textarea name="body" rows={16} defaultValue={current?.body ?? ""} className="mt-1 w-full rounded border px-3 py-2 font-sans text-sm" />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input name="ai_rewrite" type="checkbox" defaultChecked={current?.ai_rewrite ?? false} className="mt-1" />
            <span>Personalizează cu AI<br /><span className="text-xs text-neutral-500">LLM-ul rescrie mesajul pentru fiecare firmă pornind de la acest șablon (păstrează linkurile și semnătura). Consumă un apel per lead.</span></span>
          </label>
          <div className="flex flex-wrap gap-2 pt-2">
            <button className="rounded bg-neutral-900 px-4 py-1.5 text-sm text-white hover:bg-neutral-700">Salvează</button>
            {current && !current.is_default && (
              <button formAction={setDefaultTemplate.bind(null, current.id)} className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-neutral-100">Fă implicit</button>
            )}
            {current && <button formAction={duplicateTemplate.bind(null, current.id)} className="rounded border bg-white px-3 py-1.5 text-sm hover:bg-neutral-100">Duplică</button>}
            {current && !current.is_default && (
              <button formAction={deleteTemplate.bind(null, current.id)} className="rounded border bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50">Șterge</button>
            )}
          </div>
        </form>

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-neutral-700">Cum arată (date de exemplu)</h2>
          <iframe
            srcDoc={previewDoc(fillTemplate(current?.subject ?? "", sampleVars), fillTemplate(current?.body ?? "", sampleVars))}
            className="h-[560px] w-full rounded-lg border bg-white"
            sandbox=""
          />
          <p className="text-xs text-neutral-400">Butonul „Vezi propunerea” și textul de dezabonare se adaugă automat la trimitere.</p>
        </div>
      </section>
    </div>
  );
}

function previewDoc(subject: string, body: string) {
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const paragraphs = body.split(/\n\s*\n/).map((p) => `<p style="margin:0 0 14px">${esc(p.trim()).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><body style="margin:0;padding:20px;background:#f6f6f6;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">
  <div style="max-width:600px;margin:0 auto;background:#fff;padding:24px;border-radius:10px">
    <div style="font-size:12px;color:#9ca3af;margin-bottom:4px">Subiect</div>
    <div style="font-weight:600;margin-bottom:18px;padding-bottom:12px;border-bottom:1px solid #eee">${esc(subject)}</div>
    ${paragraphs}
    <p><span style="display:inline-block;background:#111827;color:#fff;padding:10px 18px;border-radius:6px">Vezi propunerea</span></p>
  </div></body>`;
}
