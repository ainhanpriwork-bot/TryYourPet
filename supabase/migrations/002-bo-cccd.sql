-- Stop storing CCCD numbers. Run once in Supabase (SQL Editor), BEFORE the matching code is deployed.
-- Deletes every CCCD number already saved and replaces it with an "adopter confirmed being 18+" flag.
-- Safe to run more than once.
alter table orders add column if not exists adult_confirmed boolean not null default false;
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'orders' and column_name = 'cccd') then
    update orders set adult_confirmed = true;   -- earlier orders passed the 18+ check through their CCCD
    alter table orders drop column cccd;
  end if;
end $$;
