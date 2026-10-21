import { db } from "@/lib/supabase";

// Linkul din footer-ul emailului. Șterge mockup-ul și marchează lead-ul ca respins.
export async function GET(req: Request) {
  const leadId = new URL(req.url).searchParams.get("lead");
  if (leadId) {
    await db.from("leads").update({ status: "rejected", mockup_html: null, error: "dezabonat" }).eq("id", leadId);
  }
  return new Response(
    `<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px">
     <h2>Gata.</h2><p>Nu veți mai primi mesaje și preview-ul a fost șters.</p>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}
