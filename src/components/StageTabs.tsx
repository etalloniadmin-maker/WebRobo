import Link from "next/link";
import { STAGES, VIEWS, type StageKey, type ViewKey } from "@/lib/stages";

export function StageTabs({ active, counts }: { active: StageKey | ViewKey; counts: Record<string, number> }) {
  return (
    <nav className="mb-5 flex flex-wrap items-center gap-1 border-b">
      {STAGES.filter((s) => s.key !== "rejected").map((s, i) => {
        const n = counts[s.key] ?? 0;
        const isActive = s.key === active;
        const isBin = s.key === "rejected";
        return (
          <Link
            key={s.key}
            href={`/flow/${s.key}`}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition ${
              isActive ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            {!isBin && <span className="text-xs text-neutral-400">{i + 1}</span>}
            {isBin ? "🗑 " : ""}{s.label}
            <span className={`rounded-full px-1.5 text-xs ${isActive ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>{n}</span>
          </Link>
        );
      })}
      <div className="ml-auto flex items-center gap-1">
        {VIEWS.map((v) => {
          const n = counts[v.key] ?? 0;
          const isActive = v.key === active;
          return (
            <Link key={v.key} href={`/flow/${v.key}`} title={v.label}
              className={`-mb-px flex items-center gap-1 border-b-2 px-2 py-2 text-sm ${isActive ? "border-neutral-900 text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>
              <span>{v.icon}</span>
              {n > 0 && <span className={`rounded-full px-1.5 text-xs ${isActive ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>{n}</span>}
            </Link>
          );
        })}
        {STAGES.filter((s) => s.key === "rejected").map((s) => {
          const n = counts[s.key] ?? 0;
          const isActive = s.key === active;
          return (
            <Link key={s.key} href={`/flow/${s.key}`}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm ${isActive ? "border-neutral-900 font-medium text-neutral-900" : "border-transparent text-neutral-500 hover:text-neutral-900"}`}>
              🗑 {s.label}
              <span className={`rounded-full px-1.5 text-xs ${isActive ? "bg-neutral-900 text-white" : "bg-neutral-100 text-neutral-600"}`}>{n}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
