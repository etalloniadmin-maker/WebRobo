import Link from "next/link";
import { db, type Campaign, type Lead } from "@/lib/supabase";
import { STAGES, stageByKey, stageOf, viewByKey, VIEWS } from "@/lib/stages";
import { StageTabs } from "@/components/StageTabs";
import { StatusBadge } from "@/components/StatusBadge";
import { applyTemplate, approveAndSendQuick, bulkAction, createCampaign, findEmailAction, reauditCampaign, runStep, saveContract, setLeadStatus, toggleFlag } from "@/app/actions";
import type { EmailTemplate } from "@/lib/email";
import { importCsv } from "@/app/import/actions";
import { SOURCES } from "@/lib/sources";

export const dynamic = "force-dynamic";

const SORTS: Record<string, string> = { name: "name", site: "domain", score: "old_site_score", status: "status", email: "email", updated: "updated_at" };

export default async function FlowPage({ params, searchParams }: { params: { stage: string }; searchParams: { c?: string; sort?: string; dir?: string } }) {
  const sortKey = SORTS[searchParams.sort ?? ""] ? searchParams.sort! : "updated";
  const dir: "asc" | "desc" = searchParams.dir === "asc" ? "asc" : searchParams.dir === "desc" ? "desc" : sortKey === "updated" ? "desc" : "asc";
  const view = viewByKey(params.stage);
  const stage = stageByKey(view ? "discovery" : params.stage);

  const [{ data: campaigns }, { data: allStatuses }, { data: tpls }, leadsRes] = await Promise.all([
    db.from("campaigns").select("*").order("created_at", { ascending: false }),
    db.from("leads").select("status, starred, bookmarked, archived"),
    db.from("email_templates").select("*").order("created_at"),
    (() => {
      let q = db.from("leads").select("*").order(SORTS[sortKey], { ascending: dir === "asc", nullsFirst: false }).limit(300);
      q = view ? q.eq(view.flag, true) : q.in("status", stage.statuses);
      if (searchParams.c) q = q.eq("campaign_id", searchParams.c);
      return q;
    })(),
  ]);
  const leads = (leadsRes.data ?? []) as Lead[];
  const templates = (tpls ?? []) as EmailTemplate[];

  const counts: Record<string, number> = {};
  for (const r of allStatuses ?? []) {
    const k = stageOf(r.status);
    counts[k] = (counts[k] ?? 0) + 1;
    for (const v of VIEWS) if ((r as Record<string, unknown>)[v.flag]) counts[v.key] = (counts[v.key] ?? 0) + 1;
  }

  const showSidebar = !view && stage.key === "discovery";
  const base = `/flow/${params.stage}${searchParams.c ? `?c=${searchParams.c}` : ""}`;
  const mode = view ? "view" : stage.key;

  return (
    <div>
      <StageTabs active={view ? view.key : stage.key} counts={counts} />
      <p className="mb-4 text-sm text-neutral-500">{view ? `${view.icon} ${view.label} — ${view.hint}` : stage.hint}</p>

      <div className={`grid gap-6 ${showSidebar ? "lg:grid-cols-[280px_1fr]" : ""}`}>
        {showSidebar && (
          <aside className="space-y-4">
            <form action={createCampaign} className="space-y-2 rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">Campanie nouă</h2>
              <input name="category" required placeholder="Categorie (ex: pensiune)" className="w-full rounded border px-2 py-1.5 text-sm" />
              <input name="region" required placeholder="Regiune (ex: Cluj-Napoca, Cluj)" className="w-full rounded border px-2 py-1.5 text-sm" />
              <label className="block text-xs text-neutral-500">Câte firme noi vrei
                <input name="target" type="number" defaultValue={20} min={1} max={500} className="mt-1 w-full rounded border px-2 py-1.5 text-sm" />
              </label>
              <div className="space-y-1 text-xs">
                {SOURCES.map((src) => (
                  <label key={src.key} className="flex items-start gap-2">
                    <input type="checkbox" name="sources" value={src.key} defaultChecked={src.key === "places"} className="mt-0.5" />
                    <span>{src.label} <span className="text-neutral-400">— {src.hint}</span></span>
                  </label>
                ))}
              </div>
              <button className="w-full rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Caută până găsesc</button>
              <p className="text-xs text-neutral-400">Robotul încearcă sinonime și localitățile din zonă (max 15 căutări) până atinge ținta. Firmele deja cunoscute nu se numără.</p>
            </form>

            <form action={importCsv} className="space-y-2 rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">Import listă (CSV)</h2>
              <p className="text-xs text-neutral-500">Export din listafirme.ro / termene.ro sau un CSV al tău. Coloane recunoscute: denumire, site, email, telefon, adresă, localitate, județ, CUI, CAEN.</p>
              <input name="file" type="file" accept=".csv,.txt,.tsv" required className="w-full text-xs" />
              <input name="category" placeholder="Categorie (pentru prototip, ex: pensiune)" className="w-full rounded border px-2 py-1.5 text-sm" />
              <button className="w-full rounded border bg-white px-3 py-1.5 text-sm hover:bg-neutral-100">Importă</button>
            </form>
            <div className="rounded-lg border bg-white p-4">
              <h2 className="mb-2 text-sm font-semibold">Campanii</h2>
              <ul className="space-y-1 text-sm">
                <li>
                  <Link href="/flow/discovery" className={`block rounded px-2 py-1 hover:bg-neutral-100 ${!searchParams.c ? "bg-neutral-100" : ""}`}>Toate</Link>
                </li>
                {((campaigns ?? []) as Campaign[]).map((c) => (
                  <li key={c.id} className="flex items-center gap-1">
                    <Link href={`/flow/discovery?c=${c.id}`} className={`block flex-1 truncate rounded px-2 py-1 hover:bg-neutral-100 ${searchParams.c === c.id ? "bg-neutral-100" : ""}`}>
                      {c.name}
                      <span className="ml-1 text-xs text-neutral-400">
                        {c.status === "discovering"
                          ? `caut… ${c.new_leads ?? 0}/${c.target} noi · ${c.queries_done}/${c.queries_total ?? "?"}`
                          : c.status === "done" && c.found != null
                          ? `${c.new_leads}/${c.target} noi · ${c.found} găsite`
                          : c.status}
                      </span>
                    </Link>
                    <form action={reauditCampaign.bind(null, c.id)}>
                      <button title="Re-auditează" className="rounded px-1.5 py-1 text-xs text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900">↻</button>
                    </form>
                  </li>
                ))}
                {!campaigns?.length && <li className="text-neutral-400">nicio campanie</li>}
              </ul>
            </div>
          </aside>
        )}

        <section>
          <form action={bulkAction}>
            <div className="mb-2 flex items-center gap-2 text-sm">
              <span className="text-neutral-400">Cu cele bifate:</span>
              {mode === "view" && <span className="text-neutral-300">— acțiunile sunt pe fiecare rând</span>}
              {mode === "discovery" && (
                <>
                  <BulkBtn action="generate" label="▶ Prototip" primary />
                  <BulkBtn action="find_email" label="🔍 Caută email" />
                  <BulkBtn action="reject" label="Respinge" />
                </>
              )}
              {mode === "review" && (
                <>
                  <BulkBtn action="send" label="✉ Trimite" primary />
                  <BulkBtn action="generate" label="Refă" />
                  <BulkBtn action="find_email" label="🔍 Caută email" />
                  <BulkBtn action="reject" label="Respinge" />
                </>
              )}
              {mode === "prototype" && <BulkBtn action="generate" label="Reîncearcă" />}
              {mode === "rejected" && <BulkBtn action="restore" label="↩ Readu în Descoperire" />}
              {(mode === "sent" || mode === "contract") && <span className="text-neutral-300">— acțiunile sunt pe fiecare rând</span>}
            </div>

            <div className="overflow-x-auto rounded-lg border bg-white">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="w-8 px-3 py-2"></th>
                    <Th k="name" label="Firmă" sortKey={sortKey} dir={dir} base={base} />
                    <Th k="site" label="Site actual" sortKey={sortKey} dir={dir} base={base} />
                    {mode === "discovery" && <Th k="score" label="Scor" sortKey={sortKey} dir={dir} base={base} />}
                    {mode === "view" && <th className="px-3 py-2">Etapă</th>}
                    <Th k="status" label="Status" sortKey={sortKey} dir={dir} base={base} />
                    <Th k="email" label="Email" sortKey={sortKey} dir={dir} base={base} />
                    {mode !== "discovery" && mode !== "rejected" && <th className="px-3 py-2">Site nou</th>}
                    {mode === "review" && <th className="px-3 py-2">Șablon</th>}
                    {mode === "sent" && <th className="px-3 py-2">Trimis / deschis</th>}
                    {mode === "contract" && <th className="px-3 py-2">Valoare</th>}
                    <th className="px-3 py-2">Acțiuni</th>
                    <th className="w-20 px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <Row key={l.id} l={l} stage={mode} templates={templates} />
                  ))}
                  {!leads.length && (
                    <tr>
                      <td colSpan={10} className="px-3 py-10 text-center text-neutral-400">
                        {mode === "discovery" ? "Nimic aici. Pornește o campanie din stânga." : mode === "view" ? "Nimic marcat încă." : "Nimic în această etapă."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </form>
          {mode === "review" && leads.map((l) => <form key={l.id} id={`tplform_${l.id}`} action={applyTemplate.bind(null, l.id)} />)}
        </section>
      </div>
    </div>
  );
}

function Th({ k, label, sortKey, dir, base }: { k: string; label: string; sortKey: string; dir: "asc" | "desc"; base: string }) {
  const active = sortKey === k;
  const nextDir = active && dir === "asc" ? "desc" : "asc";
  const sep = base.includes("?") ? "&" : "?";
  return (
    <th className="px-3 py-2">
      <Link href={`${base}${sep}sort=${k}&dir=${nextDir}`} className={`inline-flex items-center gap-1 hover:text-neutral-900 ${active ? "text-neutral-900" : ""}`}>
        {label}
        <span className={`text-[10px] ${active ? "" : "opacity-30"}`}>{active ? (dir === "asc" ? "▲" : "▼") : "▲▼"}</span>
      </Link>
    </th>
  );
}

function BulkBtn({ action, label, primary }: { action: string; label: string; primary?: boolean }) {
  return (
    <button name="action" value={action}
      className={`rounded px-2.5 py-1 text-xs ${primary ? "bg-neutral-900 text-white hover:bg-neutral-700" : "border bg-white hover:bg-neutral-100"}`}>
      {label}
    </button>
  );
}

function Row({ l, stage, templates }: { l: Lead; stage: string; templates: EmailTemplate[] }) {
  const busy = l.status === "generating" || l.status === "auditing" || l.status === "sending";
  const hasMockup = !!l.mockup_html;
  const previewUrl = `/preview/${l.slug}`;
  const site = l.website ? l.website.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("ro-RO", { day: "2-digit", month: "short" }) : null);

  const rowBg = l.starred ? "bg-yellow-50 hover:bg-yellow-100/70" : l.bookmarked ? "bg-sky-50/60 hover:bg-sky-50" : "hover:bg-neutral-50";
  const rowCls = `border-t align-top ${rowBg} ${l.archived ? "opacity-50" : ""}`;

  return (
    <tr className={rowCls}>
      <td className="px-3 py-2"><input type="checkbox" name="ids" value={l.id} className="mt-1" /></td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <SourceIcon l={l} />
          <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link>
        </div>
        <div className="max-w-[220px] truncate text-xs text-neutral-400">{l.address}{l.source && l.source !== "places" ? ` · ${l.source}` : ""}{l.cui ? ` · CUI ${l.cui}` : ""}</div>
        {stage === "discovery" && l.old_site_reason && <div className="max-w-[260px] truncate text-xs text-neutral-500">{l.old_site_reason}</div>}
        {l.error && <div className={`max-w-[260px] truncate text-xs ${stage === "rejected" ? "text-neutral-500" : "text-red-600"}`} title={l.error}>{l.error}</div>}
      </td>
      <td className="max-w-[160px] truncate px-3 py-2 text-neutral-500">
        {site ? <a href={l.website!} target="_blank" className="hover:underline">{site}</a> : <span className="text-amber-600">fără site</span>}
      </td>
      {stage === "discovery" && <td className="px-3 py-2 font-mono">{l.old_site_score ?? "—"}</td>}
      {stage === "view" && <td className="px-3 py-2 text-xs"><Link href={`/flow/${stageOf(l.status)}`} className="hover:underline">{stageByKey(stageOf(l.status)).label}</Link></td>}
      <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
      <td className="max-w-[180px] px-3 py-2 text-neutral-500">
        <div className="truncate">
          {l.email ?? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              lipsă
              {l.website && !["sent", "replied", "rejected"].includes(l.status) && (
                <button formAction={findEmailAction.bind(null, l.id)} title="Caută emailul pe site-ul lor (pagina de contact)" className="rounded border bg-white px-1 text-xs text-neutral-600 hover:bg-neutral-100">🔍</button>
              )}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-neutral-400">{l.phone ?? "—"}</div>
      </td>

      {stage !== "discovery" && stage !== "rejected" && (
        <td className="px-3 py-2">
          {hasMockup ? <a href={previewUrl} target="_blank" className="text-emerald-700 hover:underline">vezi ↗</a>
            : l.status === "generating" ? <span className="text-violet-600">se generează…</span>
            : <span className="text-neutral-300">—</span>}
        </td>
      )}
      {stage === "review" && (
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <select name="template_id" defaultValue={l.template_id ?? templates.find((t) => t.is_default)?.id ?? ""} form={`tplform_${l.id}`} className="max-w-[150px] rounded border px-1.5 py-1 text-xs">
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.ai_rewrite ? " (AI)" : ""}</option>)}
            </select>
            <button form={`tplform_${l.id}`} title="Aplică șablonul și regenerează emailul" className="rounded border bg-white px-1.5 py-1 text-xs hover:bg-neutral-100">↻</button>
          </div>
        </td>
      )}
      {stage === "sent" && (
        <td className="px-3 py-2 text-xs text-neutral-500">
          {fmt(l.sent_at) ?? "—"}{l.opened_at && <span className="text-emerald-700"> · deschis {fmt(l.opened_at)}</span>}
        </td>
      )}
      {stage === "contract" && (
        <td className="px-3 py-2">
          <form action={saveContract.bind(null, l.id)} className="flex flex-col gap-1">
            <input name="contract_value" defaultValue={l.contract_value ?? ""} placeholder="lei" className="w-24 rounded border px-2 py-1 text-xs" />
            <input name="notes" defaultValue={l.notes ?? ""} placeholder="notițe" className="w-48 rounded border px-2 py-1 text-xs" />
            <button className="self-start rounded border bg-white px-2 py-0.5 text-xs hover:bg-neutral-100">salvează</button>
          </form>
        </td>
      )}

      <td className="px-3 py-2">
        <div className="flex flex-nowrap gap-1">
          {(stage === "discovery" || stage === "view") && (
            <>
              <Btn action={runStep.bind(null, l.id, "generate")} label="▶ Prototip" disabled={busy || l.status === "rejected"} primary />
              <Btn action={setLeadStatus.bind(null, l.id, "rejected")} label="✕" title="Respinge (mută în Gunoi)" disabled={l.status === "rejected"} />
            </>
          )}
          {stage === "prototype" && (
            <>
              <Btn action={runStep.bind(null, l.id, "generate")} label={l.status === "failed" ? "Reîncearcă" : "…"} disabled={busy} />
              <Btn action={setLeadStatus.bind(null, l.id, "rejected")} label="✕" title="Respinge" />
            </>
          )}
          {stage === "review" && (
            <>
              <Btn action={approveAndSendQuick.bind(null, l.id)} label="✉ Trimite" disabled={!hasMockup || !l.email} primary
                title={!l.email ? "Lipsește emailul — adaugă-l din pagina lead-ului" : "Trimite draftul generat"} />
              <Btn action={runStep.bind(null, l.id, "generate")} label="Refă" />
              <Btn action={setLeadStatus.bind(null, l.id, "rejected")} label="✕" title="Respinge" />
            </>
          )}
          {stage === "sent" && (
            <>
              <Btn action={setLeadStatus.bind(null, l.id, "replied")} label="A răspuns →" primary disabled={l.status !== "sent"} />
              <Btn action={setLeadStatus.bind(null, l.id, "rejected")} label="✕" title="Fără răspuns, închide" />
            </>
          )}
          {stage === "contract" && (
            <>
              {l.status === "replied" && <Btn action={setLeadStatus.bind(null, l.id, "negotiating")} label="În negociere" />}
              {l.status !== "won" && l.status !== "lost" && <Btn action={setLeadStatus.bind(null, l.id, "won")} label="✓ Câștigat" primary />}
              {l.status !== "won" && l.status !== "lost" && <Btn action={setLeadStatus.bind(null, l.id, "lost")} label="Pierdut" />}
              {(l.status === "won" || l.status === "lost") && <Btn action={setLeadStatus.bind(null, l.id, "negotiating")} label="Redeschide" />}
            </>
          )}
          {stage === "rejected" && <Btn action={setLeadStatus.bind(null, l.id, "audited")} label="↩ Readu" />}
        </div>
      </td>
      <td className="px-2 py-2">
        <div className="flex gap-0.5">
          <Flag action={toggleFlag.bind(null, l.id, "starred")} on={l.starred} icon="★" title="Evidențiază" onCls="text-yellow-500" />
          <Flag action={toggleFlag.bind(null, l.id, "bookmarked")} on={l.bookmarked} icon="🔖" title="Bookmark" onCls="" />
          <Flag action={toggleFlag.bind(null, l.id, "archived")} on={l.archived} icon="📦" title="Arhivează" onCls="" />
        </div>
      </td>
    </tr>
  );
}

// Iconița sursei: favicon-ul real al platformei (booking.com, facebook, Google Maps, OSM), încărcat de la site-ul lor.
function SourceIcon({ l }: { l: Lead }) {
  const host = (() => { try { return l.website ? new URL(l.website).hostname.replace(/^www\./, "") : null; } catch { return null; } })();
  let domain: string, title: string;
  if (host && /booking\.com$/.test(host)) { domain = "booking.com"; title = "Listat pe Booking.com (fără site propriu)"; }
  else if (host && /(facebook|fb)\.com$/.test(host)) { domain = "facebook.com"; title = "Doar pagină de Facebook"; }
  else if (host && /instagram\.com$/.test(host)) { domain = "instagram.com"; title = "Doar pagină de Instagram"; }
  else if (l.source === "osm") { domain = "openstreetmap.org"; title = "Găsit pe OpenStreetMap"; }
  else if (l.source === "csv") { return <span title="Importat din CSV" className="text-xs">📄</span>; }
  else { domain = "maps.google.com"; title = "Găsit pe Google Maps"; }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" title={title} width={16} height={16} className="h-4 w-4 shrink-0 rounded-sm" />;
}

function Flag({ action, on, icon, title, onCls }: { action: () => Promise<void>; on: boolean; icon: string; title: string; onCls: string }) {
  return (
    <button formAction={action} title={title}
      className={`rounded px-1 text-sm leading-6 transition ${on ? `${onCls} opacity-100` : "opacity-20 grayscale hover:opacity-70 hover:grayscale-0"}`}>
      {icon}
    </button>
  );
}

function Btn({ action, label, disabled, primary, title }: { action: () => Promise<void>; label: string; disabled?: boolean; primary?: boolean; title?: string }) {
  return (
    <button formAction={action} disabled={disabled} title={title}
      className={`rounded px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-30 ${
        primary ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border bg-white hover:bg-neutral-100"
      }`}>
      {label}
    </button>
  );
}
