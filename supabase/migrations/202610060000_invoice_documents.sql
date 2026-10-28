-- Informational invoice documents only. No payments or accounting operations.
alter table public.projects add column invoice_required boolean not null default false;
create table public.invoice_versions (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations,
 project_id uuid not null references public.projects,
 contractor_company_id uuid not null references public.contractor_companies,
 invoice_id uuid not null,
 version integer not null check(version>0),
 invoice_number text not null check(length(trim(invoice_number)) between 1 and 160),
 reference_number text not null default '' check(length(reference_number)<=200),
 amount numeric(14,2) not null check(amount>=0 and amount<'Infinity'::numeric),
 currency text not null check(currency ~ '^[A-Z]{3}$'),
 invoice_date date not null,
 notes text not null default '' check(length(notes)<=4000),
 file_id uuid not null unique references public.files,
 submitted_by uuid not null references public.profiles,
 submitted_at timestamptz not null default now(),
 unique(invoice_id,version),
 unique(id,project_id,organization_id)
);
create table public.invoice_reviews (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null,
 version_id uuid not null unique,
 decision text not null check(decision in ('approved','needs_correction','rejected')),
 notes text not null default '' check(length(notes)<=4000),
 reviewed_by uuid not null references public.profiles,
 reviewed_at timestamptz not null default now(),
 foreign key(version_id,project_id,organization_id) references public.invoice_versions(id,project_id,organization_id)
);
create index invoice_versions_project on public.invoice_versions(project_id,invoice_id,version desc);
do $$ declare t text; begin
 foreach t in array array['invoice_versions','invoice_reviews'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy invoice_read on public.%I for select to authenticated using (organization_id=public.abf_org() and public.abf_access(project_id))',t);
 end loop;
end $$;
create function abf_private.invoice_immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Invoice versions and decisions are immutable'; end $$;
revoke all on function abf_private.invoice_immutable() from public,anon,authenticated;
create trigger invoice_version_immutable before update or delete on public.invoice_versions for each row execute function abf_private.invoice_immutable();
create trigger invoice_review_immutable before update or delete on public.invoice_reviews for each row execute function abf_private.invoice_immutable();

create function public.abf_invoice_state(pid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare required boolean; total integer; approved integer;
begin
 if not public.abf_access(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
 select invoice_required into required from public.projects where id=pid;
 select count(*),count(*) filter(where r.decision='approved') into total,approved
 from public.invoice_versions v left join public.invoice_reviews r on r.version_id=v.id
 where v.project_id=pid and v.version=(select max(x.version) from public.invoice_versions x where x.invoice_id=v.invoice_id);
 return jsonb_build_object('required',required,'documents',total,'approved',approved,
 'complete',not required or (total>0 and total=approved));
end $$;
revoke all on function public.abf_invoice_state(uuid) from public,anon;
grant execute on function public.abf_invoice_state(uuid) to authenticated;

create function public.abf_invoice_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles; p public.projects; previous public.invoice_versions; v public.invoice_versions;
 pid uuid:=(payload->>'project_id')::uuid; invoice uuid; n integer; result jsonb;
begin
 select * into me from public.profiles where id=auth.uid() and active;
 if not found or not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
 select * into p from public.projects where id=pid for update;
 if p.status in ('approved','closed') then raise exception 'Accepted project is read-only'; end if;
 if action='require' then
  if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
  if jsonb_typeof(payload->'required') is distinct from 'boolean' then raise exception 'Required flag must be boolean'; end if;
  update public.projects set invoice_required=(payload->>'required')::boolean where id=pid;
  result:=public.abf_invoice_state(pid);
 elsif action='submit' then
  if me.role not in ('contractor_admin','contractor_user') or me.contractor_company_id is distinct from p.contractor_company_id then raise exception 'Assigned contractor required'; end if;
  if not exists(select 1 from public.files where id=(payload->>'file_id')::uuid and project_id=pid and organization_id=me.organization_id and uploaded_by=me.id) then raise exception 'Own project file required'; end if;
  -- File identity makes retry after a lost response safe. Never create a duplicate revision.
  select * into v from public.invoice_versions where file_id=(payload->>'file_id')::uuid;
  if found then
   if v.project_id=pid and v.submitted_by=me.id then return to_jsonb(v); end if;
   raise exception 'Invoice file already used';
  end if;
  invoice:=nullif(payload->>'invoice_id','')::uuid;
  n:=1;
  if invoice is not null then
   select * into previous from public.invoice_versions where invoice_id=invoice and project_id=pid and contractor_company_id=me.contractor_company_id order by version desc limit 1;
   if not found then raise exception 'Invoice not found'; end if;
   if previous.id is distinct from nullif(payload->>'previous_version_id','')::uuid then raise exception 'Invoice changed; reload'; end if;
   if not exists(select 1 from public.invoice_reviews where version_id=previous.id and decision in ('needs_correction','rejected')) then raise exception 'Review must request a correction or reject before revision'; end if;
   n:=previous.version+1;
  else
   if exists(select 1 from public.invoice_versions where project_id=pid and lower(trim(invoice_number))=lower(trim(payload->>'invoice_number'))) then raise exception 'Invoice number exists; revise the existing invoice'; end if;
   invoice:=gen_random_uuid();
  end if;
  insert into public.invoice_versions(organization_id,project_id,contractor_company_id,invoice_id,version,invoice_number,reference_number,amount,currency,invoice_date,notes,file_id,submitted_by)
  values(me.organization_id,pid,me.contractor_company_id,invoice,n,trim(payload->>'invoice_number'),coalesce(payload->>'reference_number',''),(payload->>'amount')::numeric,upper(payload->>'currency'),(payload->>'invoice_date')::date,coalesce(payload->>'notes',''),(payload->>'file_id')::uuid,me.id)
  returning to_jsonb(invoice_versions.*) into result;
 elsif action='review' then
  if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
  select * into v from public.invoice_versions where id=(payload->>'version_id')::uuid and project_id=pid;
  if not found then raise exception 'Invoice not found'; end if;
  if v.submitted_by=me.id then raise exception 'Independent reviewer required'; end if;
  if exists(select 1 from public.invoice_versions where invoice_id=v.invoice_id and version>v.version) then raise exception 'Review current invoice version only'; end if;
  if payload->>'decision' in ('needs_correction','rejected') and length(trim(coalesce(payload->>'notes','')))=0 then raise exception 'Explain correction or rejection'; end if;
  insert into public.invoice_reviews(organization_id,project_id,version_id,decision,notes,reviewed_by)
  values(me.organization_id,pid,v.id,payload->>'decision',coalesce(payload->>'notes',''),me.id) returning to_jsonb(invoice_reviews.*) into result;
 else raise exception 'Unknown invoice action'; end if;
 perform abf_private.audit(pid,'invoice_'||action,jsonb_build_object('after',result));
 return result;
end $$;
revoke all on function public.abf_invoice_command(text,jsonb) from public,anon;
grant execute on function public.abf_invoice_command(text,jsonb) to authenticated;

-- Preserve the installed V1 command intact; hide the prior entry point so the
-- administrative gate cannot be bypassed by calling it directly.
alter function public.abf_lifecycle_command(text,jsonb) rename to lifecycle_command_v1;
alter function public.lifecycle_command_v1(text,jsonb) set schema abf_private;
revoke all on function abf_private.lifecycle_command_v1(text,jsonb) from public,anon,authenticated;
create function public.abf_lifecycle_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=(payload->>'project_id')::uuid; result jsonb;
begin
 if not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
 perform 1 from public.projects where id=pid for update;
 if action='accept_closeout' and not (public.abf_invoice_state(pid)->>'complete')::boolean then raise exception 'Required invoice documents must be approved'; end if;
 result:=abf_private.lifecycle_command_v1(action,payload);
 if action='accept_closeout' then
  update public.closeout_packages set snapshot=snapshot||jsonb_build_object(
   'invoice_state',public.abf_invoice_state(pid),
   'invoice_versions',(select coalesce(jsonb_agg(v order by v.invoice_id,v.version),'[]') from public.invoice_versions v where project_id=pid),
   'invoice_reviews',(select coalesce(jsonb_agg(r order by r.reviewed_at),'[]') from public.invoice_reviews r where project_id=pid))
  where project_id=pid returning to_jsonb(closeout_packages.*) into result;
 end if;
 return result;
end $$;
revoke all on function public.abf_lifecycle_command(text,jsonb) from public,anon;
grant execute on function public.abf_lifecycle_command(text,jsonb) to authenticated;
