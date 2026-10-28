-- Apply transactionally after the legacy schema (any documented upgrade level).
-- No customer rows are rewritten. All historical objects remain intact.
create schema if not exists abf_private;
revoke all on schema abf_private from public, anon, authenticated;
create table abf_private.security_backup(kind text not null, ddl text not null);
-- Capture policies/grants for a controlled, pre-feature rollback.
insert into abf_private.security_backup
select 'policy', format('create policy %I on %I.%I as %s for %s to %s%s%s;',policyname,schemaname,tablename,permissive,cmd,
  array_to_string(array(select quote_ident(x) from unnest(roles) x),','),
  case when qual is null then '' else ' using ('||qual||')' end,
  case when with_check is null then '' else ' with check ('||with_check||')' end)
from pg_policies where schemaname='public' and tablename in
('organizations','contractor_companies','profiles','projects','project_members','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications');
insert into abf_private.security_backup
select 'grant',format('grant %s on %I.%I to %s%s;',privilege_type,table_schema,table_name,case when grantee='PUBLIC' then 'PUBLIC' else quote_ident(grantee) end,case when is_grantable='YES' then ' with grant option' else '' end)
from information_schema.table_privileges where table_schema='public' and grantee in ('anon','authenticated','PUBLIC') and table_name in
('organizations','contractor_companies','profiles','projects','project_members','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications');
insert into abf_private.security_backup
select 'function_grant',format('grant execute on function public.%I(%s) to %s%s;',routine_name,case when routine_name='bootstrap_organization' then 'text' else '' end,case when grantee='PUBLIC' then 'PUBLIC' else quote_ident(grantee) end,case when is_grantable='YES' then ' with grant option' else '' end)
from information_schema.routine_privileges where routine_schema='public' and routine_name in ('bootstrap_organization','current_profile') and grantee in ('anon','authenticated','PUBLIC');
do $$ declare p record; begin
for p in select * from pg_policies where schemaname='public' and tablename in
('organizations','contractor_companies','profiles','projects','project_members','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications') loop
execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename); end loop;
end $$;

alter table public.profiles add column if not exists email text;
create or replace function public.abf_org() returns uuid language sql stable security definer set search_path='' as
$$ select organization_id from public.profiles where id=auth.uid() and active $$;
create or replace function public.abf_role() returns text language sql stable security definer set search_path='' as
$$ select role::text from public.profiles where id=auth.uid() and active $$;
create or replace function public.abf_access(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
select exists(select 1 from public.projects p join public.profiles me on me.id=auth.uid()
where me.active and p.id=pid and p.organization_id=me.organization_id and (
me.role in ('admin','project_manager','coordinator','viewer') or
(me.role='inspector' and (p.inspector_id=me.id or exists(select 1 from public.project_members m where m.project_id=p.id and m.profile_id=me.id))) or
(me.role in ('contractor_admin','contractor_user') and p.contractor_company_id=me.contractor_company_id))) $$;
create or replace function public.abf_write(pid uuid) returns boolean language sql stable security definer set search_path='' as $$
select public.abf_access(pid) and public.abf_role() in ('admin','project_manager','coordinator','inspector','contractor_admin','contractor_user')
and exists(select 1 from public.projects where id=pid and not archived and status not in ('approved','closed')) $$;
create or replace function public.abf_storage_access(path text, writing boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare pid uuid; begin
if split_part(path,'/',1)<>public.abf_org()::text then return false; end if;
pid:=split_part(path,'/',2)::uuid;
return case when writing then public.abf_write(pid) else public.abf_access(pid) end;
exception when invalid_text_representation then return false; end $$;

-- Command-only writes. Even an old permissive policy cannot grant table privileges.
do $$ declare t text; begin
foreach t in array array['organizations','contractor_companies','profiles','projects','project_members','files','revisions','issues','issue_comments','project_checklist_items','activity_events','notifications'] loop
execute format('revoke all on public.%I from public, anon, authenticated',t);
execute format('grant select on public.%I to authenticated',t);
end loop; end $$;
create policy abf_read on public.organizations for select to authenticated using(id=public.abf_org());
create policy abf_read on public.profiles for select to authenticated using(organization_id=public.abf_org());
create policy abf_read on public.contractor_companies for select to authenticated using(organization_id=public.abf_org());
create policy abf_read on public.projects for select to authenticated using(public.abf_access(id));
create policy abf_read on public.project_members for select to authenticated using(public.abf_access(project_id));
create policy abf_read on public.files for select to authenticated using(organization_id=public.abf_org() and public.abf_access(project_id));
create policy abf_read on public.revisions for select to authenticated using(organization_id=public.abf_org() and public.abf_access(project_id));
create policy abf_read on public.issues for select to authenticated using(organization_id=public.abf_org() and public.abf_access(project_id));
create policy abf_read on public.issue_comments for select to authenticated using(organization_id=public.abf_org() and exists(select 1 from public.issues i where i.id=issue_id and public.abf_access(i.project_id)));
create policy abf_read on public.project_checklist_items for select to authenticated using(organization_id=public.abf_org() and public.abf_access(project_id));
create policy abf_read on public.activity_events for select to authenticated using(organization_id=public.abf_org() and (project_id is null or public.abf_access(project_id)));
create policy abf_read on public.notifications for select to authenticated using(organization_id=public.abf_org() and recipient_id=auth.uid());

-- Restrictive policies AND with all existing storage policies, including unknown legacy ones.
create policy abf_storage_guard on storage.objects as restrictive for all to authenticated
using(bucket_id<>'project-files' or public.abf_storage_access(name,false))
with check(bucket_id<>'project-files' or public.abf_storage_access(name,true));
create policy abf_storage_no_update on storage.objects as restrictive for update to authenticated using(bucket_id<>'project-files');
create policy abf_storage_no_delete on storage.objects as restrictive for delete to authenticated using(bucket_id<>'project-files');
create policy abf_storage_no_anonymous on storage.objects as restrictive for all to anon using(bucket_id<>'project-files') with check(bucket_id<>'project-files');
create policy abf_storage_read on storage.objects for select to authenticated using(bucket_id='project-files' and public.abf_storage_access(name,false));
create policy abf_storage_insert on storage.objects for insert to authenticated with check(bucket_id='project-files' and public.abf_storage_access(name,true));

-- Do not auto-provision an administrator when a profile is missing.
revoke execute on function public.bootstrap_organization(text) from public,anon,authenticated;
revoke execute on function public.current_profile() from public,anon,authenticated;

create function abf_private.audit(pid uuid, action text, details jsonb) returns void language sql security definer set search_path='' as $$
insert into public.activity_events(organization_id,project_id,actor_id,event_type,description,metadata)
values(public.abf_org(),pid,auth.uid(),action,replace(action,'_',' '),details||jsonb_build_object('actor_role',public.abf_role())) $$;
create function abf_private.assert_member(uid uuid, org uuid) returns void language plpgsql set search_path='' as $$
begin if uid is not null and not exists(select 1 from public.profiles where id=uid and organization_id=org and active)
then raise exception 'Invalid organization member'; end if; end $$;

-- Validate privileged Edge Function writes as well as commands. Existing rows are not rewritten.
create function abf_private.profile_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
if new.contractor_company_id is not null and not exists(select 1 from public.contractor_companies where id=new.contractor_company_id and organization_id=new.organization_id and active) then raise exception 'Invalid contractor company'; end if;
if new.role in ('contractor_admin','contractor_user') and new.contractor_company_id is null then raise exception 'Contractor company required'; end if;
if tg_op='UPDATE' and new.organization_id<>old.organization_id then raise exception 'Organization transfer is not permitted'; end if;
return new; end $$;
create trigger abf_profile_guard before insert or update on public.profiles for each row execute function abf_private.profile_guard();

create function public.abf_workspace_command(action text, payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles; p public.projects; i public.issues; f public.files; result jsonb; pid uuid; target uuid; n integer; next_status text; old_state jsonb;
begin
select * into me from public.profiles where id=auth.uid() and active;
if not found then raise exception 'Active membership required' using errcode='42501'; end if;
if action='notifications_read' then
update public.notifications set read_at=now() where recipient_id=me.id and organization_id=me.organization_id and read_at is null; return '{}'::jsonb;
end if;
if me.role='viewer' then raise exception 'Read-only membership' using errcode='42501'; end if;
if action='contractor_create' then
if me.role not in ('admin','project_manager') then raise exception 'Administrator required'; end if;
if length(trim(payload->>'name')) not between 1 and 200 then raise exception 'Company name required'; end if;
insert into public.contractor_companies(organization_id,name) values(me.organization_id,trim(payload->>'name')) returning to_jsonb(contractor_companies.*) into result;
elsif action='profile_update' then
if me.role<>'admin' then raise exception 'Administrator required'; end if;
target:=(payload->>'id')::uuid;
perform pg_advisory_xact_lock(hashtextextended(me.organization_id::text,0));
if target=me.id then raise exception 'Ask another administrator to change your access'; end if;
-- Inactive members may also be reactivated, but must belong to this tenant.
update public.profiles set full_name=coalesce(nullif(trim(payload->>'full_name'),''),full_name),role=(payload->>'role')::public.app_role,
contractor_company_id=nullif(payload->>'contractor_company_id','')::uuid,active=(payload->>'active')::boolean
where id=target and organization_id=me.organization_id returning to_jsonb(profiles.*) into result;
if result is null then raise exception 'Member not found'; end if;
elsif action='project_create' then
if me.role not in ('admin','project_manager','coordinator') then raise exception 'Project manager required'; end if;
if coalesce(length(trim(payload->>'name')),0)=0 or coalesce(length(trim(payload->>'projectNumber')),0)=0 then raise exception 'Project name and number required'; end if;
target:=nullif(payload->>'contractorCompanyId','')::uuid;
if target is not null and not exists(select 1 from public.contractor_companies where id=target and organization_id=me.organization_id and active) then raise exception 'Invalid contractor company'; end if;
perform abf_private.assert_member(nullif(payload->>'coordinatorId','')::uuid,me.organization_id);
perform abf_private.assert_member(nullif(payload->>'inspectorId','')::uuid,me.organization_id);
if nullif(payload->>'coordinatorId','') is not null and not exists(select 1 from public.profiles where id=(payload->>'coordinatorId')::uuid and role in ('admin','project_manager','coordinator')) then raise exception 'Invalid coordinator role'; end if;
if nullif(payload->>'inspectorId','') is not null and not exists(select 1 from public.profiles where id=(payload->>'inspectorId')::uuid and role='inspector') then raise exception 'Invalid inspector role'; end if;
insert into public.projects(organization_id,contractor_company_id,project_number,name,description,coordinator_id,inspector_id,due_date,created_by)
values(me.organization_id,target,trim(payload->>'projectNumber'),trim(payload->>'name'),coalesce(payload->>'description',''),nullif(payload->>'coordinatorId','')::uuid,nullif(payload->>'inspectorId','')::uuid,nullif(payload->>'dueDate','')::date,me.id)
returning * into p; pid:=p.id; result:=to_jsonb(p);
else
pid:=(payload->>'project_id')::uuid;
if not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
select * into p from public.projects where id=pid for update;
if p.archived or p.status in ('approved','closed') then raise exception 'Historical closed project is read-only'; end if;
if action='project_status' then
next_status:=payload->>'status';
-- Submission comes only from the evidence-snapshot command. Approval is deliberately unavailable in Phase 1.
if not ((me.role in ('admin','project_manager','coordinator') and p.status in ('submitted','revision_submitted') and next_status='coordinator_review') or
(me.role in ('admin','project_manager','coordinator','inspector') and p.status in ('submitted','revision_submitted','coordinator_review','ready_for_inspection','inspector_review') and next_status='needs_rework') or
(me.role in ('admin','project_manager','inspector') and p.status='ready_for_inspection' and next_status='inspector_review')) then raise exception 'Transition not permitted; use submission/completeness review. Final approval is not enabled in Phase 1'; end if;
old_state:=jsonb_build_object('status',p.status);
update public.projects set status=next_status::public.project_status where id=pid returning to_jsonb(projects.*) into result;
elsif action='issue_create' then
if me.role not in ('admin','project_manager','coordinator','inspector') then raise exception 'Reviewer required'; end if;
perform abf_private.assert_member(nullif(payload->>'assignedTo','')::uuid,me.organization_id);
if nullif(payload->>'assignedTo','') is not null and not exists(select 1 from public.profiles a where a.id=(payload->>'assignedTo')::uuid and
(a.role in ('admin','project_manager','coordinator','viewer') or
(a.role='inspector' and (a.id=p.inspector_id or exists(select 1 from public.project_members pm where pm.project_id=pid and pm.profile_id=a.id))) or
(a.role in ('contractor_admin','contractor_user') and a.contractor_company_id=p.contractor_company_id))) then raise exception 'Assignee must have project access'; end if;
select coalesce(max(issue_number),0)+1 into n from public.issues where project_id=pid;
if coalesce(length(trim(payload->>'title')),0)=0 then raise exception 'Title required'; end if;
insert into public.issues(organization_id,project_id,issue_number,title,description,sheet,priority,assigned_to,due_date,pin_x,pin_y,created_by)
values(me.organization_id,pid,n,trim(payload->>'title'),payload->>'description',payload->>'sheet',coalesce(payload->>'priority','medium')::public.issue_priority,nullif(payload->>'assignedTo','')::uuid,nullif(payload->>'dueDate','')::date,coalesce((payload->>'pinX')::numeric,50),coalesce((payload->>'pinY')::numeric,50),me.id) returning to_jsonb(issues.*) into result;
elsif action in ('issue_status','comment') then
select * into i from public.issues where id=(payload->>'id')::uuid and project_id=pid and organization_id=me.organization_id for update;
if not found then raise exception 'Issue not found'; end if;
if action='comment' then
if coalesce(length(trim(payload->>'body')),0) not between 1 and 20000 then raise exception 'Comment required (maximum 20000 characters)'; end if;
insert into public.issue_comments(organization_id,issue_id,author_id,body) values(me.organization_id,i.id,me.id,trim(payload->>'body')) returning to_jsonb(issue_comments.*) into result;
else
next_status:=payload->>'status';
if not ((me.role in ('contractor_admin','contractor_user') and
((i.status='open' and next_status='in_progress') or (i.status in ('open','in_progress') and next_status='contractor_responded') or (i.status='contractor_responded' and next_status='ready_for_review'))) or
(me.role in ('admin','project_manager','coordinator','inspector') and ((i.status='ready_for_review' and next_status='resolved') or (i.status='resolved' and next_status='closed') or (i.status<>'open' and next_status='open')))) then raise exception 'Issue transition not permitted'; end if;
old_state:=to_jsonb(i);
update public.issues set status=next_status::public.issue_status,resolved_at=case when next_status in ('resolved','closed') then now() else null end where id=i.id returning to_jsonb(issues.*) into result;
end if;
elsif action='checklist' then
if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
update public.project_checklist_items set completed_at=case when (payload->>'done')::boolean then now() else null end,completed_by=case when (payload->>'done')::boolean then me.id else null end
where id=(payload->>'id')::uuid and project_id=pid and organization_id=me.organization_id returning to_jsonb(project_checklist_items.*) into result;
if result is null then raise exception 'Checklist item not found'; end if;
elsif action='file_register' then
if not public.abf_storage_access(payload->>'path',true) or split_part(payload->>'path','/',2)<>pid::text then raise exception 'Invalid object path'; end if;
if not exists(select 1 from storage.objects where bucket_id='project-files' and name=payload->>'path' and owner_id=me.id::text) then raise exception 'Uploaded object not found or owned by another user'; end if;
select * into f from public.files where storage_path=payload->>'path';
if found then
if f.uploaded_by<>me.id or f.project_id<>pid then raise exception 'File ownership mismatch'; end if;
return to_jsonb(f); end if;
insert into public.files(organization_id,project_id,storage_path,file_name,mime_type,size_bytes,category,uploaded_by)
select me.organization_id,pid,o.name,left(payload->>'name',250),o.metadata->>'mimetype',(o.metadata->>'size')::bigint,left(coalesce(payload->>'category','Project File'),100),me.id
from storage.objects o where o.bucket_id='project-files' and o.name=payload->>'path' returning * into f;
result:=to_jsonb(f);
elsif action='revision_register' then
select * into f from public.files where id=(payload->>'file_id')::uuid and project_id=pid and organization_id=me.organization_id and uploaded_by=me.id;
if not found then raise exception 'Own project file required'; end if;
select to_jsonb(r.*) into result from public.revisions r where file_id=f.id and project_id=pid;
if result is not null then return result; end if;
select coalesce(max(version),0)+1 into n from public.revisions where project_id=pid;
insert into public.revisions(organization_id,project_id,version,file_id,label,status,uploaded_by) values(me.organization_id,pid,n,f.id,f.file_name,'draft',me.id) returning to_jsonb(revisions.*) into result;
else raise exception 'Unknown command'; end if;
end if;
perform abf_private.audit(pid,action,jsonb_build_object('before',old_state,'after',result));
return result;
end $$;

revoke all on all functions in schema abf_private from public,anon,authenticated;
revoke all on function public.abf_org(),public.abf_role(),public.abf_access(uuid),public.abf_write(uuid),public.abf_storage_access(text,boolean),public.abf_workspace_command(text,jsonb) from public,anon;
grant execute on function public.abf_org(),public.abf_role(),public.abf_access(uuid),public.abf_write(uuid),public.abf_storage_access(text,boolean),public.abf_workspace_command(text,jsonb) to authenticated;
