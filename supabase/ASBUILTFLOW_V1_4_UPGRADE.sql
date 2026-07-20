-- AsBuiltFlow v1.4 backend upgrade
-- Run after schema.sql. Safe to re-run.

alter table public.profiles add column if not exists email text;
update public.profiles p set email=u.email from auth.users u where u.id=p.id and p.email is null;
create unique index if not exists profiles_email_unique_ci on public.profiles(lower(email)) where email is not null;

create index if not exists projects_org_status_idx on public.projects(organization_id,status);
create index if not exists projects_contractor_idx on public.projects(contractor_company_id);
create index if not exists projects_inspector_idx on public.projects(inspector_id);
create index if not exists files_project_created_idx on public.files(project_id,created_at desc);
create index if not exists revisions_project_version_idx on public.revisions(project_id,version desc);
create index if not exists issues_project_status_idx on public.issues(project_id,status);
create index if not exists issue_comments_issue_created_idx on public.issue_comments(issue_id,created_at);
create index if not exists notifications_recipient_read_idx on public.notifications(recipient_id,read_at,created_at desc);
create index if not exists activity_project_created_idx on public.activity_events(project_id,created_at desc);

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path=public
as $$ select organization_id from public.profiles where id=auth.uid() and active=true $$;

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select role from public.profiles where id=auth.uid() and active=true $$;

create or replace function public.can_access_project(target_project uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.projects p
    join public.profiles me on me.id=auth.uid()
    where p.id=target_project and p.organization_id=me.organization_id and me.active=true
      and (
        me.role in ('admin','project_manager','coordinator','viewer')
        or (me.role='inspector' and (p.inspector_id=me.id or exists(select 1 from public.project_members pm where pm.project_id=p.id and pm.profile_id=me.id)))
        or (me.role in ('contractor_admin','contractor_user') and p.contractor_company_id=me.contractor_company_id)
      )
  )
$$;

grant usage on schema public to authenticated, service_role;
grant select,insert,update,delete on all tables in schema public to authenticated, service_role;
grant usage,select on all sequences in schema public to authenticated, service_role;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_role() to authenticated;
grant execute on function public.can_access_project(uuid) to authenticated;

-- Project policies
drop policy if exists "role scoped project read" on public.projects;
create policy "role scoped project read" on public.projects for select to authenticated using(public.can_access_project(id));

drop policy if exists "staff create projects" on public.projects;
create policy "staff create projects" on public.projects for insert to authenticated
with check(organization_id=public.current_org_id() and created_by=auth.uid() and public.current_role() in ('admin','project_manager','coordinator'));

drop policy if exists "staff update projects" on public.projects;
create policy "staff update projects" on public.projects for update to authenticated
using(public.can_access_project(id) and public.current_role() in ('admin','project_manager','coordinator','inspector'))
with check(organization_id=public.current_org_id());

-- Project child policies
do $$
declare t text; p text;
begin
  foreach t in array array['files','revisions','issues','project_checklist_items','activity_events'] loop
    null;
  end loop;
end $$;

drop policy if exists "project access files read" on public.files;
drop policy if exists "visible project files" on public.files;
create policy "project files read" on public.files for select to authenticated using(public.can_access_project(project_id));
drop policy if exists "project access files insert" on public.files;
drop policy if exists "project members upload files" on public.files;
create policy "project files insert" on public.files for insert to authenticated with check(organization_id=public.current_org_id() and uploaded_by=auth.uid() and public.can_access_project(project_id));

drop policy if exists "project access revisions read" on public.revisions;
drop policy if exists "visible project revisions" on public.revisions;
create policy "project revisions read" on public.revisions for select to authenticated using(public.can_access_project(project_id));
drop policy if exists "project access revisions insert" on public.revisions;
drop policy if exists "project members create revisions" on public.revisions;
create policy "project revisions insert" on public.revisions for insert to authenticated with check(organization_id=public.current_org_id() and uploaded_by=auth.uid() and public.can_access_project(project_id));

drop policy if exists "project access issues read" on public.issues;
drop policy if exists "visible project issues" on public.issues;
create policy "project issues read" on public.issues for select to authenticated using(public.can_access_project(project_id));
drop policy if exists "project access issues insert" on public.issues;
drop policy if exists "project members create issues" on public.issues;
create policy "project issues insert" on public.issues for insert to authenticated with check(organization_id=public.current_org_id() and created_by=auth.uid() and public.can_access_project(project_id));
drop policy if exists "project access issues update" on public.issues;
drop policy if exists "staff update issues" on public.issues;
create policy "project issues update" on public.issues for update to authenticated using(public.can_access_project(project_id)) with check(organization_id=public.current_org_id());

drop policy if exists "project access comments read" on public.issue_comments;
drop policy if exists "visible issue comments" on public.issue_comments;
create policy "issue comments read" on public.issue_comments for select to authenticated using(exists(select 1 from public.issues i where i.id=issue_id and public.can_access_project(i.project_id)));
drop policy if exists "project access comments insert" on public.issue_comments;
drop policy if exists "project members comment" on public.issue_comments;
create policy "issue comments insert" on public.issue_comments for insert to authenticated with check(organization_id=public.current_org_id() and author_id=auth.uid() and exists(select 1 from public.issues i where i.id=issue_id and public.can_access_project(i.project_id)));

-- Private storage
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-files','project-files',false,52428800,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "authenticated project file read" on storage.objects;
drop policy if exists "authenticated project file upload" on storage.objects;
drop policy if exists "uploader or admins delete project file" on storage.objects;
drop policy if exists "project file object read" on storage.objects;
drop policy if exists "project file object insert" on storage.objects;
drop policy if exists "project file object delete" on storage.objects;
create policy "project file object read" on storage.objects for select to authenticated using(bucket_id='project-files' and public.can_access_project((storage.foldername(name))[2]::uuid));
create policy "project file object insert" on storage.objects for insert to authenticated with check(bucket_id='project-files' and (storage.foldername(name))[1]=public.current_org_id()::text and public.can_access_project((storage.foldername(name))[2]::uuid));
create policy "project file object delete" on storage.objects for delete to authenticated using(bucket_id='project-files' and public.current_role() in ('admin','project_manager','coordinator') and public.can_access_project((storage.foldername(name))[2]::uuid));

-- Notification triggers
create or replace function public.notify_project_people()
returns trigger language plpgsql security definer set search_path=public as $$
declare recipient uuid;
begin
  for recipient in select distinct person_id from(
    select new.coordinator_id person_id union all select new.inspector_id
    union all select pm.profile_id from public.project_members pm where pm.project_id=new.id
    union all select pr.id from public.profiles pr where pr.organization_id=new.organization_id and pr.contractor_company_id=new.contractor_company_id and pr.role in('contractor_admin','contractor_user') and pr.active=true
  ) q where person_id is not null and person_id is distinct from auth.uid()
  loop
    insert into public.notifications(organization_id,recipient_id,title,body,link)
    values(new.organization_id,recipient,'Project updated',new.name||' is now '||replace(new.status::text,'_',' '),'/app');
  end loop;
  return new;
end $$;
drop trigger if exists projects_notify_people on public.projects;
create trigger projects_notify_people after update of status on public.projects for each row when(old.status is distinct from new.status) execute function public.notify_project_people();

-- Realtime
do $$ begin alter publication supabase_realtime add table public.projects; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.issues; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.issue_comments; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.activity_events; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.notifications; exception when duplicate_object then null; end $$;
