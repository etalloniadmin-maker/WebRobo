import { inngest } from "../client";
import { db, type Campaign } from "@/lib/supabase";
import { expandQueries } from "@/lib/llm";
import { insertNewLeads, runSource, type SourceKey } from "@/lib/sources";

const MAX_QUERIES = 15; // plafon de cost per campanie

// Campanie → "caută până găsești N firme noi": variante de interogare × surse, până la țintă.
export const discoverCampaign = inngest.createFunction(
  // idempotency: un singur run per campanie (în 24h); concurrency: niciodată două în paralel pe aceeași campanie
  { id: "discover-campaign", retries: 1, idempotency: "event.data.campaignId", concurrency: { key: "event.data.campaignId", limit: 1 } },
  { event: "campaign/discover" },
  async ({ event, step }) => {
    const { campaignId } = event.data;

    const campaign = await step.run("load-campaign", async () => {
      const { data, error } = await db.from("campaigns").select("*").eq("id", campaignId).single();
      if (error) throw error;
      await db.from("campaigns").update({ status: "discovering", queries_done: 0, log: [] }).eq("id", campaignId);
      return data as Campaign;
    });

    const sources = (campaign.sources?.length ? campaign.sources : ["places"]) as SourceKey[];
    const target = campaign.target ?? campaign.max_results ?? 20;

    const queries = await step.run("expand-queries", async () => {
      const qs = await expandQueries(campaign.category, campaign.region, MAX_QUERIES);
      await db.from("campaigns").update({ queries_total: qs.length * sources.length }).eq("id", campaignId);
      return qs;
    });

    let totalNew = 0;
    let totalFound = 0;
    const newLeadIds: string[] = [];
    const log: { query: string; source: string; found: number; new: number }[] = [];

    outer: for (const q of queries) {
      for (const source of sources) {
        const r = await step.run(`search:${source}:${q}`.slice(0, 80), async () => {
          const need = target - totalNew;
          let found: Awaited<ReturnType<typeof runSource>> = [];
          try {
            found = await runSource(source, q, Math.max(need * 2, 20));
          } catch (e) {
            return { found: 0, newIds: [] as { id: string; website: string | null }[], error: (e as Error).message };
          }
          const { ids } = await insertNewLeads(campaignId, found);
          return { found: found.length, newIds: ids, error: null };
        });

        totalFound += r.found;
        totalNew += r.newIds.length;
        newLeadIds.push(...r.newIds.filter((l) => l.website).map((l) => l.id));
        log.push({ query: q, source, found: r.found, new: r.newIds.length });

        await step.run(`progress:${log.length}`, () =>
          db.from("campaigns").update({ queries_done: log.length, found: totalFound, new_leads: totalNew, log }).eq("id", campaignId)
        );

        if (totalNew >= target) break outer;
      }
    }

    // Auditează doar firmele noi care au site; cele fără site stau în Descoperire ca "no_website"
    if (newLeadIds.length) {
      for (let i = 0; i < newLeadIds.length; i += 50) {
        await step.sendEvent(`fan-out-audits-${i}`, newLeadIds.slice(i, i + 50).map((leadId) => ({ name: "lead/audit" as const, data: { leadId } })));
      }
    }

    await step.run("mark-done", () => db.from("campaigns").update({ status: "done" }).eq("id", campaignId));
    return { target, totalFound, totalNew, queriesRun: log.length };
  }
);
