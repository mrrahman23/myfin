-- =============================================================================
-- myFin — personal finance & cash-flow schema
-- =============================================================================
-- Design notes
--   * Every money column is NUMERIC(14,2). No floating point anywhere.
--   * Every user-owned table carries user_id and is protected by RLS.
--   * Cross-table references use composite (id, user_id) foreign keys, so a row
--     can never point at another user's data even if a UUID is guessed.
--   * An OBLIGATION is one monthly line item (Rent for Nov 2026). Its charge is
--     coalesce(actual_amount, budget_amount).
--   * A TRANSACTION is real money moving. When it is linked to an obligation, a
--     trigger splits it into PAYMENT_ALLOCATIONS:
--       1. oldest carried-forward balances of the same category first (FIFO),
--          only when the category has carry_forward enabled and the target is
--          the month's "carry anchor" (earliest item of that category);
--       2. the remainder goes to the target obligation.
--     Each obligation's outstanding = charge - its own allocations, so a
--     carried balance is never duplicated: it is simply the unpaid remainder of
--     the original obligation, displayed in later months until settled.
--   * Month figures (received / paid) are cash basis, by transaction date.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.entry_kind as enum ('income', 'expense');
create type public.transaction_kind as enum ('income', 'expense', 'transfer', 'adjustment');
create type public.recurrence_frequency as enum ('monthly', 'weekly', 'yearly', 'custom');
create type public.recurrence_unit as enum ('day', 'week', 'month');
create type public.payment_method_type as enum ('cash', 'bank', 'card', 'mobile', 'other');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text check (char_length(full_name) <= 120),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.user_settings (
  user_id               uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  currency              char(3) not null default 'BDT',
  timezone              text not null default 'Asia/Dhaka',
  theme                 text not null default 'system' check (theme in ('system', 'light', 'dark')),
  notifications_enabled boolean not null default false,
  notify_overdue        boolean not null default true,
  reminder_days_before  smallint not null default 3 check (reminder_days_before between 0 and 30),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.categories (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            public.entry_kind not null,
  name            text not null check (char_length(btrim(name)) between 1 and 80),
  group_name      text check (char_length(group_name) <= 60),
  icon            text check (char_length(icon) <= 40),
  default_budget  numeric(14, 2) not null default 0 check (default_budget >= 0),
  default_due_day smallint check (default_due_day between 1 and 31),
  carry_forward   boolean not null default true,
  is_archived     boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name)
);

create table public.payment_methods (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  type        public.payment_method_type not null default 'other',
  is_default  boolean not null default false,
  is_archived boolean not null default false,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);
-- at most one default method per user
create unique index payment_methods_one_default on public.payment_methods (user_id) where is_default;

create table public.recurring_rules (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id    uuid not null,
  kind           public.entry_kind not null,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  amount         numeric(14, 2) not null check (amount >= 0),
  frequency      public.recurrence_frequency not null default 'monthly',
  interval_count smallint not null default 1 check (interval_count between 1 and 365),
  interval_unit  public.recurrence_unit,
  day_of_month   smallint check (day_of_month between 1 and 31),
  weekday        smallint check (weekday between 0 and 6),
  month_of_year  smallint check (month_of_year between 1 and 12),
  start_date     date not null,
  end_date       date,
  is_active      boolean not null default true,
  notes          text check (char_length(notes) <= 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade,
  check (end_date is null or end_date >= start_date),
  check (frequency <> 'custom' or interval_unit is not null),
  check (frequency <> 'weekly' or weekday is not null)
);

create table public.monthly_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  period      date not null check (period = date_trunc('month', period)::date),
  notes       text check (char_length(notes) <= 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, period)
);

create table public.obligations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  monthly_budget_id uuid,           -- filled by trigger from period
  period            date not null check (period = date_trunc('month', period)::date),
  category_id       uuid not null,
  recurring_rule_id uuid,
  kind              public.entry_kind not null,
  name              text not null check (char_length(btrim(name)) between 1 and 80),
  budget_amount     numeric(14, 2) not null default 0 check (budget_amount >= 0),
  actual_amount     numeric(14, 2) check (actual_amount >= 0),
  due_date          date,
  notes             text check (char_length(notes) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, user_id),
  foreign key (monthly_budget_id, user_id) references public.monthly_budgets (id, user_id) on delete cascade,
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict,
  foreign key (recurring_rule_id, user_id) references public.recurring_rules (id, user_id) on delete set null (recurring_rule_id)
);
create index obligations_user_period on public.obligations (user_id, period);
create index obligations_user_category on public.obligations (user_id, category_id, period);

-- Idempotency log for recurring generation. One row per (rule, occurrence date)
-- ever generated. Survives deletion of the obligation so a deleted item is not
-- silently re-created when the month is opened again.
create table public.recurring_occurrences (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  rule_id         uuid not null references public.recurring_rules (id) on delete cascade,
  occurrence_date date not null,
  obligation_id   uuid references public.obligations (id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (rule_id, occurrence_date)
);

create table public.transactions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind                 public.transaction_kind not null,
  amount               numeric(14, 2) not null,
  txn_date             date not null,
  category_id          uuid,
  payment_method_id    uuid,
  to_payment_method_id uuid,
  obligation_id        uuid,
  description          text check (char_length(description) <= 200),
  notes                text check (char_length(notes) <= 1000),
  client_ref           uuid,       -- idempotency key supplied by the client
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_ref),
  check ((kind = 'adjustment' and amount <> 0) or (kind <> 'adjustment' and amount > 0)),
  check (obligation_id is null or kind in ('income', 'expense')),
  check (kind = 'transfer' or to_payment_method_id is null),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id),
  foreign key (payment_method_id, user_id) references public.payment_methods (id, user_id) on delete set null (payment_method_id),
  foreign key (to_payment_method_id, user_id) references public.payment_methods (id, user_id) on delete set null (to_payment_method_id),
  foreign key (obligation_id, user_id) references public.obligations (id, user_id) on delete set null (obligation_id)
);
create index transactions_user_date on public.transactions (user_id, txn_date desc);
create index transactions_obligation on public.transactions (obligation_id);

create table public.payment_allocations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null,
  obligation_id  uuid not null,
  amount         numeric(14, 2) not null check (amount > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (transaction_id, obligation_id),
  foreign key (transaction_id, user_id) references public.transactions (id, user_id) on delete cascade,
  foreign key (obligation_id, user_id) references public.obligations (id, user_id) on delete cascade
);
create index payment_allocations_obligation on public.payment_allocations (obligation_id);

-- Future native/web push support (APNs device tokens or Web Push endpoints).
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  platform     text not null check (platform in ('web', 'ios', 'android')),
  endpoint     text not null check (char_length(endpoint) <= 2000),
  p256dh       text,
  auth_secret  text,
  user_agent   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, endpoint)
);

create table public.audit_log (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  table_name  text not null,
  record_id   uuid not null,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_user_created on public.audit_log (user_id, created_at desc);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['profiles','user_settings','categories','payment_methods','recurring_rules',
                           'monthly_budgets','obligations','transactions','payment_allocations','push_subscriptions']
  loop
    execute format('create trigger set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create view public.obligation_balances with (security_invoker = true) as
select
  o.*,
  coalesce(o.actual_amount, o.budget_amount)                          as amount_due,
  coalesce(a.paid, 0)::numeric(14, 2)                                 as paid_amount,
  (coalesce(o.actual_amount, o.budget_amount) - coalesce(a.paid, 0))::numeric(14, 2) as outstanding,
  a.last_paid_on,
  coalesce(a.payment_count, 0)::int                                   as payment_count
from public.obligations o
left join lateral (
  select sum(pa.amount) as paid, max(t.txn_date) as last_paid_on, count(*) as payment_count
  from public.payment_allocations pa
  join public.transactions t on t.id = pa.transaction_id
  where pa.obligation_id = o.id
) a on true;

-- The "carry anchor" is the item that receives carried-forward balances in a
-- month: the earliest-due item of that category in that period.
create or replace function public.carry_anchor_id(p_user uuid, p_category uuid, p_period date)
returns uuid language sql stable set search_path = public, pg_temp as $$
  select id from public.obligations
  where user_id = p_user and category_id = p_category and period = p_period
  order by due_date nulls last, created_at, id
  limit 1
$$;

create view public.obligation_status with (security_invoker = true) as
select
  b.*,
  c.name          as category_name,
  c.group_name    as category_group,
  c.icon          as category_icon,
  c.carry_forward as category_carry_forward,
  (b.id = public.carry_anchor_id(b.user_id, b.category_id, b.period)) as is_carry_anchor,
  case
    when c.carry_forward and b.id = public.carry_anchor_id(b.user_id, b.category_id, b.period) then
      coalesce((
        select sum(p.outstanding) from public.obligation_balances p
        where p.user_id = b.user_id and p.category_id = b.category_id
          and p.period < b.period and p.outstanding > 0
      ), 0)
    else 0
  end::numeric(14, 2) as carried_in
from public.obligation_balances b
join public.categories c on c.id = b.category_id;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create or replace function public.obligations_before_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_kind public.entry_kind;
begin
  select kind into v_kind from public.categories where id = new.category_id and user_id = new.user_id;
  if v_kind is null then
    raise exception 'Category not found' using errcode = '23503';
  end if;
  if v_kind <> new.kind then
    raise exception 'Category kind (%) does not match item kind (%)', v_kind, new.kind using errcode = '23514';
  end if;
  new.period := date_trunc('month', new.period)::date;
  if tg_op = 'INSERT' or new.period is distinct from old.period or new.monthly_budget_id is null then
    insert into public.monthly_budgets (user_id, period) values (new.user_id, new.period)
    on conflict (user_id, period) do nothing;
    select id into new.monthly_budget_id from public.monthly_budgets
    where user_id = new.user_id and period = new.period;
  end if;
  return new;
end $$;

create trigger obligations_before_write before insert or update on public.obligations
for each row execute function public.obligations_before_write();

create or replace function public.transactions_before_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare o record;
begin
  if new.obligation_id is not null then
    select kind, category_id into o from public.obligations where id = new.obligation_id and user_id = new.user_id;
    if not found then
      raise exception 'Linked item not found' using errcode = '23503';
    end if;
    if o.kind::text <> new.kind::text then
      raise exception 'A % transaction cannot settle an % item', new.kind, o.kind using errcode = '23514';
    end if;
    if new.category_id is null then
      new.category_id := o.category_id;
    end if;
  end if;
  return new;
end $$;

create trigger transactions_before_write before insert or update on public.transactions
for each row execute function public.transactions_before_write();

-- Split a transaction into allocations (FIFO over carried balances).
create or replace function public.allocate_transaction(p_transaction_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t         public.transactions;
  o         public.obligations;
  v_carry   boolean;
  v_left    numeric(14, 2);
  v_take    numeric(14, 2);
  r         record;
begin
  delete from public.payment_allocations where transaction_id = p_transaction_id;

  select * into t from public.transactions where id = p_transaction_id;
  if not found or t.obligation_id is null or t.kind not in ('income', 'expense') then
    return;
  end if;

  select * into o from public.obligations where id = t.obligation_id and user_id = t.user_id;
  if not found then
    return;
  end if;

  -- Serialise all payments touching this category (consistent lock order).
  perform 1 from public.obligations
  where user_id = o.user_id and category_id = o.category_id
  order by id for update;

  v_left := t.amount;
  select carry_forward into v_carry from public.categories where id = o.category_id;

  if v_carry and o.id = public.carry_anchor_id(o.user_id, o.category_id, o.period) then
    for r in
      select b.id, b.outstanding
      from public.obligation_balances b
      where b.user_id = o.user_id and b.category_id = o.category_id
        and b.period < o.period and b.outstanding > 0
      order by b.period, b.due_date nulls last, b.created_at, b.id
    loop
      exit when v_left <= 0;
      v_take := least(v_left, r.outstanding);
      insert into public.payment_allocations (user_id, transaction_id, obligation_id, amount)
      values (t.user_id, t.id, r.id, v_take);
      v_left := v_left - v_take;
    end loop;
  end if;

  if v_left > 0 then
    insert into public.payment_allocations (user_id, transaction_id, obligation_id, amount)
    values (t.user_id, t.id, o.id, v_left);
  end if;
end $$;

create or replace function public.transactions_after_write()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if current_setting('myfin.skip_allocation', true) = 'on' then
    return null;
  end if;
  if tg_op = 'INSERT'
     or new.amount is distinct from old.amount
     or new.kind is distinct from old.kind
     or new.obligation_id is distinct from old.obligation_id then
    perform public.allocate_transaction(new.id);
  end if;
  return null;
end $$;

create trigger transactions_after_write after insert or update on public.transactions
for each row execute function public.transactions_after_write();

-- Audit trail
create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    insert into public.audit_log (user_id, table_name, record_id, action, old_data)
    values (old.user_id, tg_table_name, old.id, tg_op, to_jsonb(old));
    return old;
  elsif tg_op = 'UPDATE' then
    insert into public.audit_log (user_id, table_name, record_id, action, old_data, new_data)
    values (new.user_id, tg_table_name, new.id, tg_op, to_jsonb(old), to_jsonb(new));
  else
    insert into public.audit_log (user_id, table_name, record_id, action, new_data)
    values (new.user_id, tg_table_name, new.id, tg_op, to_jsonb(new));
  end if;
  return new;
end $$;

create trigger audit_transactions after insert or update or delete on public.transactions
for each row execute function public.audit_row();
create trigger audit_obligations after insert or update or delete on public.obligations
for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- Recurrence
-- ---------------------------------------------------------------------------
-- All occurrence dates of a rule that fall inside the month of p_period.
create or replace function public.rule_occurrences(
  p_frequency     public.recurrence_frequency,
  p_interval      integer,
  p_unit          public.recurrence_unit,
  p_day_of_month  integer,
  p_weekday       integer,
  p_month_of_year integer,
  p_start         date,
  p_end           date,
  p_period        date
) returns setof date language plpgsql immutable as $$
declare
  v_first  date := date_trunc('month', p_period)::date;
  v_last   date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_months integer;
  v_step   integer;
  v_anchor date;
  d        date;
begin
  p_interval := greatest(coalesce(p_interval, 1), 1);
  if p_start is null or v_last < p_start or (p_end is not null and v_first > p_end) then
    return;
  end if;
  v_months := (extract(year from v_first)::int * 12 + extract(month from v_first)::int)
            - (extract(year from p_start)::int * 12 + extract(month from p_start)::int);

  if p_frequency = 'monthly' or (p_frequency = 'custom' and p_unit = 'month') then
    if v_months < 0 or v_months % p_interval <> 0 then return; end if;
    d := least(v_first + (coalesce(p_day_of_month, extract(day from p_start)::int) - 1), v_last);
    if p_end is null or d <= p_end then return next d; end if;

  elsif p_frequency = 'yearly' then
    if v_months < 0 or v_months % (12 * p_interval) <> 0 then
      -- allow month_of_year to differ from the start month
      if p_month_of_year is null
         or extract(month from v_first)::int <> p_month_of_year
         or (extract(year from v_first)::int - extract(year from p_start)::int) % p_interval <> 0 then
        return;
      end if;
    elsif p_month_of_year is not null and extract(month from v_first)::int <> p_month_of_year then
      return;
    end if;
    d := least(v_first + (coalesce(p_day_of_month, extract(day from p_start)::int) - 1), v_last);
    if d >= p_start and (p_end is null or d <= p_end) then return next d; end if;

  else -- weekly, or custom by day / week
    if p_frequency = 'weekly' then
      v_step := 7 * p_interval;
      v_anchor := p_start + ((coalesce(p_weekday, extract(dow from p_start)::int) - extract(dow from p_start)::int + 7) % 7);
    elsif p_unit = 'week' then
      v_step := 7 * p_interval;
      v_anchor := p_start;
    else
      v_step := p_interval;
      v_anchor := p_start;
    end if;
    if v_anchor >= v_first then
      d := v_anchor;
    else
      d := v_anchor + (ceil((v_first - v_anchor)::numeric / v_step)::int * v_step);
    end if;
    while d <= v_last and (p_end is null or d <= p_end) loop
      return next d;
      d := d + v_step;
    end loop;
  end if;
end $$;

create or replace function public.user_today(p_user uuid)
returns date language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone coalesce(
    (select timezone from public.user_settings where user_id = p_user), 'Asia/Dhaka'))::date
$$;

-- ---------------------------------------------------------------------------
-- RPC: open a month (idempotent)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_month(p_period date)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  v_period date := date_trunc('month', p_period)::date;
  v_end    date := (date_trunc('month', p_period) + interval '1 month - 1 day')::date;
  v_budget uuid;
  v_occ    uuid;
  v_ob     uuid;
  r        record;
  d        date;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  insert into public.monthly_budgets (user_id, period) values (v_uid, v_period)
  on conflict (user_id, period) do nothing;
  select id into v_budget from public.monthly_budgets where user_id = v_uid and period = v_period;

  for r in
    select rr.* from public.recurring_rules rr
    join public.categories c on c.id = rr.category_id
    where rr.user_id = v_uid and rr.is_active and not c.is_archived
      and rr.start_date <= v_end and (rr.end_date is null or rr.end_date >= v_period)
    order by c.sort_order, rr.created_at
  loop
    for d in
      select * from public.rule_occurrences(r.frequency, r.interval_count, r.interval_unit, r.day_of_month,
                                            r.weekday, r.month_of_year, r.start_date, r.end_date, v_period)
    loop
      v_occ := null;
      insert into public.recurring_occurrences (user_id, rule_id, occurrence_date)
      values (v_uid, r.id, d)
      on conflict (rule_id, occurrence_date) do nothing
      returning id into v_occ;

      if v_occ is not null then
        insert into public.obligations (user_id, period, category_id, recurring_rule_id, kind, name,
                                        budget_amount, due_date, notes)
        values (v_uid, v_period, r.category_id, r.id, r.kind, r.name, r.amount, d, null)
        returning id into v_ob;
        update public.recurring_occurrences set obligation_id = v_ob where id = v_occ;
      end if;
    end loop;
  end loop;

  return v_budget;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: total due for an item = carried-in (if anchor) + own outstanding
-- ---------------------------------------------------------------------------
create or replace function public.obligation_total_due(p_obligation_id uuid)
returns numeric language sql stable security definer set search_path = public, pg_temp as $$
  select s.carried_in + s.outstanding
  from public.obligation_status s
  where s.id = p_obligation_id and s.user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- RPC: record a payment / receipt against an item.
--   p_amount null => settle the full total due (one-tap "Paid").
--   p_client_ref  => idempotency key; repeated calls return the same txn.
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_obligation_id     uuid,
  p_amount            numeric default null,
  p_txn_date          date default null,
  p_payment_method_id uuid default null,
  p_notes             text default null,
  p_client_ref        uuid default null
) returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid    uuid := auth.uid();
  o        public.obligations;
  v_total  numeric(14, 2);
  v_txn    uuid;
  v_method uuid := p_payment_method_id;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;

  if p_client_ref is not null then
    select id into v_txn from public.transactions where user_id = v_uid and client_ref = p_client_ref;
    if found then return v_txn; end if;
  end if;

  select * into o from public.obligations where id = p_obligation_id and user_id = v_uid;
  if not found then raise exception 'Item not found' using errcode = 'P0002'; end if;

  -- lock the whole category chain so concurrent taps cannot double pay
  perform 1 from public.obligations
  where user_id = v_uid and category_id = o.category_id
  order by id for update;

  v_total := public.obligation_total_due(o.id);

  if p_amount is null then
    if v_total <= 0 then
      raise exception 'This item is already settled' using errcode = 'P0001';
    end if;
    p_amount := v_total;
  elsif p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22023';
  end if;

  if v_method is not null then
    perform 1 from public.payment_methods where id = v_method and user_id = v_uid;
    if not found then raise exception 'Payment method not found' using errcode = '23503'; end if;
  else
    select id into v_method from public.payment_methods where user_id = v_uid and is_default limit 1;
  end if;

  insert into public.transactions (user_id, kind, amount, txn_date, category_id, payment_method_id,
                                   obligation_id, description, notes, client_ref)
  values (v_uid, o.kind::text::public.transaction_kind, round(p_amount, 2),
          coalesce(p_txn_date, public.user_today(v_uid)), o.category_id, v_method,
          o.id, o.name, nullif(btrim(p_notes), ''), p_client_ref)
  returning id into v_txn;

  return v_txn;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: undo — remove every payment that was recorded against this item.
-- ---------------------------------------------------------------------------
create or replace function public.unmark_obligation(p_obligation_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_count integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  delete from public.transactions where user_id = v_uid and obligation_id = p_obligation_id;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: change an item's budget, optionally for every later month too.
-- ---------------------------------------------------------------------------
create or replace function public.update_obligation_budget(
  p_obligation_id uuid, p_budget numeric, p_apply_future boolean default false
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); o public.obligations;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_budget is null or p_budget < 0 then raise exception 'Budget must be zero or more' using errcode = '22023'; end if;
  update public.obligations set budget_amount = round(p_budget, 2)
  where id = p_obligation_id and user_id = v_uid returning * into o;
  if not found then raise exception 'Item not found' using errcode = 'P0002'; end if;
  if p_apply_future then
    if o.recurring_rule_id is not null then
      update public.recurring_rules set amount = round(p_budget, 2)
      where id = o.recurring_rule_id and user_id = v_uid;
      update public.obligations set budget_amount = round(p_budget, 2)
      where user_id = v_uid and recurring_rule_id = o.recurring_rule_id and period > o.period;
    end if;
    update public.categories set default_budget = round(p_budget, 2)
    where id = o.category_id and user_id = v_uid;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: duplicate a month's budget into another month.
-- ---------------------------------------------------------------------------
create or replace function public.copy_month_budget(p_from date, p_to date)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid  uuid := auth.uid();
  v_from date := date_trunc('month', p_from)::date;
  v_to   date := date_trunc('month', p_to)::date;
  v_last date := (date_trunc('month', p_to) + interval '1 month - 1 day')::date;
  v_n    integer := 0;
  v_k    integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if v_from = v_to then raise exception 'Choose a different month to copy from' using errcode = '22023'; end if;
  perform public.ensure_month(v_to);

  -- recurring items: carry the source month's budget amounts across
  update public.obligations t set budget_amount = s.budget_amount
  from (
    select distinct on (recurring_rule_id) recurring_rule_id, budget_amount
    from public.obligations
    where user_id = v_uid and period = v_from and recurring_rule_id is not null
    order by recurring_rule_id, due_date
  ) s
  where t.user_id = v_uid and t.period = v_to and t.recurring_rule_id = s.recurring_rule_id
    and t.budget_amount <> s.budget_amount;
  get diagnostics v_k = row_count; v_n := v_n + v_k;

  -- one-off items: copy if not already present
  insert into public.obligations (user_id, period, category_id, kind, name, budget_amount, due_date, notes)
  select v_uid, v_to, s.category_id, s.kind, s.name, s.budget_amount,
         case when s.due_date is null then null
              else least(v_to + (extract(day from s.due_date)::int - 1), v_last) end,
         s.notes
  from public.obligations s
  join public.categories c on c.id = s.category_id and not c.is_archived
  where s.user_id = v_uid and s.period = v_from and s.recurring_rule_id is null
    and not exists (
      select 1 from public.obligations t
      where t.user_id = v_uid and t.period = v_to and t.category_id = s.category_id and t.name = s.name
    );
  get diagnostics v_k = row_count; v_n := v_n + v_k;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- Default data for new users
-- ---------------------------------------------------------------------------
create or replace function public.seed_user_defaults(p_user uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_start date;
  r record;
  v_cat uuid;
  v_i integer := 0;
begin
  insert into public.profiles (id) values (p_user) on conflict do nothing;
  insert into public.user_settings (user_id) values (p_user) on conflict do nothing;

  if exists (select 1 from public.categories where user_id = p_user) then
    return;
  end if;

  v_start := date_trunc('month', public.user_today(p_user))::date;

  insert into public.payment_methods (user_id, name, type, is_default, sort_order) values
    (p_user, 'Bank Transfer', 'bank', true, 1),
    (p_user, 'Cash', 'cash', false, 2),
    (p_user, 'bKash', 'mobile', false, 3),
    (p_user, 'Credit Card', 'card', false, 4);

  for r in
    select * from (values
      ('income'::public.entry_kind,  'Salary',              'Employment',          'briefcase',     280000, 1),
      ('income',  'Shuttle',             'Allowances',          'bus',           100000, 1),
      ('income',  'Lunch Allowance',     'Allowances',          'utensils',       30000, 1),
      ('expense', 'Rent',                'Housing',             'home',           35000, 5),
      ('expense', 'Driver Salary',       'Household Staff',     'car',            30000, 1),
      ('expense', 'Electricity Bill',    'Utilities',           'zap',             6000, 15),
      ('expense', 'Gas Cylinders',       'Utilities',           'flame',           6500, 10),
      ('expense', 'Teacher Payment',     'Education',           'graduation-cap',  3000, 5),
      ('expense', 'Khala Payment',       'Household Staff',     'hand-heart',      5000, 1),
      ('expense', 'Mom Pocket Money',    'Family',              'heart',           5000, 1),
      ('expense', 'Sadia Pocket Money',  'Family',              'heart',           5000, 1),
      ('expense', 'Breakfast Bill',      'Food',                'coffee',          5000, 1),
      ('expense', 'DPS EBL',             'Savings & Investment','piggy-bank',     10000, 10),
      ('expense', 'EBL Credit Card Bill','Credit Cards',        'credit-card',    40000, 20),
      ('expense', 'AMEX Card Bill',      'Credit Cards',        'credit-card',    50000, 25),
      ('expense', 'Auto Loan',           'Loans',               'car-front',      80000, 10),
      ('expense', 'Personal Loan',       'Loans',               'landmark',       50000, 10),
      ('expense', 'LankaBangla Card',    'Credit Cards',        'credit-card',    20000, 20),
      ('expense', 'Dhaka Bank Card',     'Credit Cards',        'credit-card',    20000, 20),
      ('expense', 'IDLC Investment',     'Savings & Investment','trending-up',    30000, 15)
    ) as d(kind, name, grp, icon, amount, due_day)
  loop
    v_i := v_i + 1;
    insert into public.categories (user_id, kind, name, group_name, icon, default_budget, default_due_day, sort_order)
    values (p_user, r.kind, r.name, r.grp, r.icon, r.amount, r.due_day, v_i)
    returning id into v_cat;
    insert into public.recurring_rules (user_id, category_id, kind, name, amount, frequency, day_of_month, start_date)
    values (p_user, v_cat, r.kind, r.name, r.amount, 'monthly', r.due_day, v_start);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform public.seed_user_defaults(new.id);
  update public.profiles set full_name = coalesce(new.raw_user_meta_data ->> 'full_name', full_name)
  where id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Callable by a signed-in user whose account pre-dates this migration.
create or replace function public.seed_my_defaults()
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  perform public.seed_user_defaults(auth.uid());
end $$;

-- ---------------------------------------------------------------------------
-- Backup & restore (JSON). Restore replaces all of the caller's data.
-- IDs are remapped so a backup can be restored into any account.
-- ---------------------------------------------------------------------------
create or replace function public.restore_backup(p_data jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_counts jsonb := '{}'::jsonb;
  v_n integer;
begin
  if v_uid is null then raise exception 'Not authenticated' using errcode = '28000'; end if;
  if p_data ->> 'app' is distinct from 'myfin' then
    raise exception 'This file is not a myFin backup' using errcode = '22023';
  end if;

  create temp table _idmap (old_id uuid primary key, new_id uuid not null) on commit drop;
  insert into _idmap
  select (e ->> 'id')::uuid, gen_random_uuid()
  from (
    select jsonb_array_elements(coalesce(p_data -> 'categories', '[]')) e
    union all select jsonb_array_elements(coalesce(p_data -> 'payment_methods', '[]'))
    union all select jsonb_array_elements(coalesce(p_data -> 'recurring_rules', '[]'))
    union all select jsonb_array_elements(coalesce(p_data -> 'obligations', '[]'))
    union all select jsonb_array_elements(coalesce(p_data -> 'transactions', '[]'))
  ) s
  on conflict do nothing;

  -- wipe current data (order respects foreign keys)
  delete from public.transactions where user_id = v_uid;
  delete from public.obligations where user_id = v_uid;
  delete from public.monthly_budgets where user_id = v_uid;
  delete from public.recurring_rules where user_id = v_uid;
  delete from public.categories where user_id = v_uid;
  delete from public.payment_methods where user_id = v_uid;

  insert into public.categories (id, user_id, kind, name, group_name, icon, default_budget, default_due_day,
                                 carry_forward, is_archived, sort_order)
  select m.new_id, v_uid, x.kind, x.name, x.group_name, x.icon, x.default_budget, x.default_due_day,
         coalesce(x.carry_forward, true), coalesce(x.is_archived, false), coalesce(x.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_data -> 'categories', '[]')) as x(
    id uuid, kind public.entry_kind, name text, group_name text, icon text, default_budget numeric,
    default_due_day smallint, carry_forward boolean, is_archived boolean, sort_order integer)
  join _idmap m on m.old_id = x.id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('categories', v_n);

  insert into public.payment_methods (id, user_id, name, type, is_default, is_archived, sort_order)
  select m.new_id, v_uid, x.name, x.type, coalesce(x.is_default, false), coalesce(x.is_archived, false),
         coalesce(x.sort_order, 0)
  from jsonb_to_recordset(coalesce(p_data -> 'payment_methods', '[]')) as x(
    id uuid, name text, type public.payment_method_type, is_default boolean, is_archived boolean, sort_order integer)
  join _idmap m on m.old_id = x.id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('payment_methods', v_n);

  insert into public.recurring_rules (id, user_id, category_id, kind, name, amount, frequency, interval_count,
                                      interval_unit, day_of_month, weekday, month_of_year, start_date, end_date,
                                      is_active, notes)
  select m.new_id, v_uid, mc.new_id, x.kind, x.name, x.amount, x.frequency, coalesce(x.interval_count, 1),
         x.interval_unit, x.day_of_month, x.weekday, x.month_of_year, x.start_date, x.end_date,
         coalesce(x.is_active, true), x.notes
  from jsonb_to_recordset(coalesce(p_data -> 'recurring_rules', '[]')) as x(
    id uuid, category_id uuid, kind public.entry_kind, name text, amount numeric,
    frequency public.recurrence_frequency, interval_count smallint, interval_unit public.recurrence_unit,
    day_of_month smallint, weekday smallint, month_of_year smallint, start_date date, end_date date,
    is_active boolean, notes text)
  join _idmap m on m.old_id = x.id
  join _idmap mc on mc.old_id = x.category_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('recurring_rules', v_n);

  insert into public.obligations (id, user_id, period, category_id, recurring_rule_id, kind, name,
                                  budget_amount, actual_amount, due_date, notes)
  select m.new_id, v_uid, x.period, mc.new_id, mr.new_id, x.kind, x.name, x.budget_amount, x.actual_amount,
         x.due_date, x.notes
  from jsonb_to_recordset(coalesce(p_data -> 'obligations', '[]')) as x(
    id uuid, period date, category_id uuid, recurring_rule_id uuid, kind public.entry_kind, name text,
    budget_amount numeric, actual_amount numeric, due_date date, notes text)
  join _idmap m on m.old_id = x.id
  join _idmap mc on mc.old_id = x.category_id
  left join _idmap mr on mr.old_id = x.recurring_rule_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('obligations', v_n);

  -- mark restored recurring occurrences as generated so they are not re-created
  insert into public.recurring_occurrences (user_id, rule_id, occurrence_date, obligation_id)
  select v_uid, o.recurring_rule_id, o.due_date, o.id
  from public.obligations o
  where o.user_id = v_uid and o.recurring_rule_id is not null and o.due_date is not null
  on conflict (rule_id, occurrence_date) do nothing;

  -- monthly notes
  update public.monthly_budgets b set notes = x.notes
  from jsonb_to_recordset(coalesce(p_data -> 'monthly_budgets', '[]')) as x(period date, notes text)
  where b.user_id = v_uid and b.period = x.period and x.notes is not null;

  perform set_config('myfin.skip_allocation', 'on', true);

  insert into public.transactions (id, user_id, kind, amount, txn_date, category_id, payment_method_id,
                                   to_payment_method_id, obligation_id, description, notes, created_at)
  select m.new_id, v_uid, x.kind, x.amount, x.txn_date, mc.new_id, mp.new_id, mt.new_id, mo.new_id,
         x.description, x.notes, coalesce(x.created_at, now())
  from jsonb_to_recordset(coalesce(p_data -> 'transactions', '[]')) as x(
    id uuid, kind public.transaction_kind, amount numeric, txn_date date, category_id uuid,
    payment_method_id uuid, to_payment_method_id uuid, obligation_id uuid, description text, notes text,
    created_at timestamptz)
  join _idmap m on m.old_id = x.id
  left join _idmap mc on mc.old_id = x.category_id
  left join _idmap mp on mp.old_id = x.payment_method_id
  left join _idmap mt on mt.old_id = x.to_payment_method_id
  left join _idmap mo on mo.old_id = x.obligation_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('transactions', v_n);

  insert into public.payment_allocations (user_id, transaction_id, obligation_id, amount)
  select v_uid, mt.new_id, mo.new_id, x.amount
  from jsonb_to_recordset(coalesce(p_data -> 'payment_allocations', '[]')) as x(
    transaction_id uuid, obligation_id uuid, amount numeric)
  join _idmap mt on mt.old_id = x.transaction_id
  join _idmap mo on mo.old_id = x.obligation_id;
  get diagnostics v_n = row_count; v_counts := v_counts || jsonb_build_object('payment_allocations', v_n);

  perform set_config('myfin.skip_allocation', 'off', true);

  -- transactions linked to an item but with no allocations in the file
  perform public.allocate_transaction(t.id)
  from public.transactions t
  where t.user_id = v_uid and t.obligation_id is not null
    and not exists (select 1 from public.payment_allocations a where a.transaction_id = t.id);

  return v_counts;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

do $$
declare t text;
begin
  foreach t in array array['user_settings','categories','payment_methods','recurring_rules','monthly_budgets',
                           'obligations','transactions','push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows" on public.%I for all to authenticated
                    using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
  -- read-only to clients; written only by security-definer functions/triggers
  foreach t in array array['payment_allocations','recurring_occurrences','audit_log']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "own rows (read)" on public.%I for select to authenticated
                    using (user_id = auth.uid())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke insert, update, delete on public.payment_allocations, public.recurring_occurrences, public.audit_log
  from authenticated;
grant select on public.payment_allocations, public.recurring_occurrences, public.audit_log to authenticated;
grant select, insert, update, delete on
  public.profiles, public.user_settings, public.categories, public.payment_methods, public.recurring_rules,
  public.monthly_budgets, public.obligations, public.transactions, public.push_subscriptions
  to authenticated;
grant select on public.obligation_balances, public.obligation_status to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.ensure_month(date),
  public.obligation_total_due(uuid),
  public.record_payment(uuid, numeric, date, uuid, text, uuid),
  public.unmark_obligation(uuid),
  public.update_obligation_budget(uuid, numeric, boolean),
  public.copy_month_budget(date, date),
  public.seed_my_defaults(),
  public.restore_backup(jsonb),
  public.carry_anchor_id(uuid, uuid, date),
  public.rule_occurrences(public.recurrence_frequency, integer, public.recurrence_unit, integer, integer, integer, date, date, date),
  public.user_today(uuid)
  to authenticated;
