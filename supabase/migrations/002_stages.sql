-- Web Robo: etapa Contract + notițe
alter type lead_status add value if not exists 'negotiating';
alter type lead_status add value if not exists 'won';
alter type lead_status add value if not exists 'lost';

alter table leads add column if not exists notes text;
alter table leads add column if not exists contract_value numeric;
alter table leads add column if not exists last_followup_at timestamptz;
