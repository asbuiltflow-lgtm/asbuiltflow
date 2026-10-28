-- Validate new/changed legacy relationships without rewriting historical records.
create function abf_private.integrity_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); pid uuid; org uuid; col text; linked uuid;
begin
org:=(j->>'organization_id')::uuid;
if tg_table_name='projects' then pid:=new.id; else pid:=nullif(j->>'project_id','')::uuid; end if;
if tg_op='UPDATE' and ((to_jsonb(old)->>'organization_id') is distinct from (j->>'organization_id') or (to_jsonb(old)->>'project_id') is distinct from (j->>'project_id')) then raise exception 'Tenant and parent project are immutable'; end if;
if tg_table_name<>'projects' and pid is not null and not exists(select 1 from public.projects where id=pid and organization_id=org) then raise exception 'Project tenant mismatch'; end if;
foreach col in array array['created_by','uploaded_by','assigned_to','coordinator_id','inspector_id','author_id','actor_id','completed_by','recipient_id'] loop
linked:=nullif(j->>col,'')::uuid;
if linked is not null and not exists(select 1 from public.profiles where id=linked and organization_id=org) then raise exception 'Member tenant mismatch: %',col; end if;
end loop;
linked:=nullif(j->>'contractor_company_id','')::uuid;
if linked is not null and not exists(select 1 from public.contractor_companies where id=linked and organization_id=org) then raise exception 'Company tenant mismatch'; end if;
if tg_table_name='revisions' and j->>'file_id' is not null and not exists(select 1 from public.files where id=(j->>'file_id')::uuid and project_id=pid and organization_id=org) then raise exception 'Revision file project mismatch'; end if;
if tg_table_name='issue_comments' and not exists(select 1 from public.issues where id=(j->>'issue_id')::uuid and organization_id=org) then raise exception 'Comment tenant mismatch'; end if;
return new;
end $$;
do $$ declare t text; begin
foreach t in array array['projects','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications'] loop
execute format('create trigger abf_integrity before insert or update on public.%I for each row execute function abf_private.integrity_guard()',t);
end loop; end $$;
revoke all on function abf_private.integrity_guard() from public,anon,authenticated;

-- One authorized request for dashboard metrics rather than a request per project.
create function public.abf_closeout_states() returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_object_agg(p.id,public.abf_closeout_state(p.id)),'{}') from public.projects p where not p.archived and public.abf_access(p.id)
$$;
revoke all on function public.abf_closeout_states() from public,anon;
grant execute on function public.abf_closeout_states() to authenticated;
