-- Do not run on populated installations. Prefer forward fixes.
begin;
do $$ begin
 if exists(select 1 from public.invoice_versions) or exists(select 1 from public.invoice_reviews)
 or exists(select 1 from public.projects where invoice_required)
 or exists(select 1 from public.closeout_packages where snapshot ? 'invoice_versions') then
  raise exception 'Refusing to erase invoice documents, requirements or accepted receipts';
 end if;
end $$;
drop function public.abf_lifecycle_command(text,jsonb);
alter function abf_private.lifecycle_command_v1(text,jsonb) set schema public;
alter function public.lifecycle_command_v1(text,jsonb) rename to abf_lifecycle_command;
grant execute on function public.abf_lifecycle_command(text,jsonb) to authenticated;
drop function public.abf_invoice_command(text,jsonb);
drop function public.abf_invoice_state(uuid);
drop table public.invoice_reviews;
drop table public.invoice_versions;
drop function abf_private.invoice_immutable();
alter table public.projects drop column invoice_required;
commit;
