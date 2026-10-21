import Link from "next/link";
import { notFound } from "next/navigation";
import { db, type Lead } from "@/lib/supabase";
import { stageByKey, stageOf } from "@/lib/stages";
import type { EmailTemplate } from "@/lib/email";
import { applyTemplate, approveAndSend, runStep, saveEmailDraft, setLeadStatus } from "@/app/actions";
import { StatusBadge } from "@/components/StatusBadge";

export const dynamic = "force-dynamic";

export default async function LeadPage({ params, searchParams }: { params: { id: string }; searchParams: { tab?: string } }) {
  const [{ data: lead }, { data: events }, { data: tpls }] = await Promise.all([
    db.from("leads").select("*").eq("id", params.id).single(),
    db.from("lead_events").select("*").eq("lead_id", params.id).order("created_at", { ascending: false }).limit(30),
    db.from("email_templates").select("*").order("created_at"),
  ]);
  if (!lead) notFound();
  const l = lead as Lead;
  const templates = (tpls ?? []) as EmailTemplate[];
  const tab = searchParams.tab === "email" ? "email" : "site";
  const previewUrl = `/preview/${l.slug}`;
  const canSend = (l.status === "mockup_ready" || l.status === "failed") && !!l.mockup_html;
  const stage = stageOf(l.status);
  const currentTpl = templates.find((t) => t.id === l.template_id) ?? templates.find((t) => t.is_default);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/flow/${stage}`} className="text-sm text-neutral-500 hover:underline">← {stageByKey(stage).label}</Link>
          <h1 className="text-2xl font-semibold">{l.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-500">
            <StatusBadge status={l.status} />
            {l.website && <a href={l.website} target="_blank" className="hover:underline">{l.website.replace(/^https?:\/\//, "")}</a>}
            {l.phone && <span>· {l.phone}</span>}
            {l.address && <span>· {l.address}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <form action={runStep.bind(null, l.id, "audit")}><button className="rounded border bg-white px-3 py-1.5 hover:bg-neutral-100">Re-audit</button></form>
          <form action={runStep.bind(null, l.id, "generate")}><button className="rounded border bg-white px-3 py-1.5 hover:bg-neutral-100">{l.mockup_html ? "Regenerează site" : "▶ Generează site"}</button></form>
          {l.status === "sent" && <form action={setLeadStatus.bind(null, l.id, "replied")}><button className="rounded border bg-white px-3 py-1.5 hover:bg-neutral-100">A răspuns →</button></form>}
          {(l.status === "replied" || l.status === "negotiating") && (
            <>
              <form action={setLeadStatus.bind(null, l.id, "won")}><button className="rounded bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700">✓ Câștigat</button></form>
              <form action={setLeadStatus.bind(null, l.id, "lost")}><button className="rounded border bg-white px-3 py-1.5 hover:bg-neutral-100">Pierdut</button></form>
            </>
          )}
          <form action={setLeadStatus.bind(null, l.id, "rejected")}><button className="rounded border bg-white px-3 py-1.5 text-red-600 hover:bg-red-50">Respinge</button></form>
        </div>
      </div>

      {l.error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{l.error}</div>}

      {/* Tabs */}
      <nav className="flex gap-1 border-b text-sm">
        <Tab href={`/leads/${l.id}`} active={tab === "site"}>Site nou</Tab>
        <Tab href={`/leads/${l.id}?tab=email`} active={tab === "email"}>Email {l.email_body ? "" : "(fără draft)"}</Tab>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left */}
        {tab === "site" ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">Prototip homepage</span>
              {l.mockup_html && <a href={previewUrl} target="_blank" className="text-neutral-500 hover:underline">deschide în tab nou ↗</a>}
            </div>
            {l.mockup_html ? (
              <iframe src={previewUrl} className="h-[760px] w-full rounded-lg border bg-white" sandbox="allow-scripts" />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-neutral-400">
                {l.status === "generating" ? "se generează…" : "nu există prototip încă — apasă ▶ Generează site"}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <form action={applyTemplate.bind(null, l.id)} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 text-sm">
              <span className="text-neutral-600">Șablon:</span>
              <select name="template_id" defaultValue={currentTpl?.id ?? ""} className="rounded border px-2 py-1">
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}{t.ai_rewrite ? " (AI)" : ""}{t.is_default ? " · implicit" : ""}</option>
                ))}
              </select>
              <button className="rounded border bg-white px-3 py-1 hover:bg-neutral-100">Aplică → regenerează draftul</button>
              <Link href="/templates" className="ml-auto text-xs text-neutral-400 hover:underline">editează șabloanele</Link>
            </form>

            <form className="space-y-2 rounded-lg border bg-white p-4 text-sm">
              <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                <label className="block text-xs text-neutral-500">Către
                  <input name="email" defaultValue={l.email ?? ""} placeholder="contact@firma.ro" className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
                </label>
                <label className="block text-xs text-neutral-500">Subiect
                  <input name="email_subject" defaultValue={l.email_subject ?? ""} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
                </label>
              </div>
              <label className="block text-xs text-neutral-500">Mesaj
                <textarea name="email_body" rows={12} defaultValue={l.email_body ?? ""} className="mt-1 w-full rounded border px-2 py-1.5 font-sans text-sm" />
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button formAction={saveEmailDraft.bind(null, l.id)} className="rounded border px-3 py-1.5 hover:bg-neutral-100">Salvează</button>
                <button formAction={approveAndSend.bind(null, l.id)} disabled={!canSend}
                  className="rounded bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40">
                  ✉ Aprobă și trimite
                </button>
                {!canSend && <span className="text-xs text-neutral-400">{l.mockup_html ? `status ${l.status}` : "întâi generează site-ul"}</span>}
                {l.sent_at && <span className="ml-auto text-xs text-neutral-500">trimis {new Date(l.sent_at).toLocaleString("ro-RO")}{l.opened_at && ` · deschis ${new Date(l.opened_at).toLocaleString("ro-RO")}`}</span>}
              </div>
            </form>

            <div className="space-y-1">
              <div className="text-xs font-medium text-neutral-500">Așa ajunge în inbox (după Salvează)</div>
              <iframe src={`/api/email-preview/${l.id}`} className="h-[520px] w-full rounded-lg border bg-neutral-100" sandbox="" />
            </div>
          </div>
        )}

        {/* Right */}
        <div className="space-y-5">
          <section className="rounded-lg border bg-white p-4 text-sm">
            <h2 className="mb-2 font-semibold">Audit site actual</h2>
            <div className="mb-1 text-3xl font-semibold">{l.old_site_score ?? "—"}<span className="text-base font-normal text-neutral-400">/100</span></div>
            <p className="text-neutral-600">{l.old_site_reason ?? "neauditat"}</p>
            {l.audit && (
              <dl className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-neutral-500">
                <dt>HTTPS</dt><dd>{l.audit.https ? "da" : "nu"}</dd>
                <dt>Responsive</dt><dd>{l.audit.hasViewport ? "da" : "nu"}</dd>
                <dt>Copyright</dt><dd>{l.audit.copyrightYear ?? "—"}</dd>
                <dt>Generator</dt><dd>{l.audit.generator ?? "—"}</dd>
                <dt>Judecată AI</dt><dd>{l.audit.llmScore ?? "—"}</dd>
              </dl>
            )}
          </section>

          {l.extracted && (
            <section className="rounded-lg border bg-white p-4 text-sm">
              <h2 className="mb-2 font-semibold">Ce a înțeles robotul</h2>
              <p className="font-medium">{l.extracted.tagline}</p>
              <p className="mt-1 text-neutral-600">{l.extracted.about}</p>
              <ul className="mt-2 list-inside list-disc text-xs text-neutral-500">{l.extracted.services.map((s) => <li key={s}>{s}</li>)}</ul>
            </section>
          )}

          <section className="rounded-lg border bg-white p-4 text-xs">
            <h2 className="mb-2 text-sm font-semibold">Jurnal</h2>
            <ul className="space-y-1 text-neutral-500">
              {(events ?? []).map((e) => (
                <li key={e.id}><span className="font-mono text-neutral-400">{new Date(e.created_at).toLocaleTimeString("ro-RO")}</span> <b className="text-neutral-700">{e.step}</b> {e.message}</li>
              ))}
              {!events?.length && <li>—</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`-mb-px border-b-2 px-3 py-2 ${active ? "border-neutral-900 font-medium" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>
      {children}
    </Link>
  );
}
