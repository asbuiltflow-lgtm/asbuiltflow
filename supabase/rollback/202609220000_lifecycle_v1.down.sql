-- Rollback is intentionally guarded. Lifecycle rows may contain pilot records and
-- must be exported or purged through an approved staging cleanup before removal.
do $$ begin
  if exists(select 1 from public.construction_packages) or exists(select 1 from public.field_changes) or exists(select 1 from public.project_assets) or exists(select 1 from public.asset_imports) or exists(select 1 from public.lifecycle_history) or exists(select 1 from public.asset_links) or exists(select 1 from public.closeout_packages) then
    raise exception 'Refusing to erase populated lifecycle data; recover the staging backup or perform approved cleanup first';
  end if;
end $$;

drop function if exists public.abf_lifecycle_command(text,jsonb);
do $$ declare definition text; begin select b.definition into definition from abf_private.lifecycle_function_backup b; execute definition; end $$;
drop table abf_private.lifecycle_function_backup;
drop table if exists public.closeout_packages;
drop table if exists public.asset_links;
alter table public.projects drop column if exists lifecycle_stage;
drop table if exists public.lifecycle_history;
drop table if exists public.construction_package_files;
drop table if exists public.field_changes;
drop table if exists public.construction_packages;
drop table if exists public.asset_imports;
alter table public.closeout_requirements drop column if exists asset_id;
alter table public.closeout_requirements drop column if exists asset_type;
drop table if exists public.project_assets;
drop function if exists abf_private.lifecycle_integrity();
