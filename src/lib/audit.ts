import * as cheerio from "cheerio";
import type { Audit } from "./supabase";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Ia HTML-ul paginii principale (cu timeout, urmărind redirecturi).
export async function fetchHomepage(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ro,en" }, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) return null;
    const html = await res.text();
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Heuristici deterministe. Fiecare semnal adaugă puncte; 100 = sigur vechi.
export function auditHtml(html: string, finalUrl: string): { audit: Audit; score: number; reasons: string[] } {
  const $ = cheerio.load(html);
  const reasons: string[] = [];
  let score = 0;

  const https = finalUrl.startsWith("https://");
  if (!https) { score += 20; reasons.push("fără HTTPS"); }

  const hasViewport = $('meta[name="viewport"]').length > 0;
  if (!hasViewport) { score += 30; reasons.push("nu e responsive (lipsă meta viewport)"); }

  // Layout pe tabele: multe <table> fără rol de date
  const tables = $("table").length;
  const usesTables = tables >= 3 && $("div").length < tables * 4;
  if (usesTables) { score += 20; reasons.push("layout construit pe tabele"); }

  const hasFlash = /\.swf|shockwave-flash/i.test(html);
  if (hasFlash) { score += 25; reasons.push("folosește Flash"); }

  const jq = html.match(/jquery[-.]?(\d+\.\d+(?:\.\d+)?)/i);
  const jqueryVersion = jq?.[1] ?? null;
  if (jqueryVersion && /^1\./.test(jqueryVersion)) { score += 10; reasons.push(`jQuery ${jqueryVersion}`); }

  const generator = $('meta[name="generator"]').attr("content") ?? null;
  const gen = generator?.match(/(WordPress|Joomla)!?\s*([\d.]+)/i);
  if (gen && parseFloat(gen[2]) < (gen[1].toLowerCase() === "wordpress" ? 5 : 3.5)) {
    score += 15; reasons.push(`${gen[1]} ${gen[2]} (versiune veche)`);
  }

  // Anul din footer / copyright
  const years = [...html.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => +m[1]);
  const copyrightYear = years.length ? Math.max(...years) : null;
  const nowYear = new Date().getFullYear();
  if (copyrightYear && nowYear - copyrightYear >= 3) {
    score += Math.min(20, (nowYear - copyrightYear) * 4);
    reasons.push(`© ${copyrightYear}`);
  }

  // Fără Tailwind/Bootstrap 4+/framework modern → semnal slab
  if (!/tailwind|bootstrap[./]?[45]|next\/static|_nuxt|wp-block/i.test(html)) { score += 5; }

  const title = $("title").first().text().trim() || null;

  return {
    audit: {
      reachable: true,
      https,
      hasViewport,
      usesTables,
      jqueryVersion,
      copyrightYear,
      generator,
      hasFlash,
      title,
      htmlBytes: html.length,
    },
    score: Math.min(100, score),
    reasons,
  };
}

// Text util pentru LLM: titlu, headinguri, paragrafe, linkuri de contact.
export function extractText(html: string, maxChars = 6000): string {
  const $ = cheerio.load(html);
  $("script,style,noscript,svg,iframe").remove();
  const parts: string[] = [];
  const title = $("title").text().trim();
  if (title) parts.push(`TITLE: ${title}`);
  const desc = $('meta[name="description"]').attr("content");
  if (desc) parts.push(`DESCRIPTION: ${desc}`);
  $("h1,h2,h3,p,li,a[href^='mailto:'],a[href^='tel:']").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 2) parts.push(`${el.tagName.toUpperCase()}: ${t}`);
  });
  const logo = $('img[src*="logo" i], img[alt*="logo" i]').first().attr("src");
  if (logo) parts.push(`LOGO: ${logo}`);
  return parts.join("\n").slice(0, maxChars);
}

// Caută un email public în HTML: mailto, text, și forme obfuscate (nume [at] domeniu [dot] ro).
export function findEmail(html: string): string | null {
  const candidates: string[] = [];
  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) candidates.push(decodeURIComponent(m[1]));
  // de-obfuscare: "nume [at] domeniu [dot] ro", "nume (at) domeniu.ro", "nume&#64;domeniu.ro"
  const deob = html
    .replace(/&#64;|&#x40;|&commat;/gi, "@")
    .replace(/\s*[\[(]\s*(at|la)\s*[\])]\s*/gi, "@")
    .replace(/\s*[\[(]\s*(dot|punct)\s*[\])]\s*/gi, ".");
  for (const m of deob.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g)) candidates.push(m[0]);

  const generic = ["office", "contact", "info", "rezervari", "comenzi", "secretariat", "hello", "salut"];
  const valid = candidates
    .map((e) => { try { return decodeURIComponent(e); } catch { return e; } })   // %20office@ → " office@"
    .map((e) => e.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z]+$/g, ""))
    .filter((e) => !e.includes("%"))
    .filter((e) => /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e))
    .filter((e) => !/example\.|sentry|wixpress|\.png$|\.jpg$|\.jpeg$|\.gif$|\.svg$|\.webp$|noreply|no-reply|@\d|\.js$|\.css$|w3\.org|schema\.org|@(w3|wix|squarespace|godaddy|cloudflare|google|facebook|youtube)\./i.test(e));
  if (!valid.length) return null;
  // preferă adresele "de firmă" (office@, contact@) față de cele personale sau de furnizori
  valid.sort((a, b) => Number(generic.some((g) => b.startsWith(g))) - Number(generic.some((g) => a.startsWith(g))));
  return valid[0];
}

// Găsește paginile de contact din homepage (link cu "contact" în text/href) + câteva căi uzuale.
export function contactUrls(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    const text = $(a).text().toLowerCase();
    if (/contact|despre|about/i.test(href) || /contact/.test(text)) {
      try { out.add(new URL(href, baseUrl).toString()); } catch {}
    }
  });
  for (const p of ["/contact", "/contact/", "/contact.html", "/contact.php", "/contacte", "/contact-us", "/despre-noi"]) {
    try { out.add(new URL(p, baseUrl).toString()); } catch {}
  }
  let base: string;
  try { base = new URL(baseUrl).hostname; } catch { return []; }
  return [...out].filter((u) => { try { return new URL(u).hostname === base; } catch { return false; } }).slice(0, 6);
}

// Email + telefon de pe homepage și, dacă lipsește, de pe paginile de contact.
export async function findContactInfo(homepageHtml: string, baseUrl: string): Promise<{ email: string | null; phone: string | null; from: string | null }> {
  let email = findEmail(homepageHtml);
  let phone = findPhone(homepageHtml);
  if (email) return { email, phone, from: baseUrl };
  for (const u of contactUrls(homepageHtml, baseUrl)) {
    const page = await fetchHomepage(u);
    if (!page) continue;
    email = findEmail(page.html);
    phone = phone ?? findPhone(page.html);
    if (email) return { email, phone, from: u };
  }
  return { email: null, phone, from: null };
}

// Telefon românesc (fix sau mobil), normalizat.
export function findPhone(html: string): string | null {
  const text = cheerio.load(html)("body").text();
  const tel = html.match(/tel:([+\d\s().-]{9,20})/i);
  const raw = tel ? tel[1] : text.match(/(?:\+4|004)?\s?0?\s?[237]\d{2}[\s.-]?\d{3}[\s.-]?\d{3}/)?.[0];
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  const d = digits.startsWith("40") ? digits.slice(2) : digits.startsWith("0040") ? digits.slice(4) : digits;
  if (d.length !== 10 && d.length !== 9) return null;
  const n = d.length === 9 ? "0" + d : d;
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}

// Domenii care NU sunt site-ul propriu al firmei: tratăm lead-ul ca "no_website".
const THIRD_PARTY = /(facebook|fb|instagram|booking|airbnb|tripadvisor|olx|google|linktr\.ee|wa\.me|whatsapp|tiktok|youtube|linkedin|yelp|travelminit|turistinfo|directbooking|hotelnf)\./i;
export function isThirdPartyUrl(url: string): boolean {
  try {
    return THIRD_PARTY.test(new URL(url).hostname);
  } catch {
    return false;
  }
}
