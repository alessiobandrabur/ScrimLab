-- Existing results stay standalone. Deleting a session preserves its result.
alter table public.matches
  add column scrim_id uuid references public.scrims(id) on delete set null,
  add constraint matches_one_result_per_scrim unique (scrim_id);

-- Restrictive policies supplement the existing ownership/draft checks.
create policy "Match scrim links must belong to the owner"
  on public.matches as restrictive for insert to authenticated
  with check (scrim_id is null or exists (
    select 1 from public.scrims s
    where s.id = matches.scrim_id and s.user_id = auth.uid()
      and s.session_type = 'scrim'
  ));
create policy "Updated match scrim links must belong to the owner"
  on public.matches as restrictive for update to authenticated
  using (true)
  with check (scrim_id is null or exists (
    select 1 from public.scrims s
    where s.id = matches.scrim_id and s.user_id = auth.uid()
      and s.session_type = 'scrim'
  ));

-- SECURITY INVOKER keeps all existing RLS checks in effect.
-- Locking the session serializes duplicate submissions. Retrying an already
-- completed session returns its saved result without overwriting it.
create function public.complete_scrim(
  p_scrim_id uuid,
  p_played_on date,
  p_our_score integer,
  p_opponent_score integer,
  p_notes text default null,
  p_draft_plan_id uuid default null
) returns uuid
language plpgsql security invoker
set search_path = ''
as $$
declare
  session public.scrims%rowtype;
  result_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to complete a scrim' using errcode = '42501';
  end if;
  select * into session from public.scrims
    where id = p_scrim_id and user_id = auth.uid() for update;
  if not found then
    raise exception 'Scrim is unavailable' using errcode = '42501';
  end if;
  if session.session_type <> 'scrim' or session.status = 'cancelled' then
    raise exception 'Only an active scrim can have a result' using errcode = '22023';
  end if;
  select id into result_id from public.matches where scrim_id = session.id;
  if result_id is null then
    if p_played_on is null or p_our_score is null or p_opponent_score is null
       or p_our_score not between 0 and 99 or p_opponent_score not between 0 and 99
       or char_length(coalesce(p_notes, '')) > 1000 then
      raise exception 'Check the match date, scores, and notes' using errcode = '22023';
    end if;
    insert into public.matches (scrim_id, opponent_name, played_on,
      our_score, opponent_score, notes, draft_plan_id)
    values (session.id, session.opponent_name, p_played_on,
      p_our_score, p_opponent_score, nullif(btrim(p_notes), ''), p_draft_plan_id)
    returning id into result_id;
  end if;
  update public.scrims set status = 'completed' where id = session.id;
  return result_id;
end;
$$;

revoke all on function public.complete_scrim(uuid, date, integer, integer, text, uuid) from public, anon;
grant execute on function public.complete_scrim(uuid, date, integer, integer, text, uuid) to authenticated;
