"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { inngest } from "@/lib/inngest/client";
import { insertNewLeads, type Found } from "@/lib/sources";

// Import CSV (listafirme.ro, termene.ro, export propriu). Detectează separatorul și coloanele după nume.
export async function importCsv(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || !file.size) return;
  const text = await file.text();
  const category = String(formData.get("category") ?? "").trim() || "import";
  const region = String(formData.get("region") ?? "").trim() || file.name;

  const rows = parseCsv(text);
  if (rows.length < 2) return;
  const header = rows[0].map((h) => h.toLowerCase().trim());
  const col = (...names: string[]) => header.findIndex((h) => names.some((n) => h.includes(n)));
  const iName = col("denumire", "nume", "name", "firma", "companie");
  const iSite = col("site", "web", "url", "domeniu");
  const iEmail = col("email", "e-mail");
  const iPhone = col("telefon", "phone", "tel");
  const iAddr = col("adres", "address", "sediu");
  const iCity = col("localitate", "oras", "oraș", "city");
  const iCounty = col("judet", "județ", "county");
  const iCui = col("cui", "cif", "cod fiscal");
  const iCaen = col("caen");
  if (iName < 0) throw new Error("Nu găsesc coloana cu numele firmei (denumire/nume/name)");

  const found: Found[] = rows.slice(1).filter((r) => r[iName]?.trim()).map((r) => ({
    source: "csv",
    name: r[iName].trim(),
    website: iSite >= 0 ? r[iSite]?.trim() || undefined : undefined,
    email: iEmail >= 0 ? r[iEmail]?.trim() || undefined : undefined,
    phone: iPhone >= 0 ? r[iPhone]?.trim() || undefined : undefined,
    address: [iAddr >= 0 ? r[iAddr] : "", iCity >= 0 ? r[iCity] : "", iCounty >= 0 ? r[iCounty] : ""].map((x) => x?.trim()).filter(Boolean).join(", ") || undefined,
    cui: iCui >= 0 ? r[iCui]?.trim() || undefined : undefined,
    caen: iCaen >= 0 ? r[iCaen]?.trim() || undefined : undefined,
  }));

  const { data: c } = await db
    .from("campaigns")
    .insert({ name: `Import · ${file.name}`, region, category, max_results: found.length, target: found.length, sources: ["csv"], status: "discovering" })
    .select("id")
    .single();
  const { ids, known } = await insertNewLeads(c!.id, found);
  await db.from("campaigns").update({ status: "done", found: found.length, new_leads: ids.length, queries_total: 1, queries_done: 1, log: [{ query: file.name, source: "csv", found: found.length, new: ids.length, known }] }).eq("id", c!.id);

  const withSite = ids.filter((l) => l.website).map((l) => l.id);
  for (let i = 0; i < withSite.length; i += 50) {
    await inngest.send(withSite.slice(i, i + 50).map((leadId) => ({ name: "lead/audit" as const, data: { leadId } })));
  }
  revalidatePath("/", "layout");
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : (firstLine.includes("\t") ? "\t" : ",");
  const out: string[][] = [];
  let row: string[] = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); out.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((c) => c.trim()));
}
