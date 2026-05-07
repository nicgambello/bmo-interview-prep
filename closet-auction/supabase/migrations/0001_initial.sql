-- Closet Auction initial schema
-- Run in the Supabase SQL editor (or via `supabase db push`).

create extension if not exists "pgcrypto";

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 2 and 24),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username',
             split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)),
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============ groups ============
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  created_by uuid not null references public.profiles(id) on delete cascade,
  invite_code text unique not null default upper(substr(encode(gen_random_bytes(6), 'base64'), 1, 6)),
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members(user_id);

-- ============ items (auction listings) ============
create table public.items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text,
  image_path text not null,
  starting_bid numeric(10,2) not null default 0 check (starting_bid >= 0),
  current_bid numeric(10,2),
  current_bidder_id uuid references public.profiles(id),
  ends_at timestamptz not null,
  status text not null default 'live' check (status in ('live', 'settled', 'cancelled')),
  winner_id uuid references public.profiles(id),
  winning_bid numeric(10,2),
  created_at timestamptz not null default now(),
  check (ends_at > created_at)
);

create index items_group_status_idx on public.items(group_id, status, ends_at desc);

-- ============ bids ============
create table public.bids (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index bids_item_idx on public.bids(item_id, created_at desc);

-- ============ helper: is_group_member ============
create or replace function public.is_group_member(_group_id uuid, _user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.group_members
    where group_id = _group_id and user_id = _user_id
  );
$$;

-- ============ place_bid RPC ============
-- Atomic, validated bid placement. Called from the client.
create or replace function public.place_bid(_item_id uuid, _amount numeric)
returns public.bids
language plpgsql
security definer set search_path = public
as $$
declare
  v_item public.items;
  v_min numeric;
  v_bid public.bids;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into v_item from public.items where id = _item_id for update;
  if not found then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  if v_item.status <> 'live' then
    raise exception 'auction_not_live' using errcode = 'P0001';
  end if;

  if now() >= v_item.ends_at then
    raise exception 'auction_ended' using errcode = 'P0001';
  end if;

  if v_item.seller_id = auth.uid() then
    raise exception 'seller_cannot_bid' using errcode = 'P0001';
  end if;

  if not public.is_group_member(v_item.group_id, auth.uid()) then
    raise exception 'not_group_member' using errcode = '42501';
  end if;

  v_min := coalesce(v_item.current_bid + 1, v_item.starting_bid);
  if _amount < v_min then
    raise exception 'bid_too_low' using errcode = 'P0001', detail = 'min=' || v_min::text;
  end if;

  insert into public.bids (item_id, bidder_id, amount)
  values (_item_id, auth.uid(), _amount)
  returning * into v_bid;

  update public.items
  set current_bid = _amount,
      current_bidder_id = auth.uid()
  where id = _item_id;

  return v_bid;
end;
$$;

-- ============ settle_due_auctions RPC ============
-- Marks any live items past their ends_at as settled and records winner.
-- Safe to call from any authenticated user (idempotent). For production, also
-- schedule via pg_cron / a scheduled Edge Function.
create or replace function public.settle_due_auctions()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  n integer;
begin
  with settled as (
    update public.items
    set status = 'settled',
        winner_id = current_bidder_id,
        winning_bid = current_bid
    where status = 'live' and ends_at <= now()
    returning 1
  )
  select count(*) into n from settled;
  return n;
end;
$$;

-- ============ create_group_with_owner RPC ============
-- Creates a group and adds the caller as owner in one atomic call,
-- avoiding the race where RLS would block the membership insert.
create or replace function public.create_group(_name text)
returns public.groups
language plpgsql
security definer set search_path = public
as $$
declare
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  insert into public.groups (name, created_by)
  values (_name, auth.uid())
  returning * into v_group;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'owner');

  return v_group;
end;
$$;

-- ============ join_group_by_code RPC ============
create or replace function public.join_group(_invite_code text)
returns public.groups
language plpgsql
security definer set search_path = public
as $$
declare
  v_group public.groups;
begin
  if auth.uid() is null then
    raise exception 'auth_required' using errcode = '28000';
  end if;

  select * into v_group from public.groups where invite_code = upper(_invite_code);
  if not found then
    raise exception 'invalid_invite_code' using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, auth.uid(), 'member')
  on conflict do nothing;

  return v_group;
end;
$$;

-- ============ Row Level Security ============
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.items enable row level security;
alter table public.bids enable row level security;

-- profiles: a user can read profiles of people they share a group with, and themselves.
create policy "profiles: self or shared group" on public.profiles
for select using (
  id = auth.uid()
  or exists (
    select 1
    from public.group_members me
    join public.group_members them on them.group_id = me.group_id
    where me.user_id = auth.uid() and them.user_id = profiles.id
  )
);

create policy "profiles: update self" on public.profiles
for update using (id = auth.uid()) with check (id = auth.uid());

-- groups: members can read; anyone authenticated can create (RPC handles ownership)
create policy "groups: read if member" on public.groups
for select using (public.is_group_member(id, auth.uid()));

create policy "groups: insert authenticated" on public.groups
for insert with check (auth.uid() = created_by);

-- group_members: members can read their own group rosters; users can insert themselves only via RPC (security definer).
create policy "group_members: read if member" on public.group_members
for select using (public.is_group_member(group_id, auth.uid()));

-- items: read/write only for group members; only seller can update own listing.
create policy "items: read if member" on public.items
for select using (public.is_group_member(group_id, auth.uid()));

create policy "items: insert if member and self-seller" on public.items
for insert with check (
  seller_id = auth.uid() and public.is_group_member(group_id, auth.uid())
);

create policy "items: update by seller" on public.items
for update using (seller_id = auth.uid()) with check (seller_id = auth.uid());

-- bids: read if group member; insert blocked at RLS — go through place_bid RPC.
create policy "bids: read if member" on public.bids
for select using (
  exists (
    select 1 from public.items i
    where i.id = bids.item_id
    and public.is_group_member(i.group_id, auth.uid())
  )
);

-- ============ Storage bucket for item photos ============
insert into storage.buckets (id, name, public)
values ('item-photos', 'item-photos', false)
on conflict (id) do nothing;

-- Group members can read photos for items in their groups; sellers can upload/replace own photos.
create policy "item-photos: read if member"
on storage.objects for select
using (
  bucket_id = 'item-photos'
  and exists (
    select 1 from public.items i
    where i.image_path = storage.objects.name
    and public.is_group_member(i.group_id, auth.uid())
  )
);

create policy "item-photos: insert by authenticated"
on storage.objects for insert
with check (bucket_id = 'item-photos' and auth.uid() is not null);

create policy "item-photos: update by owner"
on storage.objects for update
using (bucket_id = 'item-photos' and owner = auth.uid());

-- ============ Realtime ============
-- Allow Realtime to broadcast changes for items + bids tables.
alter publication supabase_realtime add table public.items, public.bids;
