-- Web Robo: marcaje (stea / bookmark / arhivă) — nu schimbă etapa, doar evidențiază
alter table leads add column if not exists starred boolean not null default false;
alter table leads add column if not exists bookmarked boolean not null default false;
alter table leads add column if not exists archived boolean not null default false;
create index if not exists leads_flags_idx on leads(starred, bookmarked, archived);
