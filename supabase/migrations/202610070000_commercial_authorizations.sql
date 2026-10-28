-- Project-configurable authorization documents; no accounting or payments.
alter table public.projects add column ntp_required boolean not null default false;
alter table public.projects add column po_required boolean not null default false;
alter table public.projects add column authorization_amount_check boolean not null default true;
create table public.authorization_versions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 project_id uuid not null references public.projects, kind text not null check(kind in ('ntp','po')),
 version integer not null check(version>0), number text not null check(length(trim(number)) between 1 and 160),
 document_revision text not null default '' check(length(document_revision)<=100),
 effective_date date not null check(isfinite(effective_date)),
 amount numeric(14,2) check(amount>=0 and amount<'Infinity'::numeric),
 currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 scope text not null default '' check(length(scope)<=10000),
 status text not null check(status in ('current','revision_required','superseded')),
 file_id uuid not null references public.files, created_by uuid not null references public.profiles,
 created_at timestamptz not null default now(), unique(project_id,kind,version), unique(id,project_id,organization_id)
);
create table public.invoice_authorization_links (
 version_id uuid primary key, project_id uuid not null, organization_id uuid not null,
 ntp_id uuid references public.authorization_versions, po_id uuid references public.authorization_versions,
 foreign key(version_id,project_id,organization_id) references public.invoice_versions(id,project_id,organization_id)
);
create table public.authorization_approval_receipts (
 review_id uuid primary key references public.invoice_reviews,
 project_id uuid not null references public.projects, organization_id uuid not null references public.organizations,
 snapshot jsonb not null, created_at timestamptz not null default now()
);
do $$ declare t text; begin
 foreach t in array array['authorization_versions','invoice_authorization_links','authorization_approval_receipts'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy authorization_read on public.%I for select to authenticated using (organization_id=public.abf_org() and public.abf_access(project_id))',t);
  execute format('create trigger authorization_immutable before update or delete on public.%I for each row execute function abf_private.invoice_immutable()',t);
 end loop;
end $$;

create function public.abf_authorization_check(pid uuid,invoice_version uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare p public.projects; v public.invoice_versions; a public.authorization_versions; l public.invoice_authorization_links;
 kind_name text; needed boolean; blocks jsonb:='[]'; docs jsonb:='{}'; label text;
begin
 if not public.abf_access(pid) then raise exception 'Project access denied' using errcode='42501'; end if;
 select * into p from public.projects where id=pid;
 if invoice_version is not null then
  select * into v from public.invoice_versions where id=invoice_version and project_id=pid;
  if not found then raise exception 'Invoice not found' using errcode='42501'; end if;
  select * into l from public.invoice_authorization_links where version_id=v.id;
 end if;
 foreach kind_name in array array['ntp','po'] loop
  label:=upper(kind_name);
  needed:=case kind_name when 'ntp' then p.ntp_required or l.ntp_id is not null else p.po_required or l.po_id is not null end;
  select * into a from public.authorization_versions where project_id=pid and kind=kind_name order by version desc limit 1;
  docs:=docs||jsonb_build_object(kind_name,case when a.id is null then null else to_jsonb(a) end);
  if needed then
   if a.id is null then blocks:=blocks||jsonb_build_array('Invoice approval blocked — '||label||' missing');
   elsif a.status='revision_required' then blocks:=blocks||jsonb_build_array('Invoice approval blocked — '||label||' revision required');
   elsif a.status='superseded' then blocks:=blocks||jsonb_build_array('Invoice approval blocked — '||label||' superseded without a current replacement');
   elsif a.effective_date>current_date then blocks:=blocks||jsonb_build_array('Invoice approval blocked — '||label||' is not yet effective');
   elsif p.authorization_amount_check and a.amount is not null and v.id is not null then
    if a.currency<>v.currency then blocks:=blocks||jsonb_build_array('Invoice approval blocked — '||label||' currency differs from invoice');
    elsif v.amount>a.amount then blocks:=blocks||jsonb_build_array('Invoice approval blocked — invoice exceeds current '||label||' authorization'); end if;
   end if;
  end if;
 end loop;
 return jsonb_build_object('blockers',blocks,'can_approve',jsonb_array_length(blocks)=0,'current',docs,
 'ntp_required',p.ntp_required,'po_required',p.po_required,'amount_check',p.authorization_amount_check,
 'scope_confirmation_required',p.ntp_required or p.po_required or l.ntp_id is not null or l.po_id is not null);
end $$;
revoke all on function public.abf_authorization_check(uuid,uuid) from public,anon;
grant execute on function public.abf_authorization_check(uuid,uuid) to authenticated;

create function public.abf_authorization_command(action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me public.profiles; pid uuid:=(payload->>'project_id')::uuid; p public.projects; previous public.authorization_versions; result jsonb; k text;
begin
 select * into me from public.profiles where id=auth.uid() and active;
 if not found or not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
 if me.role not in ('admin','project_manager','coordinator') then raise exception 'Internal authorization manager required' using errcode='42501'; end if;
 select * into p from public.projects where id=pid for update;
 if p.archived or p.status in ('approved','closed') then raise exception 'Accepted or archived project is read-only' using errcode='42501'; end if;
 if action='configure' then
  if jsonb_typeof(payload->'ntp_required') is distinct from 'boolean' or jsonb_typeof(payload->'po_required') is distinct from 'boolean'
   or jsonb_typeof(payload->'amount_check') is distinct from 'boolean' then raise exception 'All authorization settings must be boolean'; end if;
  update public.projects set ntp_required=(payload->>'ntp_required')::boolean,po_required=(payload->>'po_required')::boolean,authorization_amount_check=(payload->>'amount_check')::boolean where id=pid;
  result:=public.abf_authorization_check(pid);
 elsif action='revise' then
  k:=payload->>'kind';
  if k not in ('ntp','po') or k is null then raise exception 'Choose NTP or PO'; end if;
  select * into previous from public.authorization_versions where project_id=pid and kind=k order by version desc limit 1;
  if previous.id is distinct from nullif(payload->>'previous_id','')::uuid then raise exception 'Authorization changed; reload before revising'; end if;
  if not exists(select 1 from public.files where id=(payload->>'file_id')::uuid and project_id=pid and organization_id=me.organization_id) then raise exception 'Same-project authorization document required'; end if;
  insert into public.authorization_versions(organization_id,project_id,kind,version,number,document_revision,effective_date,amount,currency,scope,status,file_id,created_by)
  values(me.organization_id,pid,k,coalesce(previous.version,0)+1,trim(payload->>'number'),coalesce(payload->>'document_revision',''),(payload->>'effective_date')::date,nullif(payload->>'amount','')::numeric,upper(coalesce(nullif(payload->>'currency',''),'USD')),coalesce(payload->>'scope',''),payload->>'status',(payload->>'file_id')::uuid,me.id)
  returning to_jsonb(authorization_versions.*) into result;
 else raise exception 'Unknown authorization action'; end if;
 insert into public.lifecycle_history(organization_id,project_id,actor_id,action,record) values(me.organization_id,pid,me.id,'authorization_'||action,result);
 perform abf_private.audit(pid,'authorization_'||action,jsonb_build_object('after',result));
 return result;
end $$;
revoke all on function public.abf_authorization_command(text,jsonb) from public,anon;
grant execute on function public.abf_authorization_command(text,jsonb) to authenticated;

alter function public.abf_invoice_command(text,jsonb) rename to invoice_command_v11;
alter function public.invoice_command_v11(text,jsonb) set schema abf_private;
revoke all on function abf_private.invoice_command_v11(text,jsonb) from public,anon,authenticated;
create function public.abf_invoice_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare pid uuid:=(payload->>'project_id')::uuid; result jsonb; checks jsonb; aid uuid; k text; vid uuid;
begin
 if not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
 perform 1 from public.projects where id=pid for update;
 if action='submit' then
  foreach k in array array['ntp','po'] loop
   aid:=nullif(payload->>(k||'_id'),'')::uuid;
   if aid is not null and not exists(select 1 from public.authorization_versions where id=aid and project_id=pid and kind=k) then raise exception 'Same-project NTP/PO reference required'; end if;
  end loop;
 elsif action='review' and payload->>'decision'='approved' then
  checks:=public.abf_authorization_check(pid,(payload->>'version_id')::uuid);
  if not (checks->>'can_approve')::boolean then raise exception '%', (checks->'blockers'->>0); end if;
  if (checks->>'scope_confirmation_required')::boolean and coalesce((payload->>'scope_confirmed')::boolean,false) is not true then raise exception 'Confirm that current NTP/PO scope supports this invoice'; end if;
 end if;
 result:=abf_private.invoice_command_v11(action,payload);
 if action='submit' then
  vid:=(result->>'id')::uuid;
  insert into public.invoice_authorization_links(version_id,project_id,organization_id,ntp_id,po_id)
  values(vid,pid,public.abf_org(),nullif(payload->>'ntp_id','')::uuid,nullif(payload->>'po_id','')::uuid) on conflict do nothing;
 elsif action='review' and payload->>'decision'='approved' then
  insert into public.authorization_approval_receipts(review_id,project_id,organization_id,snapshot)
  values((result->>'id')::uuid,pid,public.abf_org(),checks||jsonb_build_object('scope_confirmed',coalesce((payload->>'scope_confirmed')::boolean,false)));
 end if;
 return result;
end $$;
revoke all on function public.abf_invoice_command(text,jsonb) from public,anon;
grant execute on function public.abf_invoice_command(text,jsonb) to authenticated;

alter function public.abf_invoice_state(uuid) rename to invoice_state_v11;
alter function public.invoice_state_v11(uuid) set schema abf_private;
revoke all on function abf_private.invoice_state_v11(uuid) from public,anon,authenticated;
create function public.abf_invoice_state(pid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; v record; checks jsonb; blockers jsonb:='[]'; approved integer:=0;
begin
 result:=abf_private.invoice_state_v11(pid);
 for v in select i.id,i.invoice_number,r.decision from public.invoice_versions i left join public.invoice_reviews r on r.version_id=i.id
 where i.project_id=pid and i.version=(select max(x.version) from public.invoice_versions x where x.invoice_id=i.invoice_id) loop
  checks:=public.abf_authorization_check(pid,v.id);
  if v.decision='approved' and (checks->>'can_approve')::boolean then approved:=approved+1; end if;
  blockers:=blockers||(checks->'blockers');
 end loop;
 checks:=public.abf_authorization_check(pid);
 blockers:=blockers||(checks->'blockers');
 return result||jsonb_build_object('approved',approved,'authorization_blockers',blockers,
 'complete',not (result->>'required')::boolean or ((result->>'documents')::int>0 and approved=(result->>'documents')::int and jsonb_array_length(blockers)=0));
end $$;
revoke all on function public.abf_invoice_state(uuid) from public,anon;
grant execute on function public.abf_invoice_state(uuid) to authenticated;

alter function public.abf_lifecycle_command(text,jsonb) rename to lifecycle_command_v11;
alter function public.lifecycle_command_v11(text,jsonb) set schema abf_private;
revoke all on function abf_private.lifecycle_command_v11(text,jsonb) from public,anon,authenticated;
create function public.abf_lifecycle_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; pid uuid:=(payload->>'project_id')::uuid;
begin
 result:=abf_private.lifecycle_command_v11(action,payload);
 if action='accept_closeout' then
  update public.closeout_packages set snapshot=snapshot||jsonb_build_object(
   'authorization_versions',(select coalesce(jsonb_agg(a order by a.kind,a.version),'[]') from public.authorization_versions a where project_id=pid),
   'invoice_authorization_links',(select coalesce(jsonb_agg(l),'[]') from public.invoice_authorization_links l where project_id=pid),
   'authorization_approval_receipts',(select coalesce(jsonb_agg(r),'[]') from public.authorization_approval_receipts r where project_id=pid),
   'authorization_history',(select coalesce(jsonb_agg(h order by h.created_at),'[]') from public.lifecycle_history h where project_id=pid and h.action like 'authorization_%'))
  where project_id=pid returning to_jsonb(closeout_packages.*) into result;
 end if;
 return result;
end $$;
revoke all on function public.abf_lifecycle_command(text,jsonb) from public,anon;
grant execute on function public.abf_lifecycle_command(text,jsonb) to authenticated;
