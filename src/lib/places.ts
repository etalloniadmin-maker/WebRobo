import { getSettings } from "./settings";
// Google Places API (New) — Text Search.
// Docs: https://developers.google.com/maps/documentation/places/web-service/text-search
// Cost: ~$32 / 1000 cereri cu field mask "Pro"; cu mască minimă e mai ieftin.

export type Place = {
  place_id: string;
  name: string;
  address?: string;
  phone?: string;
  website?: string;
};

export async function searchPlaces(opts: {
  category: string;
  region: string;
  maxResults?: number;
}): Promise<Place[]> {
  const key = (await getSettings()).google_places_api_key;
  if (!key) throw new Error("Lipsește cheia Google Places (Setări → Chei API)");

  const out: Place[] = [];
  let pageToken: string | undefined;
  const want = opts.maxResults ?? 40;

  while (out.length < want) {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,nextPageToken",
      },
      body: JSON.stringify({
        textQuery: opts.region ? `${opts.category} ${opts.region}` : opts.category,
        languageCode: "ro",
        regionCode: "RO",
        pageSize: Math.min(20, want - out.length),
        pageToken,
      }),
    });
    if (!res.ok) throw new Error(`Places API ${res.status}: ${await res.text()}`);
    const json = await res.json();

    for (const p of json.places ?? []) {
      out.push({
        place_id: p.id,
        name: p.displayName?.text ?? "(fără nume)",
        address: p.formattedAddress,
        phone: p.nationalPhoneNumber,
        website: p.websiteUri,
      });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }
  return out.slice(0, want);
}
