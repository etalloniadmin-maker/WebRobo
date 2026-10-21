-- Web Robo: statistici campanie (câte firme găsite / câte noi)
alter table campaigns add column if not exists found int;
alter table campaigns add column if not exists new_leads int;
