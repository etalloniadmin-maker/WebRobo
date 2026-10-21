import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Servește HTML-ul generat la /preview/<slug>. Adaugă un banner discret
// care spune clar că e o propunere, nu site-ul oficial al firmei.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  const { data } = await db.from("leads").select("mockup_html, name, status").eq("slug", params.slug).single();
  if (!data?.mockup_html || data.status === "rejected") {
    return new Response("Preview indisponibil.", { status: 404 });
  }

  const banner = `
<div id="sr-banner" style="position:fixed;bottom:12px;left:50%;transform:translateX(-50%);z-index:99999;background:#111827;color:#fff;font:13px/1.4 -apple-system,Segoe UI,sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 4px 16px rgba(0,0,0,.25);white-space:nowrap">
  Propunere de design pentru <b>${escapeHtml(data.name)}</b> · nu este site-ul oficial
</div>
<meta name="robots" content="noindex,nofollow">`;

  const html = data.mockup_html.includes("</body>")
    ? data.mockup_html.replace("</body>", `${banner}</body>`)
    : data.mockup_html + banner;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Cache-Control": "private, max-age=60",
    },
  });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
