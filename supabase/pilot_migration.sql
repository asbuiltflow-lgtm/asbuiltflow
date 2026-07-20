-- AsBuiltFlow 1.3 controlled-pilot migration
-- Run this after the original schema.sql.

alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id and p.email is null;

create or replace function public.bootstrap_organization(org_name text default 'AsBuiltFlow')
returns public.profiles
language plpgsql security definer set search_path=public
as $$
declare
  new_org public.organizations;
  new_profile public.profiles;
  base_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into new_profile from public.profiles where id = auth.uid();
  if found then return new_profile; end if;
  base_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(auth.uid()::text,1,8);
  insert into public.organizations(name, slug) values (org_name, base_slug) returning * into new_org;
  insert into public.profiles(id, organization_id, full_name, email, role)
  values (
    auth.uid(), new_org.id,
    coalesce(auth.jwt()->'user_metadata'->>'full_name', split_part(auth.jwt()->>'email','@',1)),
    auth.jwt()->>'email', 'admin'
  ) returning * into new_profile;
  return new_profile;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.bootstrap_organization(text) to authenticated;
grant execute on function public.current_profile() to authenticated;
grant execute on function public.current_org_id() to authenticated;
grant execute on function public.current_role() to authenticated;

create or replace function public.can_access_project(target_project uuid)
returns boolean language sql stable security definer set search_path=public
as $$
  select exists (
    select 1 from public.projects p
    join public.profiles me on me.id = auth.uid()
    where p.id = target_project
      and p.organization_id = me.organization_id
      and me.active = true
      and (
        me.role in ('admin','project_manager','coordinator','viewer')
        or (me.role = 'inspector' and p.inspector_id = me.id)
        or (me.role in ('contractor_admin','contractor_user') and p.contractor_company_id = me.contractor_company_id)
        or exists(select 1 from public.project_members pm where pm.project_id=p.id and pm.profile_id=me.id)
      )
  )
$$;
grant execute on function public.can_access_project(uuid) to authenticated;

-- Replace child-table read/write policies with project-scoped checks.
drop policy if exists "visible project files" on public.files;
drop policy if exists "visible project revisions" on public.revisions;
drop policy if exists "visible project issues" on public.issues;
drop policy if exists "visible issue comments" on public.issue_comments;
drop policy if exists "visible project checklist" on public.project_checklist_items;
drop policy if exists "visible project activity" on public.activity_events;
drop policy if exists "project members upload files" on public.files;
drop policy if exists "project members create revisions" on public.revisions;
drop policy if exists "project members create issues" on public.issues;
drop policy if exists "staff update issues" on public.issues;
drop policy if exists "project members comment" on public.issue_comments;
drop policy if exists "staff manage checklist" on public.project_checklist_items;
drop policy if exists "members create activity" on public.activity_events;

create policy "project access files read" on public.files for select using (public.can_access_project(project_id));
create policy "project access revisions read" on public.revisions for select using (public.can_access_project(project_id));
create policy "project access issues read" on public.issues for select using (public.can_access_project(project_id));
create policy "project access comments read" on public.issue_comments for select using (exists(select 1 from public.issues i where i.id=issue_id and public.can_access_project(i.project_id)));
create policy "project access checklist read" on public.project_checklist_items for select using (public.can_access_project(project_id));
create policy "project access activity read" on public.activity_events for select using (project_id is null or public.can_access_project(project_id));

create policy "project access files insert" on public.files for insert with check (organization_id=public.current_org_id() and public.can_access_project(project_id) and uploaded_by=auth.uid());
create policy "project access revisions insert" on public.revisions for insert with check (organization_id=public.current_org_id() and public.can_access_project(project_id) and uploaded_by=auth.uid());
create policy "project access issues insert" on public.issues for insert with check (organization_id=public.current_org_id() and public.can_access_project(project_id) and created_by=auth.uid());
create policy "project access issues update" on public.issues for update using (public.can_access_project(project_id)) with check (organization_id=public.current_org_id() and public.can_access_project(project_id));
create policy "project access comments insert" on public.issue_comments for insert with check (organization_id=public.current_org_id() and author_id=auth.uid() and exists(select 1 from public.issues i where i.id=issue_id and public.can_access_project(i.project_id)));
create policy "project access checklist update" on public.project_checklist_items for update using (public.can_access_project(project_id)) with check (organization_id=public.current_org_id() and public.can_access_project(project_id));
create policy "project access checklist insert" on public.project_checklist_items for insert with check (organization_id=public.current_org_id() and public.can_access_project(project_id));
create policy "project access activity insert" on public.activity_events for insert with check (organization_id=public.current_org_id() and actor_id=auth.uid() and (project_id is null or public.can_access_project(project_id)));

-- Admin-only profile and contractor management.
drop policy if exists "admins manage profiles" on public.profiles;
create policy "admins update profiles" on public.profiles for update using (organization_id=public.current_org_id() and public.current_role()='admin') with check (organization_id=public.current_org_id());

-- Private file bucket. Free projects allow up to 50 MB per file.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('project-files','project-files',false,52428800,array['application/pdf','image/jpeg','image/png','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "project file object read" on storage.objects;
drop policy if exists "project file object insert" on storage.objects;
drop policy if exists "project file object delete" on storage.objects;
create policy "project file object read" on storage.objects for select to authenticated using (
  bucket_id='project-files' and public.can_access_project((storage.foldername(name))[2]::uuid)
);
create policy "project file object insert" on storage.objects for insert to authenticated with check (
  bucket_id='project-files'
  and (storage.foldername(name))[1] = public.current_org_id()::text
  and public.can_access_project((storage.foldername(name))[2]::uuid)
);
create policy "project file object delete" on storage.objects for delete to authenticated using (
  bucket_id='project-files'
  and public.current_role() in ('admin','project_manager','coordinator')
  and public.can_access_project((storage.foldername(name))[2]::uuid)
);

-- Realtime for collaborative pilot updates.
do $$ begin
  alter publication supabase_realtime add table public.projects;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.issues;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.issue_comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.activity_events;
exception when duplicate_object then null; end $$;

-- Basic in-app notifications for project status, issues, and comments.
create or replace function public.notify_project_people()
returns trigger language plpgsql security definer set search_path=public
as $$
declare recipient uuid;
begin
  for recipient in
    select distinct person_id from (
      select new.coordinator_id as person_id
      union all select new.inspector_id
      union all select pm.profile_id from public.project_members pm where pm.project_id=new.id
      union all select pr.id from public.profiles pr where pr.organization_id=new.organization_id and pr.contractor_company_id=new.contractor_company_id and pr.role in ('contractor_admin','contractor_user')
    ) people where person_id is not null and person_id <> auth.uid()
  loop
    insert into public.notifications(organization_id,recipient_id,title,body,link)
    values(new.organization_id,recipient,'Project updated',new.name||' is now '||replace(new.status::text,'_',' '),'/app');
  end loop;
  return new;
end $$;
drop trigger if exists projects_notify_people on public.projects;
create trigger projects_notify_people after update of status on public.projects for each row when (old.status is distinct from new.status) execute function public.notify_project_people();

create or replace function public.notify_issue_people()
returns trigger language plpgsql security definer set search_path=public
as $$
declare p public.projects; recipient uuid;
begin
  select * into p from public.projects where id=new.project_id;
  for recipient in
    select distinct person_id from (
      select p.coordinator_id as person_id
      union all select p.inspector_id
      union all select new.assigned_to
      union all select pr.id from public.profiles pr where pr.organization_id=p.organization_id and pr.contractor_company_id=p.contractor_company_id and pr.role in ('contractor_admin','contractor_user')
    ) people where person_id is not null and person_id <> auth.uid()
  loop
    insert into public.notifications(organization_id,recipient_id,title,body,link)
    values(new.organization_id,recipient,'Issue #'||new.issue_number,new.title,'/app');
  end loop;
  return new;
end $$;
drop trigger if exists issues_notify_people on public.issues;
create trigger issues_notify_people after insert on public.issues for each row execute function public.notify_issue_people();
