import type { LeadStatus } from "@/lib/supabase";

const COLORS: Record<LeadStatus, string> = {
  discovered: "bg-neutral-100 text-neutral-700",
  no_website: "bg-amber-50 text-amber-700",
  auditing: "bg-blue-50 text-blue-700",
  audited: "bg-blue-100 text-blue-800",
  rejected: "bg-neutral-100 text-neutral-400 line-through",
  generating: "bg-violet-50 text-violet-700",
  mockup_ready: "bg-emerald-50 text-emerald-700 font-medium",
  approved: "bg-emerald-100 text-emerald-800",
  sending: "bg-emerald-100 text-emerald-800",
  sent: "bg-emerald-600 text-white",
  replied: "bg-pink-600 text-white",
  failed: "bg-red-50 text-red-700",
  negotiating: "bg-amber-100 text-amber-800",
  won: "bg-emerald-700 text-white font-medium",
  lost: "bg-neutral-200 text-neutral-500",
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  return <span className={`inline-block rounded px-2 py-0.5 text-xs ${COLORS[status]}`}>{status.replace("_", " ")}</span>;
}
