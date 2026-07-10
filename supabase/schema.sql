-- AsBuiltFlow pilot schema for Supabase/Postgres.
-- Run this in the Supabase SQL editor after creating a new project.
create extension if not exists "pgcrypto";

create type public.app_role as enum ('admin','coordinator','inspector','contractor');
create type public.project_status as enum ('submitted','coordinator_review','ready_for_inspection','inspector_review','needs_rework','revision_submitted','approved');
create type public.issue_status as enum ('open','in_progress','ready_for_review','closed');
create type public.issue_priority as enum ('low','medium','high','critical');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'contractor',
  company_name text,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_number text not null,
  name text not null,
  description text default '',
  contractor_name text not null,
  coordinator_id uuid references public.profiles(id),
  inspector_id uuid references public.profiles(id),
  status public.project_status not null default 'submitted',
  due_date date,
  progress integer not null default 0 check(progress between 0 and 100),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid references public.projects(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete cascade,
  primary key(project_id, profile_id)
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  category text not null default 'Project File',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  file_id uuid references public.files(id),
  label text,
  status public.project_status not null default 'revision_submitted',
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(project_id, version)
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_number integer not null,
  title text not null,
  description text default '',
  sheet text,
  pin_x numeric,
  pin_y numeric,
  priority public.issue_priority not null default 'medium',
  status public.issue_status not null default 'open',
  assigned_to uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, issue_number)
);

create table public.issue_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  issue_id uuid not null references public.issues(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.current_org_id() returns uuid language sql stable security definer set search_path=public as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.files enable row level security;
alter table public.revisions enable row level security;
alter table public.issues enable row level security;
alter table public.issue_comments enable row level security;
alter table public.notifications enable row level security;

create policy "org members read org" on public.organizations for select using (id = public.current_org_id());
create policy "org profiles" on public.profiles for select using (organization_id = public.current_org_id());
create policy "org projects read" on public.projects for select using (organization_id = public.current_org_id());
create policy "org projects write" on public.projects for all using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());
create policy "org project members" on public.project_members for all using (exists(select 1 from public.projects p where p.id=project_id and p.organization_id=public.current_org_id())) with check (exists(select 1 from public.projects p where p.id=project_id and p.organization_id=public.current_org_id()));
create policy "org files" on public.files for all using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());
create policy "org revisions" on public.revisions for all using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());
create policy "org issues" on public.issues for all using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());
create policy "org comments" on public.issue_comments for all using (organization_id = public.current_org_id()) with check (organization_id = public.current_org_id());
create policy "own notifications" on public.notifications for select using (recipient_id = auth.uid());
create policy "own notifications update" on public.notifications for update using (recipient_id = auth.uid());

insert into storage.buckets (id, name, public) values ('project-files','project-files',false) on conflict (id) do nothing;
create policy "org file read" on storage.objects for select using (bucket_id='project-files' and (storage.foldername(name))[1]=public.current_org_id()::text);
create policy "org file upload" on storage.objects for insert with check (bucket_id='project-files' and (storage.foldername(name))[1]=public.current_org_id()::text);
