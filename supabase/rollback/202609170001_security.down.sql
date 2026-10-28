-- Restores pre-migration permissions, including their known vulnerabilities.
-- Requires explicit deployment-owner approval, maintenance mode, and Phase 1 data rollback first.
-- Does not delete customer records. Use a forward repair for live installations instead.
begin;
do $$ declare p record; t text; begin
if to_regclass('public.closeout_requirements') is not null then raise exception 'Rollback closeout migration first'; end if;
for p in select * from pg_policies where schemaname='public' and policyname='abf_read' loop
execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
foreach t in array array['organizations','contractor_companies','profiles','projects','project_members','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications'] loop
execute format('revoke all on public.%I from public,anon,authenticated',t); end loop;
for p in select ddl from abf_private.security_backup where kind='policy' loop execute p.ddl; end loop;
for p in select ddl from abf_private.security_backup where kind='grant' loop execute p.ddl; end loop;
for p in select ddl from abf_private.security_backup where kind='function_grant' loop execute p.ddl; end loop;
end $$;
drop policy abf_storage_guard on storage.objects;
drop policy abf_storage_no_update on storage.objects;
drop policy abf_storage_no_delete on storage.objects;
drop policy abf_storage_no_anonymous on storage.objects;
drop policy abf_storage_read on storage.objects;
drop policy abf_storage_insert on storage.objects;
drop trigger abf_profile_guard on public.profiles;
drop function public.abf_workspace_command(text,jsonb);
drop function public.abf_storage_access(text,boolean);
drop function public.abf_write(uuid);
drop function public.abf_access(uuid);
drop function abf_private.profile_guard();
drop function abf_private.assert_member(uuid,uuid);
drop function abf_private.audit(uuid,text,jsonb);
drop function public.abf_role();
drop function public.abf_org();
drop table abf_private.security_backup;
-- Retain additive profiles.email for compatibility and preserve the private schema.
commit;
