-- ============================================================================
-- Keep the server matcher in sync with the expanded profile options.
--
-- Adds the new relationship intentions (friends / casual / short / unsure) to
-- the commitment scale and treats 'Other' faith like 'Prefer not to say' (a
-- partial, not full, faith match). Mirrors the client's INTENTION_RANK /
-- FAITH_SHY exactly.
--
-- match_score() returns int (scalar), so CREATE OR REPLACE is fine — no drop.
-- Requires 0001-0008.
-- ============================================================================
create or replace function public.match_score(me public.profiles, cand public.profiles)
returns int language plpgsql immutable as $$
declare pts int := 0; mx int := 0; shared int; ri int; rj int; gap int;
begin
  -- shared values (max 30)
  mx := mx + 30;
  shared := cardinality(array(
    select unnest(coalesce(me."values",  '{}'::text[]))
    intersect
    select unnest(coalesce(cand."values",'{}'::text[]))));
  pts := pts + least(30, shared * 10);

  -- intention proximity (max 20) — commitment scale, 'unsure' sits mid-scale
  mx := mx + 20;
  ri := case me.intention
          when 'friends' then 0 when 'casual' then 1 when 'short' then 2
          when 'exploring' then 3 when 'unsure' then 3
          when 'committed' then 4 when 'marriage' then 5 else 3 end;
  rj := case cand.intention
          when 'friends' then 0 when 'casual' then 1 when 'short' then 2
          when 'exploring' then 3 when 'unsure' then 3
          when 'committed' then 4 when 'marriage' then 5 else 3 end;
  gap := abs(ri - rj);
  if gap = 0 then pts := pts + 20; elsif gap = 1 then pts := pts + 11; end if;

  -- faith (max 15) — 'Other' and 'Prefer not to say' give only a partial match
  mx := mx + 15;
  if me.faith is not null and me.faith = cand.faith
     and me.faith not in ('Prefer not to say','Other') then
    pts := pts + 15;
  elsif me.faith in ('Prefer not to say','Other') or cand.faith in ('Prefer not to say','Other') then
    pts := pts + 8;
  end if;

  -- family goals (max 15)
  mx := mx + 15;
  pts := pts + public.family_align(me.family_goal, cand.family_goal);

  -- mutual age fit (max 10)
  mx := mx + 10;
  if (cand.age between me.age_min and me.age_max) and (me.age between cand.age_min and cand.age_max) then
    pts := pts + 10;
  elsif (cand.age between me.age_min and me.age_max) or (me.age between cand.age_min and cand.age_max) then
    pts := pts + 5;
  end if;

  -- location (max 10)
  mx := mx + 10;
  if me.county is not null and me.county = cand.county then pts := pts + 10; end if;

  return round(pts::numeric / greatest(mx, 1) * 100);
end $$;
