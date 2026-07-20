-- AsBuiltFlow 1.2 foundation schema
-- Run the entire file once in Supabase SQL Editor.
create extension if not exists "pgcrypto";

do $$ begin
  create type public.app_role as enum ('admin','project_manager','coordinator','inspector','contractor_admin','contractor_user','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum ('draft','submitted','coordinator_review','ready_for_inspection','inspector_review','needs_rework','revision_submitted','approved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.issue_status as enum ('open','in_progress','contractor_responded','ready_for_review','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.issue_priority as enum ('low','medium','high','critical');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.contractor_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(organization_id, name)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contractor_company_id uuid references public.contractor_companies(id) on delete set null,
  full_name text not null,
  role public.app_role not null default 'viewer',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contractor_company_id uuid references public.contractor_companies(id) on delete set null,
  project_number text not null,
  name text not null,
  description text default '',
  coordinator_id uuid references public.profiles(id) on delete set null,
  inspector_id uuid references public.profiles(id) on delete set null,
  status public.project_status not null default 'draft',
  due_date date,
  progress integer not null default 0 check(progress between 0 and 100),
  archived boolean not null default false,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(organization_id, project_number)
);

create table if not exists public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(project_id, profile_id)
);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  size_bytes bigint check(size_bytes is null or size_bytes >= 0),
  category text not null default 'Project File',
  caption text default '',
  revision_number integer,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  file_id uuid references public.files(id) on delete set null,
  label text,
  status public.project_status not null default 'revision_submitted',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(project_id, version)
);

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_number integer not null,
  title text not null,
  description text default '',
  sheet text,
  pin_x numeric check(pin_x is null or (pin_x between 0 and 100)),
  pin_y numeric check(pin_y is null or (pin_y between 0 and 100)),
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  due_date date,
  resolution_note text default '',
  created_by uuid not null references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, issue_number)
);

create table if not exists public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.current_profile()
returns public.profiles
language sql stable security definer set search_path=public
as $$ select * from public.profiles where id = auth.uid() $$;

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path=public
as $$ select organization_id from public.profiles where id = auth.uid() $$;

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select role from public.profiles where id = auth.uid() $$;

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
  insert into public.profiles(id, organization_id, full_name, role)
  values (auth.uid(), new_org.id, coalesce(auth.jwt()->'user_metadata'->>'full_name', split_part(auth.jwt()->>'email','@',1)), 'admin')
  returning * into new_profile;
  return new_profile;
end $$;

grant execute on function public.bootstrap_organization(text) to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists projects_updated_at on public.projects;
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
drop trigger if exists issues_updated_at on public.issues;
create trigger issues_updated_at before update on public.issues for each row execute function public.set_updated_at();

alter table public.organizations enable row level security;
alter table public.contractor_companies enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.files enable row level security;
alter table public.revisions enable row level security;
alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.project_checklist_items enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;

-- Read policies
create policy "members read organization" on public.organizations for select using (id = public.current_org_id());
create policy "members read contractor companies" on public.contractor_companies for select using (organization_id = public.current_org_id());
create policy "members read profiles" on public.profiles for select using (organization_id = public.current_org_id());
create policy "members read project members" on public.project_members for select using (exists(select 1 from public.projects p where p.id=project_id and p.organization_id=public.current_org_id()));

-- Admin/team management policies
create policy "admins manage profiles" on public.profiles for update using (organization_id=public.current_org_id() and public.current_role()='admin') with check (organization_id=public.current_org_id());
create policy "admins manage contractor companies" on public.contractor_companies for all using (organization_id=public.current_org_id() and public.current_role() in ('admin','project_manager')) with check (organization_id=public.current_org_id());

-- Project visibility: internal roles see org projects; contractor roles only assigned contractor company; viewers can read org projects.
create policy "role scoped project read" on public.projects for select using (
  organization_id=public.current_org_id() and (
    public.current_role() in ('admin','project_manager','coordinator','viewer') or
    (public.current_role()='inspector' and inspector_id=auth.uid()) or
    (public.current_role() in ('contractor_admin','contractor_user') and contractor_company_id=(select contractor_company_id from public.profiles where id=auth.uid()))
  )
);
create policy "staff create projects" on public.projects for insert with check (organization_id=public.current_org_id() and public.current_role() in ('admin','project_manager','coordinator'));
create policy "staff update projects" on public.projects for update using (organization_id=public.current_org_id() and public.current_role() in ('admin','project_manager','coordinator','inspector')) with check (organization_id=public.current_org_id());

-- Child rows inherit project visibility.
create policy "visible project files" on public.files for select using (exists(select 1 from public.projects p where p.id=project_id));
create policy "visible project revisions" on public.revisions for select using (exists(select 1 from public.projects p where p.id=project_id));
create policy "visible project issues" on public.issues for select using (exists(select 1 from public.projects p where p.id=project_id));
create policy "visible issue comments" on public.issue_comments for select using (exists(select 1 from public.issues i join public.projects p on p.id=i.project_id where i.id=issue_id));
create policy "visible project checklist" on public.project_checklist_items for select using (exists(select 1 from public.projects p where p.id=project_id));
create policy "visible project activity" on public.activity_events for select using (project_id is null or exists(select 1 from public.projects p where p.id=project_id));

create policy "project members upload files" on public.files for insert with check (organization_id=public.current_org_id() and exists(select 1 from public.projects p where p.id=project_id));
create policy "project members create revisions" on public.revisions for insert with check (organization_id=public.current_org_id() and exists(select 1 from public.projects p where p.id=project_id));
create policy "project members create issues" on public.issues for insert with check (organization_id=public.current_org_id() and exists(select 1 from public.projects p where p.id=project_id));
create policy "staff update issues" on public.issues for update using (organization_id=public.current_org_id() and exists(select 1 from public.projects p where p.id=project_id)) with check (organization_id=public.current_org_id());
create policy "project members comment" on public.issue_comments for insert with check (organization_id=public.current_org_id() and author_id=auth.uid());
create policy "staff manage checklist" on public.project_checklist_items for all using (organization_id=public.current_org_id() and exists(select 1 from public.projects p where p.id=project_id)) with check (organization_id=public.current_org_id());
create policy "members create activity" on public.activity_events for insert with check (organization_id=public.current_org_id() and actor_id=auth.uid());
create policy "own notifications" on public.notifications for select using (recipient_id=auth.uid());
create policy "own notifications update" on public.notifications for update using (recipient_id=auth.uid());

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('project-files','project-files',false,52428800,array['application/pdf','image/jpeg','image/png','image/heic','image/heif'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "authenticated project file read" on storage.objects for select to authenticated using (
  bucket_id='project-files' and (storage.foldername(name))[1]=public.current_org_id()::text
);
create policy "authenticated project file upload" on storage.objects for insert to authenticated with check (
  bucket_id='project-files' and (storage.foldername(name))[1]=public.current_org_id()::text
);
create policy "uploader or admins delete project file" on storage.objects for delete to authenticated using (
  bucket_id='project-files' and (storage.foldername(name))[1]=public.current_org_id()::text and public.current_role() in ('admin','project_manager','coordinator')
);
