// Screenshot al preview-ului pentru email. Pe Vercel nu poți rula Playwright ușor,
// așa că folosim un serviciu extern (Browserless, ScreenshotOne, ApiFlash...).
// Dacă SCREENSHOT_API_URL lipsește, pasul e sărit și emailul merge doar cu link.
//
// Exemplu ScreenshotOne: SCREENSHOT_API_URL=https://api.screenshotone.com/take
// Exemplu Browserless:   SCREENSHOT_API_URL=https://chrome.browserless.io/screenshot

import { db } from "./supabase";
import { getSettings } from "./settings";

export async function screenshotPreview(leadId: string, previewUrl: string): Promise<string | null> {
  const s = await getSettings();
  const api = s.screenshot_api_url;
  const key = s.screenshot_api_key;
  if (!api || !key) return null;

  let res: Response;
  if (api.includes("screenshotone")) {
    const u = new URL(api);
    u.searchParams.set("access_key", key);
    u.searchParams.set("url", previewUrl);
    u.searchParams.set("viewport_width", "1280");
    u.searchParams.set("viewport_height", "800");
    u.searchParams.set("format", "png");
    res = await fetch(u);
  } else {
    // Browserless-style POST
    res = await fetch(`${api}?token=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: previewUrl, options: { type: "png" }, viewport: { width: 1280, height: 800 } }),
    });
  }
  if (!res.ok) throw new Error(`Screenshot ${res.status}: ${await res.text()}`);
  const png = Buffer.from(await res.arrayBuffer());

  // Stochează în Supabase Storage (bucket public "screenshots" — creează-l o dată din dashboard).
  const path = `${leadId}.png`;
  const { error } = await db.storage.from("screenshots").upload(path, png, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Storage: ${error.message}`);
  return db.storage.from("screenshots").getPublicUrl(path).data.publicUrl;
}
