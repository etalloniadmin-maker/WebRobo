// Surse de firme. Fiecare întoarce același tip; dedublarea se face pe place_id și pe domeniu.
import { searchPlaces } from "./places";
import { db, slugify } from "./supabase";

export type SourceKey = "places" | "osm";
export const SOURCES: { key: SourceKey; label: string; hint: string }[] = [
  { key: "places", label: "Google Places", hint: "cea mai bună acoperire; ~3 € / 100 căutări" },
  { key: "osm", label: "OpenStreetMap", hint: "gratuit, mai rar; prinde firme care nu sunt pe Google" },
];

export type Found = {
  source: SourceKey | "csv";
  place_id?: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  cui?: string;
  caen?: string;
};

export function normalizeDomain(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`);
    const h = u.hostname.toLowerCase().replace(/^www\./, "");
    return h.includes(".") ? h : null;
  } catch {
    return null;
  }
}

// --- OpenStreetMap (Nominatim, extratags=1 ne dă website/phone/email) ---
const NOMINATIM_UA = "web-robo/1.0 (lead discovery; contact via app settings)";
let lastOsmCall = 0;

export async function searchOsm(query: string, limit = 50): Promise<Found[]> {
  // Nominatim: max 1 cerere/secundă
  const wait = 1100 - (Date.now() - lastOsmCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastOsmCall = Date.now();

  const u = new URL("https://nominatim.openstreetmap.org/search");
  u.searchParams.set("q", query);
  u.searchParams.set("format", "jsonv2");
  u.searchParams.set("extratags", "1");
  u.searchParams.set("addressdetails", "1");
  u.searchParams.set("countrycodes", "ro");
  u.searchParams.set("limit", String(limit));
  const res = await fetch(u, { headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "ro" } });
  if (!res.ok) throw new Error(`Nominatim ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return rows
    .filter((r) => r.name && r.extratags)
    .map((r) => {
      const t = r.extratags as Record<string, string>;
      const a = (r.address ?? {}) as Record<string, string>;
      return {
        source: "osm" as const,
        place_id: `osm:${r.osm_type}:${r.osm_id}`,
        name: String(r.name),
        address: [a.road, a.house_number, a.town ?? a.city ?? a.village, a.county].filter(Boolean).join(", ") || String(r.display_name ?? ""),
        phone: t.phone ?? t["contact:phone"],
        website: t.website ?? t["contact:website"],
        email: t.email ?? t["contact:email"],
      };
    });
}

export async function runSource(source: SourceKey, query: string, max: number): Promise<Found[]> {
  if (source === "places") {
    const r = await searchPlaces({ category: query, region: "", maxResults: Math.min(max, 60) });
    return r.map((p) => ({ source: "places" as const, ...p }));
  }
  return searchOsm(query, Math.min(max, 50));
}

// Inserează doar firmele necunoscute (nici place_id, nici domeniu existent). Întoarce id-urile noi + câte erau deja cunoscute.
export async function insertNewLeads(campaignId: string, found: Found[]): Promise<{ ids: { id: string; website: string | null }[]; known: number }> {
  const withDomain = found.map((f) => ({ ...f, domain: normalizeDomain(f.website) }));
  const placeIds = withDomain.map((f) => f.place_id).filter(Boolean) as string[];
  const domains = withDomain.map((f) => f.domain).filter(Boolean) as string[];

  const [{ data: byPid }, { data: byDom }] = await Promise.all([
    placeIds.length ? db.from("leads").select("place_id").in("place_id", placeIds) : Promise.resolve({ data: [] as { place_id: string }[] }),
    domains.length ? db.from("leads").select("domain").in("domain", domains) : Promise.resolve({ data: [] as { domain: string }[] }),
  ]);
  const knownPid = new Set((byPid ?? []).map((r) => r.place_id));
  const knownDom = new Set((byDom ?? []).map((r) => r.domain));
  const seenDom = new Set<string>();

  const rows = [];
  let known = 0;
  for (const f of withDomain) {
    if ((f.place_id && knownPid.has(f.place_id)) || (f.domain && knownDom.has(f.domain)) || (f.domain && seenDom.has(f.domain))) { known++; continue; }
    if (f.domain) seenDom.add(f.domain);
    rows.push({
      campaign_id: campaignId,
      place_id: f.place_id ?? null,
      slug: `${slugify(f.name)}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      address: f.address ?? null,
      phone: f.phone ?? null,
      website: f.website ?? null,
      domain: f.domain,
      email: f.email?.toLowerCase() ?? null,
      cui: f.cui ?? null,
      caen: f.caen ?? null,
      source: f.source,
      status: f.website ? "discovered" : "no_website",
    });
  }
  if (!rows.length) return { ids: [], known };
  // Inserăm rând cu rând ca un duplicat (place_id sau domeniu apărut între timp) să nu strice tot lotul.
  const ids: { id: string; website: string | null }[] = [];
  for (const row of rows) {
    const { data, error } = await db.from("leads").upsert(row, { onConflict: "place_id", ignoreDuplicates: true }).select("id, website").maybeSingle();
    if (error) {
      if (error.code === "23505") { known++; continue; } // unique violation (domain)
      throw new Error(error.message);
    }
    if (data) ids.push(data as { id: string; website: string | null });
    else known++;
  }
  return { ids, known };
}
