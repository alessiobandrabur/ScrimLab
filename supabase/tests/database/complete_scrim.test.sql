begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions, pg_temp;
select no_plan();
create temporary table completion_fixture (name text primary key, id uuid default gen_random_uuid());
insert into completion_fixture(name) values
  ('alice'), ('bob'), ('session'), ('failed'), ('cancelled'), ('review'),
  ('bob_session'), ('bob_match'), ('bob_draft'), ('review_note');
grant select on completion_fixture to authenticated, anon;
create function pg_temp.cid(n text) returns uuid language sql stable security invoker
as $$ select id from pg_temp.completion_fixture where name = n $$;
insert into auth.users(id, email) select id, id::text || '@completion-test.invalid'
from completion_fixture where name in ('alice', 'bob');
insert into public.scrims(id, user_id, opponent_name, scheduled_for, status, session_type) values
  (pg_temp.cid('session'), pg_temp.cid('alice'), 'Scheduled opponent', now(), 'confirmed', 'scrim'),
  (pg_temp.cid('failed'), pg_temp.cid('alice'), 'Unchanged opponent', now(), 'planned', 'scrim'),
  (pg_temp.cid('cancelled'), pg_temp.cid('alice'), 'Cancelled opponent', now(), 'cancelled', 'scrim'),
  (pg_temp.cid('review'), pg_temp.cid('alice'), 'Review session', now(), 'planned', 'vod_review'),
  (pg_temp.cid('bob_session'), pg_temp.cid('bob'), 'Bob opponent', now(), 'planned', 'scrim');
insert into public.draft_plans(id, user_id, plan_name, opponent_name)
values (pg_temp.cid('bob_draft'), pg_temp.cid('bob'), 'Bob draft', 'Bob opponent');
insert into public.matches(id, user_id, opponent_name, played_on, our_score, opponent_score, scrim_id)
values (pg_temp.cid('bob_match'), pg_temp.cid('bob'), 'Bob opponent', '2026-10-10', 0, 1, pg_temp.cid('bob_session'));
insert into public.review_notes(id, user_id, scrim_id, video_timestamp_seconds, category, note)
values (pg_temp.cid('review_note'), pg_temp.cid('alice'), pg_temp.cid('session'), 10, 'other', 'Keep this review');

select set_config('request.jwt.claim.sub', pg_temp.cid('alice')::text, true);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.cid('alice'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.complete_scrim(pg_temp.cid('bob_session'), '2026-10-10', 1, 0)$$,
  '42501', 'Scrim is unavailable', 'Alice cannot complete Bob session');
select results_eq($$select id from public.matches where id = pg_temp.cid('bob_match')$$,
  $$select null::uuid where false$$, 'Alice cannot read Bob result');
select results_eq($$update public.matches set our_score = 5 where id = pg_temp.cid('bob_match') returning id$$,
  $$select null::uuid where false$$, 'Alice cannot edit Bob result');
select results_eq($$delete from public.matches where id = pg_temp.cid('bob_match') returning id$$,
  $$select null::uuid where false$$, 'Alice cannot delete Bob result');
select throws_ok($$insert into public.matches(opponent_name, played_on, our_score, opponent_score, scrim_id)
  values ('Other session', '2026-10-10', 1, 0, pg_temp.cid('bob_session'))$$,
  '42501', null, 'Alice cannot link a result to Bob session');
select throws_ok($$select public.complete_scrim(pg_temp.cid('cancelled'), '2026-10-10', 1, 0)$$,
  '22023', null, 'Cancelled sessions cannot be completed');
select throws_ok($$select public.complete_scrim(pg_temp.cid('review'), '2026-10-10', 1, 0)$$,
  '22023', null, 'VOD reviews cannot become match results');
select throws_ok($$select public.complete_scrim(pg_temp.cid('failed'), '2026-10-10', -1, 0)$$,
  '22023', null, 'Invalid scores rejected');
select throws_ok($$select public.complete_scrim(pg_temp.cid('failed'), '2026-10-10', 1, 0, null, pg_temp.cid('bob_draft'))$$,
  '42501', null, 'Foreign draft rejected by existing RLS');
select is((select status from public.scrims where id = pg_temp.cid('failed')), 'planned', 'Failed completion preserves session status');
select is((select count(*) from public.matches where scrim_id = pg_temp.cid('failed')), 0::bigint, 'Failed completion inserts no result');

select lives_ok($$select public.complete_scrim(pg_temp.cid('session'), '2026-10-10', 2, 1, 'Good block')$$,
  'Owner completes scheduled scrim');
select is((select status from public.scrims where id = pg_temp.cid('session')), 'completed', 'Session marked completed');
select results_eq($$select opponent_name, played_on, our_score, opponent_score, notes, user_id
  from public.matches where scrim_id = pg_temp.cid('session')$$,
  $$select 'Scheduled opponent'::text, '2026-10-10'::date, 2, 1, 'Good block'::text, pg_temp.cid('alice')$$,
  'Match history contains owned linked result and scheduled opponent');
select is(public.complete_scrim(pg_temp.cid('session'), '2026-10-11', 9, 9),
  (select id from public.matches where scrim_id = pg_temp.cid('session')), 'Retry returns existing result');
select is((select count(*) from public.matches where scrim_id = pg_temp.cid('session')), 1::bigint, 'Retry does not duplicate results');
select is((select our_score from public.matches where scrim_id = pg_temp.cid('session')), 2, 'Retry preserves existing score');
select is((select note from public.review_notes where id = pg_temp.cid('review_note')), 'Keep this review', 'Completion preserves review notes');
select throws_ok($$update public.matches set scrim_id = pg_temp.cid('bob_session') where scrim_id = pg_temp.cid('session')$$,
  '42501', null, 'Owner cannot relink to foreign session');
select throws_ok($$insert into public.matches(opponent_name, played_on, our_score, opponent_score, scrim_id)
  values ('Duplicate', '2026-10-10', 0, 0, pg_temp.cid('session'))$$,
  '23505', null, 'One result per scrim enforced');
select lives_ok($$update public.matches set our_score = 3 where scrim_id = pg_temp.cid('session')$$, 'Owner can edit their saved result');
select is((select our_score from public.matches where scrim_id = pg_temp.cid('session')), 3, 'Owner edit persists');
select lives_ok($$insert into public.matches(opponent_name, played_on, our_score, opponent_score)
  values ('Standalone', '2026-10-10', 0, 0)$$, 'Existing standalone match flow still allowed');

reset role;
select set_config('request.jwt.claim.sub', pg_temp.cid('bob')::text, true);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.cid('bob'), 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok($$select public.complete_scrim(pg_temp.cid('session'), '2026-10-10', 1, 0)$$,
  '42501', null, 'Bob cannot complete Alice session');
select is((select count(*) from public.matches where scrim_id = pg_temp.cid('session')), 0::bigint, 'Bob cannot read Alice linked result');
select results_eq($$update public.matches set our_score = 9 where scrim_id = pg_temp.cid('session') returning id$$,
  $$select null::uuid where false$$, 'Bob cannot edit Alice linked result');
select results_eq($$delete from public.matches where scrim_id = pg_temp.cid('session') returning id$$,
  $$select null::uuid where false$$, 'Bob cannot delete Alice linked result');
select is(public.complete_scrim(pg_temp.cid('bob_session'), '2026-10-10', 9, 9),
  pg_temp.cid('bob_match'), 'Bob can complete his session with an existing linked result');
select is((select status from public.scrims where id = pg_temp.cid('bob_session')), 'completed', 'Existing linked result still completes session');
select is((select our_score from public.matches where id = pg_temp.cid('bob_match')), 0, 'Existing linked score is preserved');

reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok($$select public.complete_scrim(pg_temp.cid('session'), '2026-10-10', 1, 0)$$,
  '42501', null, 'Anonymous cannot execute completion');

reset role;
select set_config('request.jwt.claim.sub', pg_temp.cid('alice')::text, true);
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.cid('alice'), 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok($$delete from public.scrims where id = pg_temp.cid('session')$$, 'Owner can delete their session');
select results_eq($$select our_score, scrim_id from public.matches where notes = 'Good block'$$,
  $$select 3, null::uuid$$, 'Deleting session preserves result and clears link');
reset role;
select * from finish();
rollback;
