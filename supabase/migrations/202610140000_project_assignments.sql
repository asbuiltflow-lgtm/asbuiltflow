-- Audited reassignment for existing projects. Tenant and role checks are enforced
-- here so browser callers cannot bypass the form or submit foreign-tenant IDs.
create function public.abf_project_assignments_update(
  pid uuid,
  contractor_id uuid,
  coordinator_profile_id uuid,
  inspector_profile_id uuid
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  me public.profiles;
  p public.projects;
  before_state jsonb;
  after_state jsonb;
begin
  select * into me from public.profiles where id=auth.uid() and active;
  if not found or me.role not in ('admin','project_manager','coordinator') then
    raise exception 'Project assignment management requires an active Admin or Coordinator';
  end if;
  if not public.abf_write(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
  select * into p from public.projects where id=pid and organization_id=me.organization_id for update;
  if not found then raise exception 'Project not found'; end if;
  if p.archived or p.status in ('approved','closed') then raise exception 'Accepted or archived project is read-only'; end if;
  if contractor_id is not null and not exists(
    select 1 from public.contractor_companies c
    where c.id=contractor_id and c.organization_id=me.organization_id and c.active
  ) then raise exception 'Contractor company must be active and belong to this organization'; end if;
  if coordinator_profile_id is not null and not exists(
    select 1 from public.profiles x where x.id=coordinator_profile_id
      and x.organization_id=me.organization_id and x.active
      and x.role in ('admin','project_manager','coordinator')
  ) then raise exception 'Coordinator must be an active coordinator in this organization'; end if;
  if inspector_profile_id is not null and not exists(
    select 1 from public.profiles x where x.id=inspector_profile_id
      and x.organization_id=me.organization_id and x.active and x.role='inspector'
  ) then raise exception 'Inspector must be an active inspector in this organization'; end if;

  before_state:=jsonb_build_object(
    'contractor_company_id',p.contractor_company_id,
    'coordinator_id',p.coordinator_id,
    'inspector_id',p.inspector_id
  );
  update public.projects set
    contractor_company_id=contractor_id,
    coordinator_id=coordinator_profile_id,
    inspector_id=inspector_profile_id
  where id=pid returning jsonb_build_object(
    'contractor_company_id',contractor_company_id,
    'coordinator_id',coordinator_id,
    'inspector_id',inspector_id
  ) into after_state;

  insert into public.lifecycle_history(organization_id,project_id,actor_id,action,record)
    values(me.organization_id,pid,me.id,'project_assignments_updated',jsonb_build_object('before',before_state,'after',after_state));
  perform abf_private.audit(pid,'project_assignments_updated',jsonb_build_object('before',before_state,'after',after_state));
  return after_state;
end $$;
revoke all on function public.abf_project_assignments_update(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.abf_project_assignments_update(uuid,uuid,uuid,uuid) to authenticated;
