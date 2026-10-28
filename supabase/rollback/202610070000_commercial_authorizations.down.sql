begin;
do $$ begin
 if exists(select 1 from public.authorization_versions) or exists(select 1 from public.invoice_authorization_links)
 or exists(select 1 from public.authorization_approval_receipts) or exists(select 1 from public.projects where ntp_required or po_required or not authorization_amount_check)
 or exists(select 1 from public.lifecycle_history where action like 'authorization_%')
 or exists(select 1 from public.closeout_packages where snapshot ? 'authorization_versions') then raise exception 'Refusing to erase authorization data/history; use a reviewed forward fix'; end if;
end $$;
drop function public.abf_lifecycle_command(text,jsonb);
alter function abf_private.lifecycle_command_v11(text,jsonb) set schema public;
alter function public.lifecycle_command_v11(text,jsonb) rename to abf_lifecycle_command;
grant execute on function public.abf_lifecycle_command(text,jsonb) to authenticated;
drop function public.abf_invoice_command(text,jsonb);
alter function abf_private.invoice_command_v11(text,jsonb) set schema public;
alter function public.invoice_command_v11(text,jsonb) rename to abf_invoice_command;
grant execute on function public.abf_invoice_command(text,jsonb) to authenticated;
drop function public.abf_invoice_state(uuid);
alter function abf_private.invoice_state_v11(uuid) set schema public;
alter function public.invoice_state_v11(uuid) rename to abf_invoice_state;
grant execute on function public.abf_invoice_state(uuid) to authenticated;
drop function public.abf_authorization_command(text,jsonb);
drop function public.abf_authorization_check(uuid,uuid);
drop table public.authorization_approval_receipts;
drop table public.invoice_authorization_links;
drop table public.authorization_versions;
alter table public.projects drop column ntp_required,drop column po_required,drop column authorization_amount_check;
commit;
