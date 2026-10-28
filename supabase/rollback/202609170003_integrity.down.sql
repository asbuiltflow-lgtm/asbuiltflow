begin;
do $$ declare t text; begin
foreach t in array array['projects','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications'] loop
execute format('drop trigger abf_integrity on public.%I',t); end loop; end $$;
drop function abf_private.integrity_guard();
drop function public.abf_closeout_states();
commit;
