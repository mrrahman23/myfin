-- =============================================================================
-- myFin — household shopping module, push targets, server-side month opening
-- =============================================================================
--   * A HOUSEHOLD is shared by its members (e.g. you and your spouse).
--     Finance data stays private: nothing here grants access to another
--     member's categories, obligations or transactions.
--   * HOUSEHOLD_ITEMS is the pantry catalogue (Rice, Oil, …).
--   * SHOPPING_REQUESTS is the shared list ("Rice is running low"). At most one
--     open request per item.
--   * HOUSEHOLD_PURCHASES records what was bought (qty, price, store). The app
--     learns consumption from purchases and "running low" signals to predict
--     when each item will run out.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
alter table public.user_settings
  add column finance_enabled boolean not null default true,
  add column notify_household_requests boolean not null default true,
  add column notify_household_purchases boolean not null default true,
  add column notify_household_predictions boolean not null default true;

-- ---------------------------------------------------------------------------
-- Types & tables
-- ---------------------------------------------------------------------------
create type public.household_role as enum ('owner', 'member');
create type public.request_status as enum ('open', 'bought', 'cancelled');
create type public.request_urgency as enum ('normal', 'urgent');

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_by  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         public.household_role not null default 'member',
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (household_id, user_id),
  unique (user_id) -- one household per person keeps the model simple
);

create table public.household_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  category     text check (char_length(category) <= 40),
  unit         text not null default 'pcs' check (char_length(btrim(unit)) between 1 and 12),
  default_qty  numeric(12, 3) check (default_qty > 0),
  is_archived  boolean not null default false,
  created_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, household_id)
);
create unique index household_items_name on public.household_items (household_id, lower(btrim(name)));

create table public.household_purchases (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  item_id        uuid not null,
  qty            numeric(12, 3) not null check (qty > 0),
  total_price    numeric(14, 2) check (total_price >= 0),
  purchased_on   date not null,
  store          text check (char_length(store) <= 80),
  notes          text check (char_length(notes) <= 300),
  purchased_by   uuid default auth.uid() references auth.users (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  client_ref     uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (household_id, client_ref),
  foreign key (item_id, household_id) references public.household_items (id, household_id) on delete cascade
);
create index household_purchases_item on public.household_purchases (item_id, purchased_on);

create table public.shopping_requests (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  item_id      uuid not null,
  qty          numeric(12, 3) check (qty > 0),
  urgency      public.request_urgency not null default 'normal',
  note         text check (char_length(note) <= 300),
  status       public.request_status not null default 'open',
  requested_by uuid default auth.uid() references auth.users (id) on delete set null,
  requested_at timestamptz not null default now(),
  resolved_by  uuid references auth.users (id) on delete set null,
  resolved_at  timestamptz,
  purchase_id  uuid references public.household_purchases (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (item_id, household_id) references public.household_items (id, household_id) on delete cascade
);
create unique index shopping_requests_one_open on public.shopping_requests (item_id) where status = 'open';
create index shopping_requests_household on public.shopping_requests (household_id, status, requested_at desc);

do $$
declare t text;
begin
  foreach t in array array['households','household_members','household_items','household_purchases','shopping_requests']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer avoids recursive RLS on members)
-- ---------------------------------------------------------------------------
create or replace function public.is_household_member(p_household uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.household_members where household_id = p_household and user_id = auth.uid())
$$;

create or replace function public.is_household_owner(p_household uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.household_members
                 where household_id = p_household and user_id = auth.uid() and role = 'owner')
$$;

create or replace function public.my_household_id()
returns uuid language sql stable security definer set search_path = public, pg_temp as $$
  select household_id from public.household_members where user_id = auth.uid()
$$;

-- A purchase may only point at the buyer's own finance transaction.
create or replace function public.household_purchases_check()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.transaction_id is not null
     and (tg_op = 'INSERT' or new.transaction_id is distinct from old.transaction_id)
     and not exists (select 1 from public.transactions where id = new.transaction_id and user_id = auth.uid()) then
    raise exception 'Linked transaction not found' using errcode = '23503';
  end if;
  return new;
end $$;

create trigger household_purchases_check before insert or update on public.household_purchases
for each row execute function public.household_purchases_check();

-- ---------------------------------------------------------------------------
-- RPC: create a household (caller becomes owner)
-- ---------------------------------------------------------------------------
create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'You are already in a household' using errcode = 'P0001';
  end if;
  insert into public.households (name, created_by) values (btrim(p_name), v_uid) returning id into v_id;
  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_id, v_uid, 'owner', coalesce(nullif(btrim(p_display_name), ''), 'Me'));
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: add something to the shared list (creates the item if needed).
-- Re-requesting an item that is already on the list updates that request.
-- ---------------------------------------------------------------------------
create or replace function public.request_household_item(
  p_item_id  uuid default null,
  p_name     text default null,
  p_unit     text default null,
  p_category text default null,
  p_qty      numeric default null,
  p_urgency  public.request_urgency default 'normal',
  p_note     text default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_hid  uuid := public.my_household_id();
  v_item uuid := p_item_id;
  v_req  uuid;
begin
  if v_hid is null then raise exception 'Create or join a household first' using errcode = 'P0001'; end if;
  if p_qty is not null and p_qty <= 0 then raise exception 'Quantity must be greater than zero' using errcode = '22023'; end if;

  if v_item is null then
    if p_name is null or btrim(p_name) = '' then raise exception 'Enter an item name' using errcode = '22023'; end if;
    select id into v_item from public.household_items
    where household_id = v_hid and lower(btrim(name)) = lower(btrim(p_name));
    if v_item is null then
      insert into public.household_items (household_id, name, unit, category, default_qty)
      values (v_hid, btrim(p_name), coalesce(nullif(btrim(p_unit), ''), 'pcs'), nullif(btrim(p_category), ''), p_qty)
      returning id into v_item;
    end if;
  end if;

  update public.household_items set is_archived = false
  where id = v_item and household_id = v_hid and is_archived;
  if not exists (select 1 from public.household_items where id = v_item and household_id = v_hid) then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  insert into public.shopping_requests (household_id, item_id, qty, urgency, note)
  values (v_hid, v_item, p_qty, coalesce(p_urgency, 'normal'), nullif(btrim(p_note), ''))
  on conflict (item_id) where status = 'open' do update
    set qty = coalesce(excluded.qty, shopping_requests.qty),
        urgency = case when excluded.urgency = 'urgent' then 'urgent'::public.request_urgency
                       else shopping_requests.urgency end,
        note = coalesce(excluded.note, shopping_requests.note)
  returning id into v_req;
  return v_req;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: record a purchase. Closes the item's open request and (optionally)
-- records the cost as an expense in the buyer's own finance ledger.
-- ---------------------------------------------------------------------------
create or replace function public.record_household_purchase(
  p_item_id           uuid,
  p_qty               numeric,
  p_total_price       numeric default null,
  p_purchased_on      date default null,
  p_store             text default null,
  p_add_expense       boolean default false,
  p_category_id       uuid default null,
  p_payment_method_id uuid default null,
  p_client_ref        uuid default null
) returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_uid   uuid := auth.uid();
  v_hid   uuid := public.my_household_id();
  v_item  public.household_items;
  v_date  date;
  v_cat   uuid := p_category_id;
  v_txn   uuid;
  v_id    uuid;
  v_ob    uuid;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if v_hid is null then raise exception 'Create or join a household first' using errcode = 'P0001'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero' using errcode = '22023'; end if;
  if p_total_price is not null and p_total_price < 0 then raise exception 'Price cannot be negative' using errcode = '22023'; end if;

  if p_client_ref is not null then
    select id into v_id from public.household_purchases where household_id = v_hid and client_ref = p_client_ref;
    if found then return v_id; end if;
  end if;

  select * into v_item from public.household_items where id = p_item_id and household_id = v_hid;
  if not found then raise exception 'Item not found' using errcode = 'P0002'; end if;
  v_date := coalesce(p_purchased_on, public.user_today(v_uid));

  if p_add_expense and coalesce(p_total_price, 0) > 0 then
    if v_cat is null then
      select id into v_cat from public.categories
      where user_id = v_uid and kind = 'expense' and lower(name) = 'groceries';
      if v_cat is null then
        insert into public.categories (user_id, kind, name, group_name, icon, default_budget, carry_forward, sort_order)
        values (v_uid, 'expense', 'Groceries', 'Food', 'shopping-cart', 0, false, 100)
        returning id into v_cat;
      end if;
    end if;
    -- count it against this month's budget item for the category, if there is one
    v_ob := public.carry_anchor_id(v_uid, v_cat, date_trunc('month', v_date)::date);
    insert into public.transactions (user_id, kind, amount, txn_date, category_id, payment_method_id, obligation_id,
                                     description, notes, client_ref)
    values (v_uid, 'expense', round(p_total_price, 2), v_date, v_cat,
            coalesce(p_payment_method_id, (select id from public.payment_methods where user_id = v_uid and is_default limit 1)),
            v_ob, left(v_item.name || ' · ' || trim(to_char(p_qty, 'FM999999990.###')) || ' ' || v_item.unit, 200),
            'Household purchase', p_client_ref)
    returning id into v_txn;
  end if;

  insert into public.household_purchases (household_id, item_id, qty, total_price, purchased_on, store, purchased_by,
                                          transaction_id, client_ref)
  values (v_hid, v_item.id, p_qty, round(p_total_price, 2), v_date, nullif(btrim(p_store), ''), v_uid, v_txn, p_client_ref)
  returning id into v_id;

  update public.shopping_requests
  set status = 'bought', resolved_by = v_uid, resolved_at = now(), purchase_id = v_id
  where item_id = v_item.id and status = 'open';

  update public.household_items set default_qty = coalesce(default_qty, p_qty) where id = v_item.id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Server-only helpers (service_role): invite members, open months for cron
-- ---------------------------------------------------------------------------
create or replace function public.household_add_member(
  p_household uuid, p_user uuid, p_display_name text, p_role public.household_role default 'member'
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.household_members where user_id = p_user and household_id <> p_household) then
    raise exception 'That person is already in another household' using errcode = 'P0001';
  end if;
  insert into public.household_members (household_id, user_id, role, display_name)
  values (p_household, p_user, p_role, coalesce(nullif(btrim(p_display_name), ''), 'Member'))
  on conflict (household_id, user_id) do update set display_name = excluded.display_name;
end $$;

create or replace function public.find_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = public, auth, pg_temp as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

-- ensure_month for a given user (cron); ensure_month() now delegates to it.
create or replace function public.ensure_month_for(p_user uuid, p_period date)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_period date := date_trunc('month', p_period)::date;
  v_end    date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_budget uuid;
  v_occ    uuid;
  v_ob     uuid;
  r        record;
  d        date;
begin
  if p_user is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  insert into public.monthly_budgets (user_id, period) values (p_user, v_period)
  on conflict (user_id, period) do nothing;
  select id into v_budget from public.monthly_budgets where user_id = p_user and period = v_period;

  for r in
    select rr.* from public.recurring_rules rr
    join public.categories c on c.id = rr.category_id
    where rr.user_id = p_user and rr.is_active and not c.is_archived
      and rr.start_date <= v_end and (rr.end_date is null or rr.end_date >= v_period)
    order by c.sort_order, rr.created_at
  loop
    for d in
      select * from public.rule_occurrences(r.frequency, r.interval_count, r.interval_unit, r.day_of_month,
                                            r.weekday, r.month_of_year, r.start_date, r.end_date, v_period)
    loop
      v_occ := null;
      insert into public.recurring_occurrences (user_id, rule_id, occurrence_date)
      values (p_user, r.id, d)
      on conflict (rule_id, occurrence_date) do nothing
      returning id into v_occ;

      if v_occ is not null then
        insert into public.obligations (user_id, period, category_id, recurring_rule_id, kind, name, budget_amount, due_date)
        values (p_user, v_period, r.category_id, r.id, r.kind, r.name, r.amount, d)
        returning id into v_ob;
        update public.recurring_occurrences set obligation_id = v_ob where id = v_occ;
      end if;
    end loop;
  end loop;
  return v_budget;
end $$;

create or replace function public.ensure_month(p_period date)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  return public.ensure_month_for(auth.uid(), p_period);
end $$;

-- ---------------------------------------------------------------------------
-- New users: household-only accounts (invited family members) get no finance
-- data and start in the Household section.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'household_only', 'false') = 'true' then
    insert into public.profiles (id, full_name) values (new.id, new.raw_user_meta_data ->> 'full_name')
    on conflict (id) do nothing;
    insert into public.user_settings (user_id, finance_enabled) values (new.id, false)
    on conflict (user_id) do nothing;
  else
    perform public.seed_user_defaults(new.id);
    update public.profiles set full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name)
    where id = new.id;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
create policy "members read" on public.households for select to authenticated using (public.is_household_member(id));
create policy "owner updates" on public.households for update to authenticated
  using (public.is_household_owner(id)) with check (public.is_household_owner(id));
create policy "owner deletes" on public.households for delete to authenticated using (public.is_household_owner(id));

alter table public.household_members enable row level security;
create policy "members read" on public.household_members for select to authenticated
  using (public.is_household_member(household_id));
create policy "edit own name" on public.household_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- owners remove others; members may leave
create policy "remove member" on public.household_members for delete to authenticated
  using ((user_id <> auth.uid() and public.is_household_owner(household_id)) or (user_id = auth.uid() and role = 'member'));

do $$
declare t text;
begin
  foreach t in array array['household_items','household_purchases','shopping_requests']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "household members" on public.%I for all to authenticated
                    using (public.is_household_member(household_id))
                    with check (public.is_household_member(household_id))', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on public.households, public.household_members, public.household_items,
              public.household_purchases, public.shopping_requests from anon;
grant select, update, delete on public.households to authenticated;
grant select, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.household_items, public.household_purchases, public.shopping_requests
  to authenticated;

revoke execute on function
  public.is_household_member(uuid), public.is_household_owner(uuid), public.my_household_id(),
  public.create_household(text, text),
  public.request_household_item(uuid, text, text, text, numeric, public.request_urgency, text),
  public.record_household_purchase(uuid, numeric, numeric, date, text, boolean, uuid, uuid, uuid),
  public.household_add_member(uuid, uuid, text, public.household_role),
  public.find_user_id_by_email(text),
  public.ensure_month_for(uuid, date),
  public.household_purchases_check()
  from public, anon;
grant execute on function
  public.is_household_member(uuid), public.is_household_owner(uuid), public.my_household_id(),
  public.create_household(text, text),
  public.request_household_item(uuid, text, text, text, numeric, public.request_urgency, text),
  public.record_household_purchase(uuid, numeric, numeric, date, text, boolean, uuid, uuid, uuid)
  to authenticated;

-- server-side (service_role) only
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function
      public.household_add_member(uuid, uuid, text, public.household_role),
      public.find_user_id_by_email(text),
      public.ensure_month_for(uuid, date),
      public.carry_anchor_id(uuid, uuid, date)
      to service_role;
    grant select, insert, update, delete on all tables in schema public to service_role;
    grant execute on all functions in schema public to service_role;
  end if;
end $$;

-- Live updates in the app (Supabase Realtime respects RLS)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shopping_requests, public.household_items, public.household_purchases;
  end if;
end $$;
