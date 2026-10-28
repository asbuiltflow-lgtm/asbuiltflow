do $$ begin
  if exists(select 1 from public.closeout_submissions where submission_notes<>'' or construction_package_id is not null or construction_package_snapshot is not null)
     or exists(select 1 from public.closeout_requirements where evidence_slots<>'[]'::jsonb)
     or exists(select 1 from public.evidence_versions where slot_key is not null)
     or exists(select 1 from public.field_changes where sheet_reference<>'' or asset_id is not null)
     or exists(select 1 from public.field_change_files) then
    raise exception 'Refusing rollback: field documentation data exists. Export/preserve records and use a reviewed forward migration.';
  end if;
end $$;
drop trigger if exists abf_closeout_field_change_files_snapshot on public.closeout_packages;
drop function if exists abf_private.closeout_field_change_files_snapshot();
drop function if exists public.abf_field_change_create_v12(jsonb);
drop function if exists public.abf_field_change_resolve_v12(jsonb);
drop function if exists public.abf_invoice_states();
drop function if exists public.abf_closeout_command(text,jsonb);
alter function abf_private.closeout_command_pre_field_docs(text,jsonb) set schema public;
alter function public.closeout_command_pre_field_docs(text,jsonb) rename to abf_closeout_command;
grant execute on function public.abf_closeout_command(text,jsonb) to authenticated;
create or replace function public.abf_closeout_states() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id,abf_private.closeout_state_pre_field_docs(p.id)),'{}'::jsonb)
  from public.projects p where not p.archived and public.abf_access(p.id)
$$;
drop function if exists public.abf_closeout_state(uuid);
alter function abf_private.closeout_state_pre_field_docs(uuid) set schema public;
alter function public.closeout_state_pre_field_docs(uuid) rename to abf_closeout_state;
grant execute on function public.abf_closeout_state(uuid) to authenticated;
create or replace function public.abf_closeout_states() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_object_agg(p.id,public.abf_closeout_state(p.id)),'{}'::jsonb)
  from public.projects p where not p.archived and public.abf_access(p.id)
$$;
drop function if exists public.abf_submit_closeout_v12(jsonb);
drop function if exists public.abf_evidence_slot_link_v12(jsonb);
drop function if exists public.abf_requirement_save_v12(jsonb);
drop table if exists public.field_change_files;
alter table public.files drop constraint if exists files_id_project_id_organization_id_key;
alter table public.field_changes drop constraint if exists field_changes_asset_same_project_fk;
alter table public.field_changes drop column if exists asset_id, drop column if exists sheet_reference;
alter table public.evidence_versions drop column if exists slot_key;
alter table public.closeout_requirements drop column if exists evidence_slots;
alter table public.closeout_submissions drop constraint if exists closeout_submissions_package_same_project_fk;
alter table public.closeout_submissions drop column if exists construction_package_snapshot, drop column if exists construction_package_id, drop column if exists submission_notes;
