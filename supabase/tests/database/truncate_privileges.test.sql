begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

-- Effective privileges include PUBLIC and inherited grants.
select ok(not has_table_privilege(r, c.oid, 'TRUNCATE'),
          format('%s cannot TRUNCATE existing public.%s', r, c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
cross join unnest(array['anon', 'authenticated']) r
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname, r;

select ok(has_table_privilege('service_role', c.oid, 'TRUNCATE'),
          format('service_role retains TRUNCATE on public.%s', c.relname))
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r', 'p')
order by c.relname;

-- Check both global and schema-specific defaults: a schema REVOKE cannot
-- cancel a global grant. PUBLIC must not provide an indirect grant either.
select ok(not exists (
  select 1 from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole = creator::regrole and d.defaclobjtype = 'r'
    and d.defaclnamespace in (0, 'public'::regnamespace::oid)
    and a.grantee in (0, 'anon'::regrole::oid, 'authenticated'::regrole::oid)
    and a.privilege_type = 'TRUNCATE'
), format('%s defaults do not grant API/PUBLIC TRUNCATE', creator))
from unnest(array['postgres']) creator;

select ok(exists (
  select 1 from pg_default_acl d
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclrole = creator::regrole and d.defaclobjtype = 'r'
    and d.defaclnamespace in (0, 'public'::regnamespace::oid)
    and a.grantee = 'service_role'::regrole::oid
    and a.privilege_type = 'TRUNCATE'
), format('%s defaults preserve service_role TRUNCATE', creator))
from unnest(array['postgres']) creator;

-- Exercise postgres defaults with a real table.
set local role postgres;
create table public.truncate_test_postgres (id integer);
reset role;

select ok(not has_table_privilege(r, t, 'TRUNCATE'),
          format('%s cannot TRUNCATE new %s', r, t))
from unnest(array['anon', 'authenticated']) r
cross join unnest(array['public.truncate_test_postgres']) t;
select ok(has_table_privilege('service_role', t, 'TRUNCATE'),
          format('service_role retains default TRUNCATE on %s', t))
from unnest(array['public.truncate_test_postgres']) t;

select * from finish();
rollback;
