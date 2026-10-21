"use client";

import { useMemo, useState } from "react";

type M = { id: string; name: string; free: boolean; context: number; json: boolean };

export function ModelPicker({ name, label, value, models, hint }: { name: string; label: string; value: string; models: M[]; hint?: string }) {
  const [onlyFree, setOnlyFree] = useState(value.endsWith(":free"));
  const [q, setQ] = useState("");
  const [val, setVal] = useState(value);

  const list = useMemo(() => {
    const s = q.toLowerCase();
    return models.filter((m) => (!onlyFree || m.free) && (!s || m.id.toLowerCase().includes(s) || m.name.toLowerCase().includes(s))).slice(0, 80);
  }, [models, onlyFree, q]);

  const current = models.find((m) => m.id === val);

  return (
    <div className="rounded border p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{label}</span>
        <label className="flex items-center gap-1 text-xs text-neutral-500">
          <input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> doar gratuite
        </label>
      </div>
      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="caută…" className="w-32 rounded border px-2 py-1 text-xs" />
        <select value={val} onChange={(e) => setVal(e.target.value)} className="flex-1 rounded border px-2 py-1 text-xs">
          {!list.some((m) => m.id === val) && <option value={val}>{val}</option>}
          {list.map((m) => (
            <option key={m.id} value={m.id}>
              {m.free ? "🆓 " : ""}{m.name}{m.json ? " · JSON" : ""} · {Math.round(m.context / 1000)}k
            </option>
          ))}
        </select>
      </div>
      <input name={name} value={val} onChange={(e) => setVal(e.target.value)} className="mt-2 w-full rounded border bg-neutral-50 px-2 py-1 font-mono text-xs" />
      <p className="mt-1 text-xs text-neutral-400">
        {hint}{current && !current.json ? " · ⚠ acest model nu garantează JSON" : ""}
      </p>
    </div>
  );
}
