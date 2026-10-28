-- Field documentation improvements. Additive only: legacy rows retain their
-- existing meaning and are not assigned fabricated revision/slot metadata.

alter table public.closeout_submissions
  add column submission_notes text not null default '' check (length(submission_notes) <= 5000),
  add column construction_package_id uuid,
  add column construction_package_snapshot jsonb;
alter table public.closeout_submissions
  add constraint closeout_submissions_package_same_project_fk
  foreign key (construction_package_id, project_id, organization_id)
  references public.construction_packages(id, project_id, organization_id);

alter table public.closeout_requirements
  add column evidence_slots jsonb not null default '[]'::jsonb
  check (jsonb_typeof(evidence_slots) = 'array' and jsonb_array_length(evidence_slots) <= 40);
alter table public.evidence_versions
  add column slot_key text check (slot_key is null or length(slot_key) between 1 and 80);

alter table public.field_changes
  add column sheet_reference text not null default '' check (length(sheet_reference) <= 200),
  add column asset_id uuid;
alter table public.field_changes
  add constraint field_changes_asset_same_project_fk
  foreign key (asset_id, project_id, organization_id)
  references public.project_assets(id, project_id, organization_id);
alter table public.files add constraint files_id_project_id_organization_id_key unique(id,project_id,organization_id);

create table public.field_change_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  field_change_id uuid not null,
  file_id uuid not null,
  added_by uuid not null references public.profiles,
  added_at timestamptz not null default now(),
  unique(field_change_id, file_id),
  foreign key(field_change_id, project_id, organization_id)
    references public.field_changes(id, project_id, organization_id),
  foreign key(file_id, project_id, organization_id)
    references public.files(id, project_id, organization_id)
);
alter table public.field_change_files enable row level security;
revoke all on public.field_change_files from public, anon, authenticated;
grant select on public.field_change_files to authenticated, service_role;
create policy abf_field_change_files_read on public.field_change_files
  for select to authenticated using (organization_id=public.abf_org() and public.abf_access(project_id));
create index field_change_files_project_idx on public.field_change_files(project_id,field_change_id);

-- Admin/Coordinator-only full requirement edit. Slot names/instructions are
-- customer-authored; no telecom checklist is imposed by this migration.
create function public.abf_requirement_save_v12(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; pid uuid; p public.projects; r public.closeout_requirements;
  target uuid; slots jsonb; result jsonb; before_state jsonb; slot jsonb; seen text[]:='{}';
begin
  select * into me from public.profiles where id=auth.uid() and active;
  pid:=(payload->>'project_id')::uuid;
  if me.id is null or me.role not in ('admin','project_manager','coordinator') or not public.abf_write(pid) then
    raise exception 'Coordinator required' using errcode='42501';
  end if;
  select * into p from public.projects where id=pid for update;
  if p.status in ('approved','closed') then raise exception 'Historical closed project is read-only'; end if;
  if coalesce(length(trim(payload->>'title')),0)=0 then raise exception 'Requirement title required'; end if;
  target:=nullif(payload->>'responsible_company_id','')::uuid;
  if target is not null and (target is distinct from p.contractor_company_id or not exists
    (select 1 from public.contractor_companies where id=target and organization_id=me.organization_id and active)) then
    raise exception 'Responsible company must be the project contractor';
  end if;
  slots:=coalesce(payload->'evidence_slots','[]'::jsonb);
  if jsonb_typeof(slots)<>'array' or jsonb_array_length(slots)>40 then raise exception 'Evidence slots must be a list of at most 40 items'; end if;
  for slot in select value from jsonb_array_elements(slots) loop
    if coalesce(length(trim(slot->>'key')),0)=0 or length(slot->>'key')>80 or
       coalesce(length(trim(slot->>'title')),0)=0 or length(slot->>'title')>160 or
       length(coalesce(slot->>'instructions',''))>2000 then raise exception 'Evidence slot key, title, or instructions is invalid'; end if;
    if (slot->>'required') is not null and jsonb_typeof(slot->'required')<>'boolean' then raise exception 'Evidence slot required must be boolean'; end if;
    if (slot->>'key')=any(seen) then raise exception 'Evidence slot keys must be unique'; end if;
    seen:=array_append(seen,slot->>'key');
  end loop;
  if nullif(payload->>'id','') is not null then
    select * into r from public.closeout_requirements where id=(payload->>'id')::uuid and project_id=pid and organization_id=me.organization_id for update;
    if not found or r.version is distinct from (payload->>'version')::integer then raise exception 'Requirement changed; reload before editing'; end if;
    before_state:=to_jsonb(r);
    update public.closeout_requirements set title=trim(payload->>'title'),category=coalesce(nullif(payload->>'category',''),'Other'),
      instructions=coalesce(payload->>'instructions',''),required=coalesce((payload->>'required')::boolean,true),
      minimum_count=coalesce((payload->>'minimum_count')::integer,1),responsible_company_id=target,
      evidence_slots=slots,version=version+1 where id=r.id returning to_jsonb(closeout_requirements.*) into result;
  else
    insert into public.closeout_requirements(organization_id,project_id,title,category,instructions,required,minimum_count,responsible_company_id,evidence_slots,created_by)
      values(me.organization_id,pid,trim(payload->>'title'),coalesce(nullif(payload->>'category',''),'Other'),coalesce(payload->>'instructions',''),
        coalesce((payload->>'required')::boolean,true),coalesce((payload->>'minimum_count')::integer,1),target,slots,me.id)
      returning to_jsonb(closeout_requirements.*) into result;
  end if;
  if p.status<>'draft' then update public.projects set status='needs_rework' where id=pid; end if;
  perform abf_private.audit(pid,'requirement_save',jsonb_build_object('before',before_state,'after',result));
  return result;
end $$;
revoke all on function public.abf_requirement_save_v12(jsonb) from public,anon;
grant execute on function public.abf_requirement_save_v12(jsonb) to authenticated;

-- Slot evidence is linked through the same immutable deliverable/version model.
create function public.abf_evidence_slot_link_v12(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; pid uuid; r public.closeout_requirements; f public.files; d public.deliverables;
  slot jsonb; existing public.evidence_versions; n integer; result jsonb;
begin
  select * into me from public.profiles where id=auth.uid() and active;
  pid:=(payload->>'project_id')::uuid;
  if me.id is null or not public.abf_write(pid) or me.role not in ('admin','project_manager','coordinator','contractor_admin','contractor_user') then
    raise exception 'Submission editor required' using errcode='42501';
  end if;
  select * into r from public.closeout_requirements where id=(payload->>'requirement_id')::uuid and project_id=pid and organization_id=me.organization_id;
  if not found then raise exception 'Requirement not found'; end if;
  select value into slot from jsonb_array_elements(r.evidence_slots) where value->>'key'=payload->>'slot_key';
  if slot is null then raise exception 'Evidence slot is not part of the current requirement'; end if;
  select * into f from public.files where id=(payload->>'file_id')::uuid and project_id=pid and organization_id=me.organization_id;
  if not found then raise exception 'Project file not found'; end if;
  if me.role in ('contractor_admin','contractor_user') and not exists
    (select 1 from public.profiles where id=f.uploaded_by and contractor_company_id=me.contractor_company_id and organization_id=me.organization_id) then
    raise exception 'Contractors may link only their company evidence';
  end if;
  select v.* into existing from public.evidence_versions v join public.deliverables x on x.id=v.deliverable_id
    where v.project_id=pid and v.file_id=f.id and x.requirement_id=r.id;
  if found then
    if existing.slot_key is distinct from payload->>'slot_key' then raise exception 'File is already linked to a different evidence slot'; end if;
    return to_jsonb(existing);
  end if;
  if nullif(payload->>'deliverable_id','') is null then
    insert into public.deliverables(organization_id,project_id,requirement_id,title,created_by)
      values(me.organization_id,pid,r.id,coalesce(nullif(trim(slot->>'title'),''),f.file_name),me.id) returning * into d;
  else
    select * into d from public.deliverables where id=(payload->>'deliverable_id')::uuid and requirement_id=r.id and project_id=pid for update;
    if not found then raise exception 'Deliverable not found'; end if;
    if me.role in ('contractor_admin','contractor_user') and not exists
      (select 1 from public.profiles where id=d.created_by and contractor_company_id=me.contractor_company_id and organization_id=me.organization_id) then
      raise exception 'Cannot revise another company deliverable';
    end if;
  end if;
  select coalesce(max(version),0)+1 into n from public.evidence_versions where deliverable_id=d.id;
  insert into public.evidence_versions(organization_id,project_id,deliverable_id,version,file_id,created_by,slot_key)
    values(me.organization_id,pid,d.id,n,f.id,me.id,payload->>'slot_key') returning to_jsonb(evidence_versions.*) into result;
  if (select status from public.projects where id=pid)<>'draft' then update public.projects set status='needs_rework' where id=pid; end if;
  perform abf_private.audit(pid,'evidence_slot_link',jsonb_build_object('after',result));
  return result;
end $$;
revoke all on function public.abf_evidence_slot_link_v12(jsonb) from public,anon;
grant execute on function public.abf_evidence_slot_link_v12(jsonb) to authenticated;

-- Submission is idempotent, captures notes and current released package once,
-- and refuses handoff until every required configured slot has current evidence.
create function public.abf_submit_closeout_v12(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; p public.projects; pid uuid; s public.closeout_submissions; n integer;
  snapshot jsonb; pkg public.construction_packages; result jsonb; missing_slot text;
begin
  select * into me from public.profiles where id=auth.uid() and active;
  pid:=(payload->>'project_id')::uuid;
  if me.id is null or not public.abf_write(pid) or me.role not in ('admin','project_manager','coordinator','contractor_admin','contractor_user') then
    raise exception 'Submitter required' using errcode='42501';
  end if;
  if coalesce(length(payload->>'submission_notes'),0)>5000 then raise exception 'Submission notes are limited to 5,000 characters'; end if;
  if payload->>'request_id' is null then raise exception 'Submission request ID required'; end if;
  select * into p from public.projects where id=pid for update;
  if p.status in ('approved','closed') then raise exception 'Historical closed project is read-only'; end if;
  select * into s from public.closeout_submissions where project_id=pid and request_id=(payload->>'request_id')::uuid;
  if found then return to_jsonb(s); end if;
  if p.status not in ('draft','needs_rework','submitted','revision_submitted','coordinator_review','ready_for_inspection','inspector_review') then raise exception 'Submission not allowed'; end if;
  select jsonb_agg(to_jsonb(q) order by q.id) into snapshot from public.closeout_requirements q where project_id=pid;
  if snapshot is null then raise exception 'Configure closeout requirements before submission'; end if;
  select format('%s — %s',q.title,slot->>'title') into missing_slot
  from public.closeout_requirements q cross join lateral jsonb_array_elements(q.evidence_slots) slot
  where q.project_id=pid and q.required and coalesce((slot->>'required')::boolean,true)
    and not exists(select 1 from public.evidence_versions v join public.deliverables d on d.id=v.deliverable_id
      where d.requirement_id=q.id and v.slot_key=slot->>'key'
        and v.version=(select max(v2.version) from public.evidence_versions v2 where v2.deliverable_id=v.deliverable_id))
  limit 1;
  if missing_slot is not null then raise exception 'Required evidence missing: %',missing_slot; end if;
  if not exists(select 1 from public.evidence_versions where project_id=pid) then raise exception 'Link evidence before submission'; end if;
  select * into pkg from public.construction_packages where project_id=pid and status='released' order by revision_number desc limit 1;
  select coalesce(max(sequence),0)+1 into n from public.closeout_submissions where project_id=pid;
  insert into public.closeout_submissions(organization_id,project_id,sequence,submitted_by,request_id,requirements_snapshot,
    submission_notes,construction_package_id,construction_package_snapshot)
  values(me.organization_id,pid,n,me.id,(payload->>'request_id')::uuid,snapshot,coalesce(payload->>'submission_notes',''),pkg.id,
    case when pkg.id is null then null else jsonb_build_object('id',pkg.id,'revision_number',pkg.revision_number,'revision_label',pkg.revision_label,'released_at',pkg.released_at) end)
  returning * into s;
  insert into public.submission_evidence(submission_id,version_id,project_id,organization_id)
    select s.id,v.id,pid,me.organization_id from public.evidence_versions v
    where v.project_id=pid and v.version=(select max(x.version) from public.evidence_versions x where x.deliverable_id=v.deliverable_id);
  update public.projects set status=case when n=1 then 'submitted'::public.project_status else 'revision_submitted'::public.project_status end where id=pid;
  result:=to_jsonb(s);
  perform abf_private.audit(pid,'submit',jsonb_build_object('after',result));
  return result;
end $$;
revoke all on function public.abf_submit_closeout_v12(jsonb) from public,anon;
grant execute on function public.abf_submit_closeout_v12(jsonb) to authenticated;

-- Preserve the established state function while incorporating required-slot
-- presence into the same readiness/completeness result used by every screen.
alter function public.abf_closeout_state(uuid) rename to closeout_state_pre_field_docs;
alter function public.closeout_state_pre_field_docs(uuid) set schema abf_private;
revoke all on function abf_private.closeout_state_pre_field_docs(uuid) from public,anon,authenticated;
create function public.abf_closeout_state(pid uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare base jsonb; result jsonb; item jsonb; slot jsonb; slot_states jsonb; rows jsonb:='[]'::jsonb;
  sid uuid; qid uuid; evidence_id uuid; slot_state text; has_missing boolean;
  n_required integer; n_accepted integer; n_missing integer; n_pending integer; n_corrections integer;
begin
  if not public.abf_access(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
  base:=abf_private.closeout_state_pre_field_docs(pid);
  sid:=nullif(base->'submission'->>'id','')::uuid;
  n_required:=coalesce((base->'counts'->>'required')::integer,0);
  n_accepted:=coalesce((base->'counts'->>'accepted')::integer,0);
  n_missing:=coalesce((base->'counts'->>'missing')::integer,0);
  n_pending:=coalesce((base->'counts'->>'pending')::integer,0);
  n_corrections:=coalesce((base->'counts'->>'changes_requested')::integer,0);
  for item in select value from jsonb_array_elements(coalesce(base->'requirements','[]'::jsonb)) loop
    qid:=(item->>'id')::uuid;
    slot_states:='[]'::jsonb; has_missing:=false;
    for slot in select value from jsonb_array_elements(coalesce(item->'evidence_slots','[]'::jsonb)) loop
      evidence_id:=null;
      select v.id into evidence_id from public.evidence_versions v join public.deliverables d on d.id=v.deliverable_id
      where d.requirement_id=qid and v.slot_key=slot->>'key'
        and v.version=(select max(latest.version) from public.evidence_versions latest where latest.deliverable_id=v.deliverable_id)
      order by v.created_at desc limit 1;
      if evidence_id is null then
        slot_state:=case when coalesce((slot->>'required')::boolean,true) then 'missing' else 'optional' end;
        if coalesce((slot->>'required')::boolean,true) then has_missing:=true; end if;
      elsif sid is null or not exists(select 1 from public.submission_evidence se where se.submission_id=sid and se.version_id=evidence_id) then
        slot_state:='pending_submission';
      else
        select case when review.decision='accepted' then 'accepted' when review.decision='changes_requested' then 'changes_requested' else 'pending_review' end
        into slot_state from (select cr.decision from public.completeness_reviews cr where cr.submission_id=sid and cr.requirement_id=qid) review;
        if slot_state is null then slot_state:='pending_review'; end if;
      end if;
      slot_states:=slot_states||jsonb_build_array(slot||jsonb_build_object('state',slot_state,'evidence_version_id',evidence_id));
    end loop;
    if has_missing and coalesce((item->>'required')::boolean,false) then
      case item->>'state'
        when 'missing' then null;
        when 'accepted' then n_accepted:=greatest(0,n_accepted-1); n_missing:=n_missing+1;
        when 'changes_requested' then n_corrections:=greatest(0,n_corrections-1); n_missing:=n_missing+1;
        else n_pending:=greatest(0,n_pending-1); n_missing:=n_missing+1;
      end case;
      item:=item||jsonb_build_object('state','missing');
    end if;
    rows:=rows||jsonb_build_array(item||jsonb_build_object('slot_states',slot_states));
  end loop;
  result:=base||jsonb_build_object('requirements',rows,'counts',coalesce(base->'counts','{}'::jsonb)||jsonb_build_object(
    'required',n_required,'accepted',n_accepted,'missing',n_missing,'pending',n_pending,'changes_requested',n_corrections,
    'percent',case when n_required=0 then null else round(100.0*n_accepted/n_required) end));
  return result;
end $$;
revoke all on function public.abf_closeout_state(uuid) from public,anon;
grant execute on function public.abf_closeout_state(uuid) to authenticated;
create or replace function public.abf_closeout_states() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id,public.abf_closeout_state(p.id)),'{}'::jsonb)
  from public.projects p where not p.archived and public.abf_access(p.id)
$$;
revoke all on function public.abf_closeout_states() from public,anon;
grant execute on function public.abf_closeout_states() to authenticated;

-- Keep the established RPC surface, but route every submission through the
-- revision/notes/slot-enforcing implementation so callers cannot bypass it.
alter function public.abf_closeout_command(text,jsonb) rename to closeout_command_pre_field_docs;
alter function public.closeout_command_pre_field_docs(text,jsonb) set schema abf_private;
revoke all on function abf_private.closeout_command_pre_field_docs(text,jsonb) from public,anon,authenticated;
create function public.abf_closeout_command(action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if action='submit' then return public.abf_submit_closeout_v12(payload); end if;
  return abf_private.closeout_command_pre_field_docs(action,payload);
end $$;
revoke all on function public.abf_closeout_command(text,jsonb) from public,anon;
grant execute on function public.abf_closeout_command(text,jsonb) to authenticated;

-- Accept-closeout snapshots include field change attachment identities so the
-- final ZIP can place their files alongside the related walkout record.
create function abf_private.closeout_field_change_files_snapshot() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.snapshot:=new.snapshot||jsonb_build_object('field_change_files',
    (select coalesce(jsonb_agg(fcf order by fcf.added_at),'[]'::jsonb) from public.field_change_files fcf where fcf.project_id=new.project_id));
  new.snapshot:=new.snapshot||jsonb_build_object('submission_evidence',
    (select coalesce(jsonb_agg(se),'[]'::jsonb) from public.submission_evidence se where se.project_id=new.project_id));
  return new;
end $$;
create trigger abf_closeout_field_change_files_snapshot before insert on public.closeout_packages
for each row execute function abf_private.closeout_field_change_files_snapshot();
revoke all on function abf_private.closeout_field_change_files_snapshot() from public,anon,authenticated;

-- Authenticated, project-scoped field change creation with optional document
-- links. Attachments must already be registered files in the same project.
create function public.abf_field_change_create_v12(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; pid uuid; p public.projects; aid uuid; change public.field_changes;
  file_id uuid; result jsonb;
begin
  select * into me from public.profiles where id=auth.uid() and active;
  pid:=(payload->>'project_id')::uuid;
  if me.id is null or not public.abf_write(pid) or me.role not in ('admin','project_manager','coordinator','inspector','contractor_admin','contractor_user') then
    raise exception 'Field change write denied' using errcode='42501';
  end if;
  select * into p from public.projects where id=pid for update;
  if coalesce(length(trim(payload->>'title')),0)=0 or length(payload->>'title')>200 then raise exception 'Field change title is required'; end if;
  aid:=nullif(payload->>'asset_id','')::uuid;
  if aid is not null and not exists(select 1 from public.project_assets where id=aid and project_id=pid and organization_id=me.organization_id) then raise exception 'Asset must belong to this project'; end if;
  insert into public.field_changes(organization_id,project_id,title,change_type,description,location,sheet_reference,asset_id,reported_by)
    values(me.organization_id,pid,trim(payload->>'title'),coalesce(nullif(payload->>'change_type',''),'other'),
      coalesce(payload->>'description',''),coalesce(payload->>'location',''),coalesce(payload->>'sheet_reference',''),aid,me.id)
    returning * into change;
  if jsonb_typeof(coalesce(payload->'file_ids','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(payload->'file_ids','[]'::jsonb))>20 then raise exception 'Attach at most 20 files'; end if;
  for file_id in select value::text::uuid from jsonb_array_elements_text(coalesce(payload->'file_ids','[]'::jsonb)) loop
    if not exists(select 1 from public.files where id=file_id and project_id=pid and organization_id=me.organization_id) then raise exception 'Attachment must be a registered file in this project'; end if;
    if me.role in ('contractor_admin','contractor_user') and not exists(select 1 from public.files f join public.profiles uploader on uploader.id=f.uploaded_by
      where f.id=file_id and uploader.contractor_company_id=me.contractor_company_id and uploader.organization_id=me.organization_id) then
      raise exception 'Contractors may attach only files uploaded by their company';
    end if;
    insert into public.field_change_files(organization_id,project_id,field_change_id,file_id,added_by)
      values(me.organization_id,pid,change.id,file_id,me.id) on conflict do nothing;
  end loop;
  result:=to_jsonb(change)||jsonb_build_object('file_ids',coalesce((select jsonb_agg(fcf.file_id order by fcf.file_id) from public.field_change_files fcf where fcf.field_change_id=change.id),'[]'::jsonb));
  if p.status<>'draft' then update public.closeout_requirements set version=version+1 where project_id=pid; update public.projects set status='needs_rework' where id=pid; end if;
  insert into public.lifecycle_history(organization_id,project_id,actor_id,action,record) values(me.organization_id,pid,me.id,'field_change_create',result);
  perform abf_private.audit(pid,'field_change_create',jsonb_build_object('after',result));
  return result;
end $$;
revoke all on function public.abf_field_change_create_v12(jsonb) from public,anon;
grant execute on function public.abf_field_change_create_v12(jsonb) to authenticated;

create function public.abf_field_change_resolve_v12(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; pid uuid; p public.projects; pkg public.construction_packages; result jsonb;
begin
  select * into me from public.profiles where id=auth.uid() and active;
  pid:=(payload->>'project_id')::uuid;
  if me.id is null or me.role not in ('admin','project_manager','coordinator') or not public.abf_write(pid) then
    raise exception 'Coordinator required' using errcode='42501';
  end if;
  select * into p from public.projects where id=pid for update;
  select * into pkg from public.construction_packages where id=(payload->>'package_id')::uuid and project_id=pid and status in ('draft','released');
  if pkg.id is null then raise exception 'Choose a current or draft project revision'; end if;
  if coalesce(length(trim(payload->>'resolution')),0)=0 then raise exception 'Resolution required'; end if;
  update public.field_changes set status='resolved',resolution=trim(payload->>'resolution'),resulting_package_id=pkg.id,resolved_at=now()
    where id=(payload->>'id')::uuid and project_id=pid and organization_id=me.organization_id and status in ('open','in_review')
    returning to_jsonb(field_changes.*) into result;
  if result is null then raise exception 'Open field change not found'; end if;
  if p.status<>'draft' then update public.closeout_requirements set version=version+1 where project_id=pid; update public.projects set status='needs_rework' where id=pid; end if;
  insert into public.lifecycle_history(organization_id,project_id,actor_id,action,record) values(me.organization_id,pid,me.id,'field_change_resolve',result);
  perform abf_private.audit(pid,'field_change_resolve',jsonb_build_object('after',result));
  return result;
end $$;
revoke all on function public.abf_field_change_resolve_v12(jsonb) from public,anon;
grant execute on function public.abf_field_change_resolve_v12(jsonb) to authenticated;

-- Batched invoice state for the dashboard queue, constrained by the same
-- per-project access predicate as other project reads.
create function public.abf_invoice_states() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id,public.abf_invoice_state(p.id)),'{}'::jsonb)
  from public.projects p where not p.archived and public.abf_access(p.id)
$$;
revoke all on function public.abf_invoice_states() from public,anon;
grant execute on function public.abf_invoice_states() to authenticated;
