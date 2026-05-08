-- Closet Auction — moderation, account deletion, cancellation, and push notifications.
-- Apply after 0001_initial.sql.

-- ============ pg_net (for sending HTTP from triggers) ============
create extension if not exists pg_net with schema extensions;

-- ============ expo_push_tokens ============
create table public.expo_push_tokens (
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  platform text check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

alter table public.expo_push_tokens enable row level security;

create policy "push tokens: read self" on public.expo_push_tokens
for select using (user_id = auth.uid());

create policy "push tokens: upsert self" on public.expo_push_tokens
for insert with check (user_id = auth.uid());

create policy "push tokens: update self" on public.expo_push_tokens
for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "push tokens: delete self" on public.expo_push_tokens
for delete using (user_id = auth.uid());

-- ============ blocked_users ============
create table public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.blocked_users enable row level security;

create policy "blocks: read own" on public.blocked_users
for select using (blocker_id = auth.uid());

create policy "blocks: insert own" on public.blocked_users
for insert with check (blocker_id = auth.uid());

create policy "blocks: delete own" on public.blocked_users
for delete using (blocker_id = auth.uid());

-- Hide items from blocked sellers.
drop policy if exists "items: read if member" on public.items;
create policy "items: read if member and not blocked" on public.items
for select using (
  public.is_group_member(group_id, auth.uid())
  and not exists (
    select 1 from public.blocked_users b
    where b.blocker_id = auth.uid() and b.blocked_id = items.seller_id
  )
);

-- ============ reports ============
create type public.report_kind as enum ('item', 'user');
create type public.report_reason as enum (
  'inappropriate', 'spam', 'fraud', 'counterfeit', 'harassment', 'other'
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  kind public.report_kind not null,
  target_item_id uuid references public.items(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete cascade,
  reason public.report_reason not null,
  notes text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default now(),
  check (
    (kind = 'item' and target_item_id is not null and target_user_id is null)
    or (kind = 'user' and target_user_id is not null and target_item_id is null)
  )
);

alter table public.reports enable row level security;

-- Reporters can see their own reports; nobody else (admins use service role).
create policy "reports: read own" on public.reports
for select using (reporter_id = auth.uid());

create policy "reports: insert own" on public.reports
for insert with check (reporter_id = auth.uid());

-- ============ Moderation RPCs ============

create or replace function public.report_item(_item_id uuid, _reason public.report_reason, _notes text default null)
returns public.reports
language plpgsql security definer set search_path = public
as $$
declare r public.reports;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  insert into public.reports (reporter_id, kind, target_item_id, reason, notes)
  values (auth.uid(), 'item', _item_id, _reason, _notes)
  returning * into r;
  return r;
end;
$$;

create or replace function public.report_user(_user_id uuid, _reason public.report_reason, _notes text default null)
returns public.reports
language plpgsql security definer set search_path = public
as $$
declare r public.reports;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  insert into public.reports (reporter_id, kind, target_user_id, reason, notes)
  values (auth.uid(), 'user', _user_id, _reason, _notes)
  returning * into r;
  return r;
end;
$$;

create or replace function public.block_user(_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  if _user_id = auth.uid() then raise exception 'cannot_block_self'; end if;
  insert into public.blocked_users (blocker_id, blocked_id)
  values (auth.uid(), _user_id)
  on conflict do nothing;
end;
$$;

create or replace function public.unblock_user(_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;
  delete from public.blocked_users
  where blocker_id = auth.uid() and blocked_id = _user_id;
end;
$$;

-- ============ cancel_auction (seller only, before any bids) ============
create or replace function public.cancel_auction(_item_id uuid)
returns public.items
language plpgsql security definer set search_path = public
as $$
declare v_item public.items;
begin
  if auth.uid() is null then raise exception 'auth_required'; end if;

  select * into v_item from public.items where id = _item_id for update;
  if not found then raise exception 'item_not_found'; end if;
  if v_item.seller_id <> auth.uid() then raise exception 'not_seller'; end if;
  if v_item.status <> 'live' then raise exception 'not_live'; end if;

  update public.items set status = 'cancelled' where id = _item_id
  returning * into v_item;
  return v_item;
end;
$$;

-- ============ delete_my_account (Apple requirement) ============
-- Removes the user's auth row. ON DELETE CASCADE on profiles.id pulls their
-- groups, items, bids, blocks, tokens, and reports automatically.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'auth_required'; end if;
  delete from auth.users where id = uid;
end;
$$;

-- ============ Push notifications: trigger on bids ============
-- After a successful bid, find the previous top bidder (now outbid) and
-- send them an Expo Push notification via pg_net. We also notify the seller
-- of the new top bid.

create or replace function public.notify_on_bid()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  prev_bidder uuid;
  seller uuid;
  item_title text;
  tokens text[];
  payload jsonb;
begin
  select i.seller_id, i.title into seller, item_title from public.items i where i.id = new.item_id;

  -- Previous top bidder is the second-most-recent bid (the one before the just-inserted one).
  select bidder_id into prev_bidder
  from public.bids
  where item_id = new.item_id and id <> new.id
  order by created_at desc
  limit 1;

  -- Notify the now-outbid bidder.
  if prev_bidder is not null and prev_bidder <> new.bidder_id then
    select array_agg(token) into tokens from public.expo_push_tokens where user_id = prev_bidder;
    if tokens is not null and array_length(tokens, 1) > 0 then
      payload := jsonb_build_array(
        jsonb_build_object(
          'to', tokens,
          'sound', 'default',
          'title', 'You''ve been outbid',
          'body', format('Someone bid $%s on "%s"', new.amount::text, item_title),
          'data', jsonb_build_object('itemId', new.item_id, 'kind', 'outbid')
        )
      );
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := payload,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
      );
    end if;
  end if;

  -- Notify the seller of any new top bid.
  if seller is not null and seller <> new.bidder_id then
    select array_agg(token) into tokens from public.expo_push_tokens where user_id = seller;
    if tokens is not null and array_length(tokens, 1) > 0 then
      payload := jsonb_build_array(
        jsonb_build_object(
          'to', tokens,
          'sound', 'default',
          'title', 'New bid on your listing',
          'body', format('$%s on "%s"', new.amount::text, item_title),
          'data', jsonb_build_object('itemId', new.item_id, 'kind', 'new_bid')
        )
      );
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := payload,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_bid_inserted on public.bids;
create trigger on_bid_inserted
after insert on public.bids
for each row execute function public.notify_on_bid();

-- ============ Push: notify winners on settlement ============
create or replace function public.notify_on_settle()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  tokens text[];
  payload jsonb;
begin
  if new.status = 'settled' and old.status = 'live' and new.winner_id is not null then
    select array_agg(token) into tokens from public.expo_push_tokens where user_id = new.winner_id;
    if tokens is not null and array_length(tokens, 1) > 0 then
      payload := jsonb_build_array(
        jsonb_build_object(
          'to', tokens,
          'sound', 'default',
          'title', 'You won!',
          'body', format('"%s" is yours for $%s', new.title, coalesce(new.winning_bid, new.current_bid)::text),
          'data', jsonb_build_object('itemId', new.id, 'kind', 'won')
        )
      );
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := payload,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json')
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_item_settled on public.items;
create trigger on_item_settled
after update on public.items
for each row execute function public.notify_on_settle();
