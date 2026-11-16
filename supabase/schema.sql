-- TryYourPet database schema (PostgreSQL / Supabase), for a new project.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Every table has row level security ON and no policies: the browser can never read or write
-- these tables directly. Only the server (Vercel Functions), which connects with the database password,
-- touches the data, and it checks the admin login itself.
-- Visitors adopt by messaging a fanpage or calling, so there are no order, hold or email tables.

create table if not exists stations (
  id          text primary key,
  name        text not null,
  area        text not null default 'TP.HCM',
  address     text not null default '',
  facebook    text,
  email       text,
  phone       text,
  sort        int not null default 0
);

create table if not exists pets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  species     text not null check (species in ('dog','cat')),
  breed       text not null default '',
  sex         text not null check (sex in ('Đực','Cái')),
  age_months  int not null check (age_months >= 0),
  weight_kg   numeric(5,2) not null check (weight_kg > 0),
  vaccine     text not null default '',
  neutered    boolean not null default false,
  traits      text[] not null default '{}',
  story       text not null default '',
  station_id  text not null references stations(id),
  photos      text[] not null default '{}',
  video_url   text,
  published   boolean not null default true,
  adopted_at  timestamptz,
  created_at  timestamptz not null default now()
);

-- Emails allowed into the admin page. Each one also needs a user in Supabase Authentication.
create table if not exists admins (
  email       text primary key
);

alter table stations enable row level security;
alter table pets     enable row level security;
alter table admins   enable row level security;

-- Starting data: the two partner stations.
insert into stations (id, name, area, address, facebook, email, sort) values
  ('VML', 'Vườn Mèo Lang Thang', 'TP.HCM', '', 'https://www.facebook.com/vuonmeolangthang/', 'vuonmeolangthangoffical@gmail.com', 1),
  ('PN',  'Purr Nature',         'TP.HCM', '', 'https://www.facebook.com/purr.nature.store', 'purr.nature@gmail.com',             2)
on conflict (id) do nothing;
