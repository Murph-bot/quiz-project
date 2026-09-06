-- 011_normalize_categories.sql
-- Canonicalize question categories to Title Case and enforce the list.
--
-- The DB accumulated mixed casing ('Geography' vs 'geography', 'History' vs
-- 'history') plus categories that were not in the old allow-list
-- ('science', 'sports', 'money'). Runtime matching is already
-- case-insensitive (ilike), so this is a data-hygiene + integrity change.
--
-- Apply manually in the Supabase SQL editor (no local CLI):
--   1. Run the UPDATE below.
--   2. Verify:  select distinct category from questions order by 1;
--      should return only the canonical values listed in the CHECK.
--   3. If any unexpected category remains, either map it to a canonical
--      value or extend the CHECK list, then run the ALTER.

update questions
set category = case lower(trim(category))
  when 'geography'          then 'Geography'
  when 'nature'             then 'Nature'
  when 'animals'            then 'Animals'
  when 'music industry'     then 'Music Industry'
  when 'nations'            then 'Nations'
  when 'popular products'   then 'Popular Products'
  when 'popular tools'      then 'Popular Tools'
  when 'history'            then 'History'
  when 'music instruments'  then 'Music Instruments'
  when 'sodas'              then 'Sodas'
  when 'alcoholic drinks'   then 'Alcoholic Drinks'
  when 'pop culture'        then 'Pop Culture'
  when 'movies'             then 'Movies'
  when 'formula 1'          then 'Formula 1'
  when 'food & drink'       then 'Food & Drink'
  when 'technology'         then 'Technology'
  when '00s nostalgia'      then '00s Nostalgia'
  when 'money'              then 'Money'
  when 'science'            then 'Science'
  when 'sports'             then 'Sports'
  else category
end;

alter table questions
  add constraint questions_category_check
  check (category = any (array[
    'Geography', 'Nature', 'Animals', 'Music Industry', 'Nations',
    'Popular Products', 'Popular Tools', 'History', 'Music Instruments',
    'Sodas', 'Alcoholic Drinks', 'Pop Culture', 'Movies', 'Formula 1',
    'Food & Drink', 'Technology', '00s Nostalgia', 'Money', 'Science',
    'Sports'
  ]));
