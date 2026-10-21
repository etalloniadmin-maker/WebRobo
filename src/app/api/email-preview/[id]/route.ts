import { db, type Lead } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { renderEmailHtml } from "@/lib/email";

export const dynamic = "force-dynamic";

// Randează emailul exact cum va fi trimis (pentru iframe-ul din pagina lead-ului).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const { data } = await db.from("leads").select("*").eq("id", params.id).single();
  if (!data) return new Response("not found", { status: 404 });
  const l = data as Lead;
  const s = await getSettings();
  const html = renderEmailHtml({
    body: l.email_body ?? "(fără conținut — generează un draft)",
    previewUrl: `${s.app_url}/preview/${l.slug}`,
    screenshotUrl: l.mockup_screenshot_url,
    leadId: l.id,
    appUrl: s.app_url,
  });
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
