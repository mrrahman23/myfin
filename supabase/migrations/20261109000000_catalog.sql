-- =============================================================================
-- myFin — bilingual household catalogue with pictures
-- =============================================================================
--   * household_items gain a Bangla name, an emoji picture and an optional
--     photo (stored in the `household-photos` Storage bucket).
--   * Every household starts with a starter catalogue (English + বাংলা), so
--     family members can add things to the list with a single tap.
-- =============================================================================

alter table public.household_items
  add column name_bn   text check (char_length(name_bn) <= 80),
  add column emoji     text check (char_length(emoji) <= 16),
  add column image_url text check (char_length(image_url) <= 600),
  add column sort_order integer not null default 0;

-- ---------------------------------------------------------------------------
-- Starter catalogue
-- ---------------------------------------------------------------------------
create or replace function public.seed_household_catalog(p_household uuid)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  insert into public.household_items (household_id, name, name_bn, category, unit, default_qty, emoji, sort_order)
  select p_household, d.name, d.name_bn, d.category, d.unit, d.qty, d.emoji, d.ord
  from (values
    -- Grains, flour & staples
    ('Rice',               'চাল',               'Grains & Flour',  'kg',     5,    '🍚', 10),
    ('Atta',               'আটা',               'Grains & Flour',  'kg',     2,    '🌾', 11),
    ('Sugar',              'চিনি',              'Grains & Flour',  'kg',     1,    '🍬', 12),
    ('Salt',               'লবণ',               'Spices',          'kg',     1,    '🧂', 13),
    ('Puffed Rice (Muri)', 'মুড়ি',              'Snacks',          'kg',     0.5,  '🍘', 14),
    -- Oil
    ('Soybean Oil',        'সয়াবিন তেল',        'Oil & Ghee',      'L',      2,    '🛢️', 20),
    ('Mustard Oil',        'সরিষার তেল',        'Oil & Ghee',      'L',      1,    '🫙', 21),
    -- Lentils
    ('Masoor Dal',         'মসুর ডাল',          'Lentils & Pulses','kg',     1,    '🫘', 30),
    ('Mung Dal',           'মুগ ডাল',           'Lentils & Pulses','kg',     0.5,  '🫘', 31),
    ('Chana Dal',          'ছোলার ডাল',         'Lentils & Pulses','kg',     0.5,  '🫘', 32),
    ('Peas (Motor)',       'মটর',               'Lentils & Pulses','kg',     0.5,  '🫛', 33),
    -- Spices
    ('Turmeric Powder',    'হলুদ গুঁড়া',         'Spices',          'pack',   1,    '🟡', 40),
    ('Coriander Powder',   'ধনিয়া গুঁড়া',        'Spices',          'pack',   1,    '🫙', 41),
    ('Cumin Powder',       'জিরা গুঁড়া',          'Spices',          'pack',   1,    '🫙', 42),
    ('Garam Masala',       'গরম মসলা গুঁড়া',     'Spices',          'pack',   1,    '🫙', 43),
    ('Biryani Masala',     'বিরিয়ানি মসলা',      'Spices',          'pack',   1,    '🍛', 44),
    -- Vegetables
    ('Onion',              'পেঁয়াজ',             'Vegetables',      'kg',     2,    '🧅', 50),
    ('Garlic',             'রসুন',              'Vegetables',      'kg',     0.5,  '🧄', 51),
    ('Ginger',             'আদা',               'Vegetables',      'kg',     0.25, '🫚', 52),
    ('Green Chilli',       'কাঁচা মরিচ',         'Vegetables',      'g',      250,  '🌶️', 53),
    ('Coriander Leaves',   'ধনে পাতা',          'Vegetables',      'bunch',  1,    '🌿', 54),
    ('Tomato',             'টমেটো',             'Vegetables',      'kg',     1,    '🍅', 55),
    ('Potato',             'আলু',               'Vegetables',      'kg',     2,    '🥔', 56),
    ('Brinjal',            'বেগুন',             'Vegetables',      'pcs',    2,    '🍆', 57),
    ('Cucumber (Shosha)',  'শসা',               'Vegetables',      'kg',     0.5,  '🥒', 58),
    ('Pointed Gourd (Potol)','পটল',             'Vegetables',      'kg',     0.5,  '🥒', 59),
    ('Bitter Gourd (Korola)','করলা',            'Vegetables',      'pcs',    1,    '🥒', 60),
    ('Ash Gourd (Chal Kumra)','চাল কুমড়া',      'Vegetables',      'pcs',    1,    '🎃', 61),
    ('Okra (Dherosh)',     'ঢেঁড়স',             'Vegetables',      'kg',     0.5,  '🫛', 62),
    ('Flat Beans (Shim)',  'শিম',               'Vegetables',      'kg',     0.5,  '🫛', 63),
    ('Sponge Gourd (Dhundul)','ধুন্দল',         'Vegetables',      'kg',     0.5,  '🥒', 64),
    ('Spiny Gourd (Kakrol)','কাঁকরোল',          'Vegetables',      'kg',     0.5,  '🥒', 65),
    ('Snake Gourd (Chichinga)','চিচিঙ্গা',      'Vegetables',      'kg',     0.5,  '🥒', 66),
    ('Taro (Kochu)',       'ছোট কচু',           'Vegetables',      'kg',     0.5,  '🥔', 67),
    ('Lemon',              'লেবু',              'Vegetables',      'pcs',    4,    '🍋', 68),
    ('Red Amaranth (Lal Shak)','লাল শাক',       'Vegetables',      'bunch',  2,    '🥬', 69),
    ('Water Spinach (Kolmi Shak)','কলমি শাক',   'Vegetables',      'bunch',  2,    '🥬', 70),
    ('Leafy Greens (Shak)','শাক',               'Vegetables',      'bunch',  2,    '🥬', 71),
    -- Fruits
    ('Banana',             'কলা',               'Fruits',          'dozen',  1,    '🍌', 80),
    ('Apple',              'আপেল',              'Fruits',          'kg',     1,    '🍎', 81),
    ('Seasonal Fruit',     'মৌসুমি ফল',          'Fruits',          'kg',     1,    '🍉', 82),
    -- Fish, meat & eggs
    ('Chicken (Broiler)',  'মুরগি (ব্রয়লার)',     'Fish & Meat',     'kg',     1.5,  '🍗', 90),
    ('Chicken (Cock)',     'কক মুরগি',          'Fish & Meat',     'kg',     1,    '🐓', 91),
    ('Tilapia',            'তেলাপিয়া মাছ',      'Fish & Meat',     'kg',     1,    '🐟', 92),
    ('Small Fish',         'ছোট মাছ',           'Fish & Meat',     'kg',     0.5,  '🐟', 93),
    ('Fish',               'মাছ',               'Fish & Meat',     'kg',     1,    '🐠', 94),
    ('Eggs',               'ডিম',               'Dairy & Eggs',    'dozen',  1,    '🥚', 95),
    -- Dairy & drinks
    ('Liquid Milk',        'তরল দুধ',           'Dairy & Eggs',    'L',      1,    '🥛', 100),
    ('Milk Powder',        'গুঁড়া দুধ',          'Dairy & Eggs',    'pack',   1,    '🥛', 101),
    ('Sour Yogurt (Tok Doi)','টক দই',           'Dairy & Eggs',    'kg',     0.5,  '🥣', 102),
    ('Tea Leaves',         'চা পাতা',           'Beverages',       'pack',   1,    '🍵', 103),
    -- Snacks & frozen
    ('Chocolate Biscuits', 'চকলেট বিস্কুট',      'Snacks',          'pack',   2,    '🍪', 110),
    ('Frozen Paratha',     'ফ্রোজেন পরোটা',      'Frozen',          'pack',   1,    '🫓', 111),
    -- Baby
    ('Diapers',            'ডায়াপার',           'Baby',            'pack',   1,    '👶', 120),
    ('Baby Wipes',         'ওয়াইপস',            'Baby',            'pack',   1,    '🧴', 121),
    -- Personal care & cleaning
    ('Tissue Paper',       'টিস্যু পেপার',       'Personal care',   'pack',   1,    '🧻', 130),
    ('Toothpaste',         'টুথপেস্ট',           'Personal care',   'pcs',    1,    '🪥', 131),
    ('Kids Toothpaste',    'বাচ্চাদের টুথপেস্ট',  'Personal care',   'pcs',    1,    '🪥', 132),
    ('Bath Soap',          'গোসলের সাবান',       'Personal care',   'pcs',    1,    '🧼', 133),
    ('Washing Powder',     'ওয়াশিং পাউডার',     'Cleaning',        'pack',   1,    '🫧', 140),
    ('Laundry Soap',       'কাপড় কাচার সাবান',   'Cleaning',        'pcs',    2,    '🧼', 141),
    ('Dishwashing Liquid', 'থালা-বাসন ধোয়ার লিকুইড','Cleaning',     'bottle', 1,    '🍽️', 142)
  ) as d(name, name_bn, category, unit, qty, emoji, ord)
  on conflict (household_id, lower(btrim(name))) do update
    set name_bn    = coalesce(household_items.name_bn, excluded.name_bn),
        emoji      = coalesce(household_items.emoji, excluded.emoji),
        category   = coalesce(household_items.category, excluded.category),
        default_qty = coalesce(household_items.default_qty, excluded.default_qty),
        sort_order = case when household_items.sort_order = 0 then excluded.sort_order else household_items.sort_order end;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Members can (re)load the starter catalogue; existing items are kept.
create or replace function public.add_starter_items()
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_hid uuid := public.my_household_id();
begin
  if v_hid is null then raise exception 'Create or join a household first' using errcode = 'P0001'; end if;
  return public.seed_household_catalog(v_hid);
end $$;

-- New households start with the catalogue.
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
  perform public.seed_household_catalog(v_id);
  return v_id;
end $$;

revoke execute on function public.seed_household_catalog(uuid), public.add_starter_items() from public, anon;
grant execute on function public.add_starter_items() to authenticated;

-- ---------------------------------------------------------------------------
-- Photos: public-read bucket (unguessable paths), writes limited to members.
-- Path layout: <household_id>/<item_id>-<timestamp>.jpg
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage')
     and exists (select 1 from pg_tables where schemaname = 'storage' and tablename = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('household-photos', 'household-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$create policy "household photos: members upload" on storage.objects for insert to authenticated
      with check (bucket_id = 'household-photos'
                  and public.is_household_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "household photos: members update" on storage.objects for update to authenticated
      using (bucket_id = 'household-photos'
             and public.is_household_member(((storage.foldername(name))[1])::uuid))$p$;
    execute $p$create policy "household photos: members delete" on storage.objects for delete to authenticated
      using (bucket_id = 'household-photos'
             and public.is_household_member(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

-- Existing households get the catalogue too.
do $$
declare r record;
begin
  for r in select id from public.households loop
    perform public.seed_household_catalog(r.id);
  end loop;
end $$;
