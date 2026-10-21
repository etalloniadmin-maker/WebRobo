import type { LeadStatus } from "./supabase";

// Pipeline-ul vizual: 5 etape + coșul de respinse. Fiecare status aparține exact unei etape.
export type StageKey = "discovery" | "prototype" | "review" | "sent" | "contract" | "rejected";

export const STAGES: { key: StageKey; label: string; hint: string; statuses: LeadStatus[] }[] = [
  {
    key: "discovery",
    label: "Descoperire",
    hint: "Campanii + audit. Alege ce firme merită un prototip.",
    statuses: ["discovered", "no_website", "auditing", "audited"],
  },
  {
    key: "prototype",
    label: "Prototip",
    hint: "Roboții generează homepage-ul și draftul de email.",
    statuses: ["generating", "failed"],
  },
  {
    key: "review",
    label: "Review",
    hint: "Verifici site-ul și emailul, apoi trimiți.",
    statuses: ["mockup_ready"],
  },
  {
    key: "sent",
    label: "Trimis",
    hint: "Emailuri plecate. Urmărești deschideri și răspunsuri.",
    statuses: ["approved", "sending", "sent"],
  },
  {
    key: "contract",
    label: "Contract",
    hint: "Au răspuns. Negociere → câștigat / pierdut.",
    statuses: ["replied", "negotiating", "won", "lost"],
  },
  {
    key: "rejected",
    label: "Gunoi",
    hint: "Firmele de aici nu mai intră niciodată automat în pipeline — nici la re-audit, nici dacă o campanie nouă le găsește din nou. Le scoți doar manual, cu „Readu”.",
    statuses: ["rejected"],
  },
];

export function stageOf(status: LeadStatus): StageKey {
  return STAGES.find((s) => s.statuses.includes(status))?.key ?? "discovery";
}

export function stageByKey(key: string) {
  return STAGES.find((s) => s.key === key) ?? STAGES[0];
}

// View-uri transversale (marcaje): nu sunt etape, arată lead-uri din orice etapă care au marcajul.
export type ViewKey = "starred" | "bookmarks" | "archive";
export const VIEWS: { key: ViewKey; icon: string; label: string; flag: "starred" | "bookmarked" | "archived"; hint: string }[] = [
  { key: "starred", icon: "★", label: "Evidențiate", flag: "starred", hint: "Firme marcate cu stea, din orice etapă." },
  { key: "bookmarks", icon: "🔖", label: "Bookmark", flag: "bookmarked", hint: "Firme salvate pentru mai târziu, din orice etapă." },
  { key: "archive", icon: "📦", label: "Arhivă", flag: "archived", hint: "Firme arhivate. Rămân în etapa lor, dar sunt estompate acolo." },
];
export function viewByKey(key: string) {
  return VIEWS.find((v) => v.key === key) ?? null;
}
