-- TRUNCATE bypasses RLS. Remove it from API roles on current public tables.
-- PUBLIC is included so an indirect grant cannot retain API access.
-- Other privileges, including service_role grants, are preserved.
revoke truncate on all tables in schema public from anon, authenticated, public;

-- Prevent TRUNCATE grants on future public tables created by postgres.
-- supabase_admin defaults are outside this migration's scope.
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated, public;
