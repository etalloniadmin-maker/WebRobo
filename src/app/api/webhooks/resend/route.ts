import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

// Resend -> Webhooks -> adaugă https://<app>/api/webhooks/resend pentru email.opened / email.delivered.
// Pentru producție verifică semnătura (svix) cu RESEND_WEBHOOK_SECRET.
export async function POST(req: Request) {
  const evt = await req.json();
  const resendId: string | undefined = evt?.data?.email_id;
  if (!resendId) return NextResponse.json({ ok: true });

  if (evt.type === "email.opened") {
    await db.from("leads").update({ opened_at: new Date().toISOString() }).eq("resend_id", resendId).is("opened_at", null);
  }
  return NextResponse.json({ ok: true });
}
