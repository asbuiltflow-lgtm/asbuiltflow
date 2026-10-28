-- Phase 1 extension: telecom job lifecycle, construction packages, field changes,
-- and structured assets. Historical Phase 1 rows are not rewritten.

create table public.construction_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null references public.projects,
  revision_number integer not null check (revision_number >= 0),
  revision_label text not null check (length(trim(revision_label)) between 1 and 160),
  status text not null default 'draft' check (status in ('draft','released','superseded')),
  notes text not null default '',
  created_by uuid not null references public.profiles,
  released_by uuid references public.profiles,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  unique(project_id, revision_number),
  unique(id, project_id, organization_id)
);

create unique index construction_packages_one_released
  on public.construction_packages(project_id) where status = 'released';

create table public.construction_package_files (
  package_id uuid not null,
  project_id uuid not null,
  organization_id uuid not null,
  file_id uuid not null references public.files,
  added_by uuid not null references public.profiles,
  added_at timestamptz not null default now(),
  primary key(package_id, file_id),
  foreign key(package_id, project_id, organization_id)
    references public.construction_packages(id, project_id, organization_id),
  foreign key(file_id) references public.files(id)
);

create table public.field_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null references public.projects,
  title text not null check (length(trim(title)) between 1 and 200),
  change_type text not null default 'other' check (change_type in ('pedestal','handhole','vault','bore','road_crossing','structure_conflict','splice_location','cable_routing','other')),
  description text not null default '',
  location text not null default '',
  status text not null default 'open' check (status in ('open','in_review','resolved','accepted')),
  resolution text not null default '',
  reported_by uuid not null references public.profiles,
  resulting_package_id uuid references public.construction_packages,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(id, project_id, organization_id)
);

create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null references public.projects,
  identifier text not null check (length(trim(identifier)) between 1 and 160),
  asset_type text not null check (asset_type in ('splice','handhole','vault','pedestal','pole','fiber_segment','tap','amplifier','splitter','node','equipment','bore','road_crossing','conduit','custom')),
  planned_description text not null default '',
  revised_description text not null default '',
  actual_description text not null default '',
  from_asset_id uuid references public.project_assets,
  to_asset_id uuid references public.project_assets,
  attributes jsonb not null default '{}'::jsonb check(jsonb_typeof(attributes)='object'),
  status text not null default 'planned' check (status in ('planned','revised','constructed','as_built','retired')),
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, identifier),
  unique(id, project_id, organization_id)
);

create table public.asset_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null references public.projects,
  imported_by uuid not null references public.profiles,
  status text not null default 'preview' check (status in ('preview','committed','rejected')),
  source_name text not null default '',
  row_count integer not null default 0 check (row_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

alter table public.closeout_requirements add column if not exists asset_id uuid references public.project_assets;
alter table public.closeout_requirements add column if not exists asset_type text;

create table public.lifecycle_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null references public.projects,
  actor_id uuid not null references public.profiles,
  action text not null,
  record jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.lifecycle_history enable row level security;
revoke all on public.lifecycle_history from public, anon, authenticated;
grant select on public.lifecycle_history to authenticated;
create policy abf_lifecycle_history_read on public.lifecycle_history for select to authenticated
  using (organization_id=public.abf_org() and public.abf_access(project_id));

alter table public.projects add column lifecycle_stage text not null default 'initial_package'
  check(lifecycle_stage in ('initial_package','walkout','released','construction','as_built','accepted_closeout'));
create table public.asset_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null references public.projects,
  asset_id uuid not null,
  resource_type text not null check(resource_type in ('requirement','evidence','issue','field_change')),
  resource_id uuid not null,
  created_by uuid not null references public.profiles,
  created_at timestamptz not null default now(),
  foreign key(asset_id,project_id,organization_id) references public.project_assets(id,project_id,organization_id),
  unique(asset_id,resource_type,resource_id)
);
create table public.closeout_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations,
  project_id uuid not null unique references public.projects,
  accepted_by uuid not null references public.profiles,
  accepted_at timestamptz not null default now(),
  snapshot jsonb not null
);
do $$ declare t text; begin
  foreach t in array array['asset_links','closeout_packages'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy abf_lifecycle_read on public.%I for select to authenticated using (organization_id=public.abf_org() and public.abf_access(project_id))',t);
  end loop;
end $$;

do $$ declare t text; begin
  foreach t in array array['construction_packages','construction_package_files','field_changes','project_assets','asset_imports'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

create policy abf_lifecycle_read on public.construction_packages for select to authenticated
  using (organization_id = public.abf_org() and public.abf_access(project_id));
create policy abf_lifecycle_files_read on public.construction_package_files for select to authenticated
  using (organization_id = public.abf_org() and public.abf_access(project_id));
create policy abf_lifecycle_changes_read on public.field_changes for select to authenticated
  using (organization_id = public.abf_org() and public.abf_access(project_id));
create policy abf_lifecycle_assets_read on public.project_assets for select to authenticated
  using (organization_id = public.abf_org() and public.abf_access(project_id));
create policy abf_lifecycle_imports_read on public.asset_imports for select to authenticated
  using (organization_id = public.abf_org() and public.abf_access(project_id));

create or replace function public.abf_lifecycle_command(action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles; p public.projects; result jsonb; pid uuid; target uuid; n integer; item jsonb; imported uuid; counts jsonb; snapshot jsonb; related uuid;
begin
  select * into me from public.profiles where id=auth.uid() and active;
  if not found then raise exception 'Active membership required' using errcode='42501'; end if;
  pid := nullif(payload->>'project_id','')::uuid;
  if pid is null or not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
  select * into p from public.projects where id=pid for update;
  if p.status in ('approved','closed') then raise exception 'Historical closed project is read-only'; end if;

  if action='package_create' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    select coalesce(max(revision_number),-1)+1 into n from public.construction_packages where project_id=pid;
    insert into public.construction_packages(organization_id,project_id,revision_number,revision_label,status,notes,created_by)
      values(me.organization_id,pid,n,trim(payload->>'revision_label'),'draft',coalesce(payload->>'notes',''),me.id)
      returning to_jsonb(construction_packages.*) into result;
  elsif action='package_release' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    target := (payload->>'package_id')::uuid;
    if not exists(select 1 from public.construction_packages where id=target and project_id=pid and status='draft') then raise exception 'Only a draft revision can be released'; end if;
    if exists(select 1 from public.construction_packages current_revision join public.construction_packages candidate on candidate.id=target where current_revision.project_id=pid and current_revision.status='released' and current_revision.revision_number>=candidate.revision_number) then raise exception 'Release a newer revision; historical revisions cannot become current again'; end if;
    if not exists(select 1 from public.construction_package_files where package_id=target) then raise exception 'Attach construction documents before release'; end if;
    if exists(select 1 from public.construction_packages where id=target and revision_number>0 and length(trim(notes))=0) then raise exception 'Explain revision changes before release'; end if;
    update public.construction_packages set status='superseded' where project_id=pid and status='released';
    update public.construction_packages set status='released',released_by=me.id,released_at=now() where id=target and project_id=pid returning to_jsonb(construction_packages.*) into result;
    if result is null then raise exception 'Package not found'; end if;
    update public.projects set lifecycle_stage='released' where id=pid;
  elsif action='package_attach' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    target := (payload->>'package_id')::uuid;
    if not exists(select 1 from public.construction_packages where id=target and project_id=pid and status='draft') then raise exception 'Only draft packages accept attachments'; end if;
    if not exists(select 1 from public.files where id=(payload->>'file_id')::uuid and project_id=pid and organization_id=me.organization_id) then raise exception 'Project file required'; end if;
    insert into public.construction_package_files(package_id,project_id,organization_id,file_id,added_by)
      values(target,pid,me.organization_id,(payload->>'file_id')::uuid,me.id)
      on conflict do nothing;
    result := jsonb_build_object('package_id',target);
  elsif action='lifecycle_advance' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    if not ((p.lifecycle_stage='initial_package' and payload->>'stage'='walkout') or
      (p.lifecycle_stage='released' and payload->>'stage'='construction') or
      (p.lifecycle_stage='construction' and payload->>'stage'='as_built')) then raise exception 'Invalid lifecycle transition'; end if;
    update public.projects set lifecycle_stage=payload->>'stage' where id=pid returning to_jsonb(projects.*) into result;
  elsif action='requirement_asset' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    target := nullif(payload->>'asset_id','')::uuid;
    if target is not null and not exists(select 1 from public.project_assets where id=target and project_id=pid) then raise exception 'Project asset required'; end if;
    if target is not null and nullif(payload->>'asset_type','') is not null then raise exception 'Choose asset or type, not both'; end if;
    if nullif(payload->>'asset_type','') is not null and payload->>'asset_type' not in ('splice','handhole','vault','pedestal','pole','fiber_segment','tap','amplifier','splitter','node','equipment','bore','road_crossing','conduit','custom') then raise exception 'Unknown asset type'; end if;
    update public.closeout_requirements set asset_id=target,asset_type=nullif(payload->>'asset_type',''),version=version+1
      where id=(payload->>'id')::uuid and project_id=pid and version=(payload->>'version')::int returning to_jsonb(closeout_requirements.*) into result;
    if result is null then raise exception 'Requirement changed; reload'; end if;
    if p.status<>'draft' then update public.projects set status='needs_rework' where id=pid; end if;
  elsif action='asset_link' then
    if me.role not in ('admin','project_manager','coordinator','inspector') then raise exception 'Asset editor required'; end if;
    target := (payload->>'asset_id')::uuid; related := (payload->>'resource_id')::uuid;
    if not exists(select 1 from public.project_assets where id=target and project_id=pid) then raise exception 'Project asset required'; end if;
    if not (case payload->>'resource_type'
      when 'requirement' then exists(select 1 from public.closeout_requirements where id=related and project_id=pid)
      when 'evidence' then exists(select 1 from public.evidence_versions where id=related and project_id=pid)
      when 'issue' then exists(select 1 from public.issues where id=related and project_id=pid)
      when 'field_change' then exists(select 1 from public.field_changes where id=related and project_id=pid)
      else false end) then raise exception 'Same-project resource required'; end if;
    insert into public.asset_links(organization_id,project_id,asset_id,resource_type,resource_id,created_by)
      values(me.organization_id,pid,target,payload->>'resource_type',related,me.id)
      on conflict(asset_id,resource_type,resource_id) do update set resource_id=excluded.resource_id
      returning to_jsonb(asset_links.*) into result;
    if payload->>'resource_type'='evidence' then
      update public.closeout_requirements set version=version+1 where id in
        (select d.requirement_id from public.deliverables d join public.evidence_versions v on v.deliverable_id=d.id where v.id=related);
      if p.status<>'draft' then update public.projects set status='needs_rework' where id=pid; end if;
    end if;
  elsif action='accept_closeout' then
    if me.role not in ('admin','inspector') then raise exception 'Inspector or admin required'; end if;
    if p.status<>'inspector_review' or p.lifecycle_stage<>'as_built' then raise exception 'As-built and inspector review required'; end if;
    counts:=public.abf_closeout_state(pid)->'counts';
    if (counts->>'required')::integer=0 or (counts->>'accepted')::integer<>(counts->>'required')::integer then raise exception 'All required evidence must be accepted'; end if;
    if exists(select 1 from public.closeout_submissions where id=(public.abf_closeout_state(pid)->'submission'->>'id')::uuid and submitted_by=me.id) then raise exception 'Independent inspector required'; end if;
    if exists(select 1 from public.issues where project_id=pid and status not in ('resolved','closed')) then raise exception 'Resolve all issues first'; end if;
    if exists(select 1 from public.field_changes where project_id=pid and status not in ('resolved','accepted')) then raise exception 'Resolve all field changes first'; end if;
    if not exists(select 1 from public.construction_packages where project_id=pid and status='released') then raise exception 'Released construction package required'; end if;
    if exists(select 1 from public.project_assets where project_id=pid and status<>'retired' and length(trim(actual_description))=0) then raise exception 'Record actual condition for every asset'; end if;
    snapshot:=jsonb_build_object('format','AsBuiltFlow closeout v1','project',to_jsonb(p),'closeout',public.abf_closeout_state(pid));
    snapshot:=snapshot||jsonb_build_object(
      'construction_packages',(select coalesce(jsonb_agg(x),'[]') from public.construction_packages x where project_id=pid),
      'package_files',(select coalesce(jsonb_agg(x),'[]') from public.construction_package_files x where project_id=pid),
      'assets',(select coalesce(jsonb_agg(x),'[]') from public.project_assets x where project_id=pid),
      'asset_links',(select coalesce(jsonb_agg(x),'[]') from public.asset_links x where project_id=pid),
      'field_changes',(select coalesce(jsonb_agg(x),'[]') from public.field_changes x where project_id=pid),
      'evidence_versions',(select coalesce(jsonb_agg(x),'[]') from public.evidence_versions x where project_id=pid),
      'deliverables',(select coalesce(jsonb_agg(x),'[]') from public.deliverables x where project_id=pid),
      'submissions',(select coalesce(jsonb_agg(x),'[]') from public.closeout_submissions x where project_id=pid),
      'reviews',(select coalesce(jsonb_agg(x),'[]') from public.completeness_reviews x where project_id=pid),
      'issues',(select coalesce(jsonb_agg(x),'[]') from public.issues x where project_id=pid),
      'files',(select coalesce(jsonb_agg(x),'[]') from public.files x where project_id=pid));
    insert into public.closeout_packages(organization_id,project_id,accepted_by,snapshot) values(me.organization_id,pid,me.id,snapshot) returning to_jsonb(closeout_packages.*) into result;
    update public.projects set status='approved',lifecycle_stage='accepted_closeout',progress=100 where id=pid;
  elsif action='field_change_create' then
    if me.role not in ('admin','project_manager','coordinator','inspector','contractor_admin','contractor_user') then raise exception 'Field change write denied' using errcode='42501'; end if;
    insert into public.field_changes(organization_id,project_id,title,change_type,description,location,reported_by)
      values(me.organization_id,pid,trim(payload->>'title'),coalesce(nullif(payload->>'change_type',''),'other'),coalesce(payload->>'description',''),coalesce(payload->>'location',''),me.id)
      returning to_jsonb(field_changes.*) into result;
  elsif action='field_change_resolve' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    target := (payload->>'package_id')::uuid;
    if not exists(select 1 from public.construction_packages where id=target and project_id=pid) then raise exception 'Project package required'; end if;
    if length(trim(coalesce(payload->>'resolution','')))=0 then raise exception 'Resolution required'; end if;
    update public.field_changes set status='resolved',resolution=payload->>'resolution',resulting_package_id=target,resolved_at=now()
      where id=(payload->>'id')::uuid and project_id=pid and status in ('open','in_review') returning to_jsonb(field_changes.*) into result;
    if result is null then raise exception 'Open field change not found'; end if;
  elsif action='asset_import' then
    if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
    if jsonb_typeof(payload->'rows') is distinct from 'array' then raise exception 'Import rows required'; end if;
    n := jsonb_array_length(payload->'rows');
    if n<1 or n>1000 then raise exception 'Import must contain 1 to 1000 rows'; end if;
    -- All inserts and the audit receipt commit together; uniqueness rejects duplicate IDs.
    insert into public.asset_imports(organization_id,project_id,imported_by,status,source_name,row_count,committed_at)
      values(me.organization_id,pid,me.id,'committed',left(coalesce(payload->>'source_name','CSV'),200),n,now()) returning id into imported;
    for item in select value from jsonb_array_elements(payload->'rows') loop
      insert into public.project_assets(organization_id,project_id,identifier,asset_type,planned_description,attributes,created_by)
        values(me.organization_id,pid,trim(item->>'identifier'),item->>'asset_type',coalesce(item->>'planned_description',''),coalesce(item->'attributes','{}'::jsonb),me.id) returning to_jsonb(project_assets.*) into result;
      insert into public.lifecycle_history(organization_id,project_id,actor_id,action,record) values(me.organization_id,pid,me.id,'asset_import_row',result);
    end loop;
    result := jsonb_build_object('import_id',imported,'row_count',n);
  elsif action='asset_upsert' then
    if me.role not in ('admin','project_manager','coordinator','inspector') then raise exception 'Asset write denied' using errcode='42501'; end if;
    if nullif(payload->>'from_asset_id','') is not null and not exists(select 1 from public.project_assets where id=(payload->>'from_asset_id')::uuid and project_id=pid) then raise exception 'From asset must belong to project'; end if;
    if nullif(payload->>'to_asset_id','') is not null and not exists(select 1 from public.project_assets where id=(payload->>'to_asset_id')::uuid and project_id=pid) then raise exception 'To asset must belong to project'; end if;
    insert into public.project_assets(organization_id,project_id,identifier,asset_type,planned_description,revised_description,actual_description,attributes,created_by)
      values(me.organization_id,pid,trim(payload->>'identifier'),payload->>'asset_type',coalesce(payload->>'planned_description',''),coalesce(payload->>'revised_description',''),coalesce(payload->>'actual_description',''),coalesce(payload->'attributes','{}'::jsonb),me.id)
      on conflict(project_id,identifier) do update set
        asset_type=excluded.asset_type,
        planned_description=case when payload ? 'planned_description' then excluded.planned_description else project_assets.planned_description end,
        revised_description=case when payload ? 'revised_description' then excluded.revised_description else project_assets.revised_description end,
        actual_description=case when payload ? 'actual_description' then excluded.actual_description else project_assets.actual_description end,
        attributes=case when payload ? 'attributes' then excluded.attributes else project_assets.attributes end,updated_at=now()
      returning to_jsonb(project_assets.*) into result;
    update public.project_assets set
      from_asset_id=case when payload ? 'from_asset_id' then nullif(payload->>'from_asset_id','')::uuid else from_asset_id end,
      to_asset_id=case when payload ? 'to_asset_id' then nullif(payload->>'to_asset_id','')::uuid else to_asset_id end,
      status=coalesce(nullif(payload->>'status',''),status)
      where id=(result->>'id')::uuid returning to_jsonb(project_assets.*) into result;
  else raise exception 'Unknown lifecycle action'; end if;
  -- Material construction changes invalidate review snapshots, not immutable prior decisions.
  if action in ('package_release','asset_upsert','asset_import','field_change_create') and p.status<>'draft' then
    update public.closeout_requirements set version=version+1 where project_id=pid;
    update public.projects set status='needs_rework' where id=pid;
  end if;
  insert into public.lifecycle_history(organization_id,project_id,actor_id,action,record) values(me.organization_id,pid,me.id,action,result);
  perform abf_private.audit(pid,action,jsonb_build_object('after',result));
  return result;
end $$;

revoke all on function public.abf_lifecycle_command(text,jsonb) from public, anon;
grant execute on function public.abf_lifecycle_command(text,jsonb) to authenticated;

create index field_changes_project_idx on public.field_changes(project_id,created_at desc);
create index project_assets_project_idx on public.project_assets(project_id,identifier);
create index construction_packages_project_idx on public.construction_packages(project_id,revision_number desc);
create index lifecycle_history_project_idx on public.lifecycle_history(project_id,created_at);
create index asset_links_project_idx on public.asset_links(project_id,asset_id);

-- Defense in depth for privileged imports as well as authenticated commands.
create function abf_private.lifecycle_integrity() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb:=to_jsonb(new); pid uuid:=(j->>'project_id')::uuid; org uuid:=(j->>'organization_id')::uuid; col text; uid uuid;
begin
  if not exists(select 1 from public.projects where id=pid and organization_id=org) then raise exception 'Lifecycle project tenant mismatch'; end if;
  if tg_op='UPDATE' and ((to_jsonb(old)->>'project_id') is distinct from (j->>'project_id') or (to_jsonb(old)->>'organization_id') is distinct from (j->>'organization_id')) then raise exception 'Lifecycle parent is immutable'; end if;
  foreach col in array array['created_by','added_by','released_by','reported_by','imported_by','actor_id','accepted_by'] loop
    uid:=nullif(j->>col,'')::uuid;
    if uid is not null and not exists(select 1 from public.profiles where id=uid and organization_id=org) then raise exception 'Lifecycle actor tenant mismatch'; end if;
  end loop;
  if tg_table_name='construction_package_files' and not exists(select 1 from public.files where id=(j->>'file_id')::uuid and project_id=pid and organization_id=org) then raise exception 'Package file tenant mismatch'; end if;
  if tg_table_name='field_changes' and j->>'resulting_package_id' is not null and not exists(select 1 from public.construction_packages where id=(j->>'resulting_package_id')::uuid and project_id=pid) then raise exception 'Field change package mismatch'; end if;
  if tg_table_name='project_assets' then
    foreach col in array array['from_asset_id','to_asset_id'] loop
      uid:=nullif(j->>col,'')::uuid;
      if uid is not null and (uid=(j->>'id')::uuid or not exists(select 1 from public.project_assets where id=uid and project_id=pid)) then raise exception 'Asset endpoint must be a different asset in this project'; end if;
    end loop;
  end if;
  return new;
end $$;
revoke all on function abf_private.lifecycle_integrity() from public,anon,authenticated;
do $$ declare t text; begin
  foreach t in array array['construction_packages','construction_package_files','field_changes','project_assets','asset_imports','lifecycle_history','asset_links','closeout_packages'] loop
    execute format('create trigger abf_lifecycle_integrity before insert or update on public.%I for each row execute function abf_private.lifecycle_integrity()',t);
  end loop;
end $$;

-- Save the exact installed state function for a guarded pre-data rollback.
create table abf_private.lifecycle_function_backup as select pg_get_functiondef('public.abf_closeout_state(uuid)'::regprocedure) as definition;
revoke all on abf_private.lifecycle_function_backup from public,anon,authenticated;
create or replace function public.abf_closeout_state(pid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r record; s public.closeout_submissions; decision text; evidence_ids jsonb; snapshot_ids jsonb; status text;
rows jsonb:='[]'; total integer:=0; accepted integer:=0; missing integer:=0; pending integer:=0; corrections integer:=0; n integer;
begin
if not public.abf_access(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
select * into s from public.closeout_submissions where project_id=pid order by sequence desc limit 1;
for r in select * from public.closeout_requirements where project_id=pid order by created_at,id loop
select coalesce(jsonb_agg(v.id order by v.id),'[]'),count(*) into evidence_ids,n from public.evidence_versions v
join public.deliverables d on d.id=v.deliverable_id where d.requirement_id=r.id and v.version=(select max(x.version) from public.evidence_versions x where x.deliverable_id=d.id);
select coalesce(jsonb_agg(v.id order by v.id),'[]') into snapshot_ids from public.submission_evidence se
join public.evidence_versions v on v.id=se.version_id join public.deliverables d on d.id=v.deliverable_id
where se.submission_id=s.id and d.requirement_id=r.id;
select cr.decision into decision from public.completeness_reviews cr where cr.submission_id=s.id and cr.requirement_id=r.id;
if n<r.minimum_count or (
  (r.asset_id is not null or r.asset_type is not null) and (
    not exists(select 1 from public.project_assets a where a.project_id=pid and (a.id=r.asset_id or a.asset_type=r.asset_type))
    or exists(select 1 from public.project_assets a where a.project_id=pid and (a.id=r.asset_id or a.asset_type=r.asset_type)
      and not exists(select 1 from public.asset_links l join public.evidence_versions v on v.id=l.resource_id
        join public.deliverables d on d.id=v.deliverable_id
        where l.asset_id=a.id and l.resource_type='evidence' and d.requirement_id=r.id
        and v.version=(select max(x.version) from public.evidence_versions x where x.deliverable_id=d.id)))
  )
) then status:='missing';
elsif s.id is null or evidence_ids<>snapshot_ids or not exists(select 1 from jsonb_array_elements(s.requirements_snapshot) j where (j->>'id')::uuid=r.id and (j->>'version')::integer=r.version) then status:='pending_submission';
else status:=coalesce(decision,'pending_review'); end if;
rows:=rows||jsonb_build_array(to_jsonb(r)||jsonb_build_object('state',status,'evidence_count',n,'decision_reason',(select reason from public.completeness_reviews where submission_id=s.id and requirement_id=r.id)));
if r.required then
total:=total+1;
if status='accepted' then accepted:=accepted+1;
elsif status='missing' then missing:=missing+1;
elsif status='changes_requested' then corrections:=corrections+1;
else pending:=pending+1; end if;
end if;
end loop;
return jsonb_build_object('requirements',rows,'submission',case when s.id is null then null else to_jsonb(s) end,'counts',jsonb_build_object('required',total,'accepted',accepted,'missing',missing,'pending',pending,'changes_requested',corrections,'percent',case when total=0 then null else round(100.0*accepted/total) end));
end $$;
