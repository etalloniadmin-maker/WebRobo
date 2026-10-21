-- Web Robo: setări în DB + șabloane de email

create table if not exists settings (
  id         int primary key default 1 check (id = 1),
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1) on conflict do nothing;

create table if not exists email_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  subject     text not null,
  body        text not null,            -- text simplu cu {{variabile}}
  ai_rewrite  boolean not null default false, -- true: LLM personalizează pornind de la șablon
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger email_templates_updated_at before update on email_templates
  for each row execute function set_updated_at();

alter table leads add column if not exists template_id uuid references email_templates(id) on delete set null;

alter table settings enable row level security;
alter table email_templates enable row level security;

-- Șablon implicit
insert into email_templates (name, subject, body, ai_rewrite, is_default) values (
  'Propunere standard',
  'Site nou pentru {{firma}} – gratuit, doar 25 $/lună mentenanță',
  'Bună ziua,

Mă numesc {{expeditor}} și construiesc site-uri pentru afaceri locale. Am dat peste {{firma}} și mi-am permis să schițez, gratuit, cum ar putea arăta pagina dumneavoastră principală cu un design actual:

{{link}}

Este doar o propunere – nimic nu a fost publicat în numele dumneavoastră, iar dacă doriți, o șterg imediat.

Cum funcționează: realizarea site-ului este gratuită, pentru că folosesc agenți AI care fac cea mai mare parte din muncă. Plătiți doar mentenanța – găzduire, actualizări, modificări de conținut și suport – 25 $ pe lună, mult sub prețul pieței. Fără contract pe termen lung, puteți renunța oricând.

Dacă vă place direcția, răspundeți la acest email și vă fac site-ul complet în câteva zile.

O zi bună,
{{expeditor}}
{{firma_expeditor}}',
  false,
  true
);
