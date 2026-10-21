-- Site Refresh: schema inițial
-- Rulează în Supabase SQL Editor sau cu `supabase db push`.

create extension if not exists "pgcrypto";

-- O campanie = o căutare (regiune + categorie) care produce lead-uri
create table campaigns (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text not null,            -- ex: "Cluj-Napoca, Cluj"
  category    text not null,            -- ex: "pensiune", "cabinet stomatologic"
  max_results int  not null default 40,
  status      text not null default 'queued'
              check (status in ('queued','discovering','done','failed')),
  created_at  timestamptz not null default now()
);

-- Pipeline-ul unui lead, de la descoperire la răspuns
create type lead_status as enum (
  'discovered',      -- găsit în Places
  'no_website',      -- nu are site: candidat și mai bun, dar fără audit
  'auditing',
  'audited',         -- are old_site_score
  'rejected',        -- scor prea mic sau respins manual
  'generating',
  'mockup_ready',    -- așteaptă aprobare manuală
  'approved',
  'sending',
  'sent',
  'replied',
  'failed'
);

create table leads (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references campaigns(id) on delete cascade,
  slug            text unique not null,
  place_id        text unique,
  name            text not null,
  address         text,
  phone           text,
  website         text,
  email           text,
  cui             text,                  -- completat manual sau dintr-un agregator
  status          lead_status not null default 'discovered',

  -- Audit site vechi
  audit           jsonb,                 -- detalii: viewport, https, jquery, copyright_year, pagespeed...
  old_site_score  int,                   -- 0-100, mai mare = mai vechi/mai slab
  old_site_reason text,

  -- Conținut extras + mockup
  extracted       jsonb,                 -- { tagline, services[], about, colors[], logo_url }
  mockup_html     text,
  mockup_screenshot_url text,

  -- Email
  email_subject   text,
  email_body      text,
  sent_at         timestamptz,
  resend_id       text,
  opened_at       timestamptz,
  replied_at      timestamptz,

  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index leads_campaign_idx on leads(campaign_id);
create index leads_status_idx   on leads(status);

create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger leads_updated_at before update on leads
  for each row execute function set_updated_at();

-- Jurnal de evenimente per lead (util în dashboard pentru debugging)
create table lead_events (
  id         bigserial primary key,
  lead_id    uuid references leads(id) on delete cascade,
  step       text not null,
  message    text,
  payload    jsonb,
  created_at timestamptz not null default now()
);
create index lead_events_lead_idx on lead_events(lead_id);

-- RLS: aplicația folosește service role key pe server, deci blocăm accesul anon.
alter table campaigns   enable row level security;
alter table leads       enable row level security;
alter table lead_events enable row level security;
