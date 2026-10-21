-- Web Robo: surse multiple + țintă de firme noi + dedublare pe domeniu

alter table campaigns add column if not exists target int not null default 20;         -- câte firme NOI vrem
alter table campaigns add column if not exists sources text[] not null default '{places}'; -- places, osm
alter table campaigns add column if not exists queries_total int;
alter table campaigns add column if not exists queries_done int not null default 0;
alter table campaigns add column if not exists log jsonb not null default '[]'::jsonb;   -- [{query, source, found, new}]

alter table leads add column if not exists domain text;      -- hostname normalizat (fără www), pentru dedublare între surse
alter table leads add column if not exists source text not null default 'places';
alter table leads add column if not exists caen text;

update leads set domain = lower(regexp_replace(regexp_replace(website, '^https?://(www\.)?', ''), '/.*$', ''))
  where website is not null and domain is null;

create unique index if not exists leads_domain_uniq on leads(domain) where domain is not null;
