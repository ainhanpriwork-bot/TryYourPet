-- TryYourPet database schema (PostgreSQL / Supabase).
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Every table has row level security ON and no policies: the browser can never read or write
-- these tables directly. Only the Netlify Functions, which connect with the database password,
-- touch the data, and they check the rules and the admin login themselves.

create table if not exists stations (
  id          text primary key,
  name        text not null,
  area        text not null default 'TP.HCM',
  address     text not null default '',
  facebook    text,
  email       text,
  phone       text,
  needs       text[] not null default '{}',
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

create table if not exists slots (
  id          text primary key,
  label       text not null,
  start_hour  int not null,
  end_hour    int not null,
  capacity    int not null default 2 check (capacity between 0 and 50),
  sort        int not null default 0
);

create table if not exists settings (
  id          int primary key default 1 check (id = 1),
  open_days   int[] not null default '{0,2,3,4,5,6}'   -- 0 = Sunday ... 6 = Saturday
);

create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  status        text not null check (status in ('review','confirmed','completed','cancelled')),
  pet_ids       uuid[] not null,
  station_id    text not null references stations(id),
  name          text not null,
  phone         text not null,
  email         text not null,
  address       text not null,
  district      text not null,
  job           text not null,
  adult_confirmed boolean not null default false,
  answers       jsonb not null default '{}',
  flags         text[] not null default '{}',
  appt_date     date not null,
  slot_id       text not null references slots(id),
  appt_end      timestamptz not null,
  reminded_at   timestamptz,
  cancel_reason text,
  decided_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists orders_slot_idx on orders (appt_date, slot_id) where status in ('review','confirmed');

create table if not exists holds (
  pet_id      uuid primary key references pets(id) on delete cascade,
  visitor_id  text not null,
  order_id    uuid references orders(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);
create index if not exists holds_visitor_idx on holds (visitor_id);

create table if not exists otp_codes (
  email       text primary key,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  sent_at     timestamptz not null default now()
);

create table if not exists supports (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  type        text not null check (type in ('cash','items')),
  target      text not null default 'all',
  amount      int,
  items       jsonb,
  method      text,
  name        text not null,
  anon        boolean not null default false,
  email       text not null,
  phone       text,
  note        text,
  proof_path  text,
  status      text not null default 'pending' check (status in ('pending','received','rejected')),
  decided_by  text,
  created_at  timestamptz not null default now()
);

create table if not exists email_log (
  id          bigserial primary key,
  to_email    text not null,
  subject     text not null,
  ok          boolean not null,
  error       text,
  created_at  timestamptz not null default now()
);

-- Emails allowed into the admin page. Each one also needs a user in Supabase Authentication.
create table if not exists admins (
  email       text primary key
);

alter table stations  enable row level security;
alter table pets      enable row level security;
alter table slots     enable row level security;
alter table settings  enable row level security;
alter table orders    enable row level security;
alter table holds     enable row level security;
alter table otp_codes enable row level security;
alter table supports  enable row level security;
alter table email_log enable row level security;
alter table admins    enable row level security;

-- Starting data: opening days, pickup time slots and the two partner stations.
insert into settings (id) values (1) on conflict do nothing;

insert into slots (id, label, start_hour, end_hour, capacity, sort) values
  ('s1', '09:00–11:00',  9, 11, 2, 1),
  ('s2', '14:00–16:00', 14, 16, 2, 2),
  ('s3', '16:00–18:00', 16, 18, 2, 3)
on conflict (id) do nothing;

insert into stations (id, name, area, address, facebook, email, needs, sort) values
  ('VML', 'Vườn Mèo Lang Thang', 'TP.HCM', '', 'https://www.facebook.com/vuonmeolangthang/', 'vuonmeolangthangoffical@gmail.com', '{catfood,litter,milk}', 1),
  ('PN',  'Purr Nature',         'TP.HCM', '', 'https://www.facebook.com/purr.nature.store', 'purr.nature@gmail.com',             '{pate,litter,med}',    2)
on conflict (id) do nothing;
