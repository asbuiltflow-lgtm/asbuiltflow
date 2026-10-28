begin;
do $$ begin
  if exists(select 1 from public.lifecycle_history where action='project_assignments_updated') then
    raise exception 'Refusing to remove assignment audit history; use a reviewed forward fix';
  end if;
end $$;
drop function public.abf_project_assignments_update(uuid,uuid,uuid,uuid);
commit;
