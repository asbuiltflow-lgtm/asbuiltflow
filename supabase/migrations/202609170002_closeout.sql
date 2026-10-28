-- Immutable evidence, explicit submission snapshots, and completeness decisions.
create table public.closeout_requirements (
id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
project_id uuid not null references public.projects, title text not null check(length(trim(title)) between 1 and 200),
category text not null, instructions text not null default '', required boolean not null default true,
minimum_count integer not null default 1 check(minimum_count between 1 and 1000),
responsible_company_id uuid references public.contractor_companies, version integer not null default 1,
created_by uuid not null references public.profiles, created_at timestamptz not null default now(),
unique(id,project_id,organization_id));
create table public.deliverables (
id uuid primary key default gen_random_uuid(), organization_id uuid not null,project_id uuid not null,requirement_id uuid not null,
title text not null check(length(trim(title)) between 1 and 250),created_by uuid not null references public.profiles,
created_at timestamptz not null default now(), unique(id,project_id,organization_id),
foreign key(requirement_id,project_id,organization_id) references public.closeout_requirements(id,project_id,organization_id));
create table public.evidence_versions (
id uuid primary key default gen_random_uuid(), organization_id uuid not null,project_id uuid not null,deliverable_id uuid not null,
version integer not null check(version>0),file_id uuid not null references public.files,
created_by uuid not null references public.profiles,created_at timestamptz not null default now(),
unique(deliverable_id,version),unique(project_id,file_id),unique(id,project_id,organization_id),
foreign key(deliverable_id,project_id,organization_id) references public.deliverables(id,project_id,organization_id));
create table public.closeout_submissions (
id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations,
project_id uuid not null references public.projects,sequence integer not null,
submitted_by uuid not null references public.profiles,submitted_at timestamptz not null default now(),
request_id uuid not null,requirements_snapshot jsonb not null,unique(project_id,sequence),unique(project_id,request_id),unique(id,project_id,organization_id));
create table public.submission_evidence (
submission_id uuid not null,version_id uuid not null,project_id uuid not null,organization_id uuid not null,
primary key(submission_id,version_id),
foreign key(submission_id,project_id,organization_id) references public.closeout_submissions(id,project_id,organization_id),
foreign key(version_id,project_id,organization_id) references public.evidence_versions(id,project_id,organization_id));
create table public.completeness_reviews (
id uuid primary key default gen_random_uuid(),submission_id uuid not null,requirement_id uuid not null,
project_id uuid not null,organization_id uuid not null,decision text not null check(decision in ('accepted','changes_requested')),
reason text not null default '',reviewed_by uuid not null references public.profiles,reviewed_at timestamptz not null default now(),
unique(submission_id,requirement_id),
foreign key(submission_id,project_id,organization_id) references public.closeout_submissions(id,project_id,organization_id),
foreign key(requirement_id,project_id,organization_id) references public.closeout_requirements(id,project_id,organization_id));

do $$ declare t text; begin
foreach t in array array['closeout_requirements','deliverables','evidence_versions','closeout_submissions','submission_evidence','completeness_reviews'] loop
execute format('alter table public.%I enable row level security',t);
execute format('revoke all on public.%I from public,anon,authenticated',t);
execute format('grant select on public.%I to authenticated',t);
execute format('grant select on public.%I to service_role',t);
execute format('create policy abf_read on public.%I for select to authenticated using (organization_id=public.abf_org() and public.abf_access(project_id))',t);
execute format('create index on public.%I(project_id)',t);
end loop; end $$;

create function public.abf_closeout_state(pid uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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
if n<r.minimum_count then status:='missing';
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

create function public.abf_closeout_command(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare me public.profiles; p public.projects; r public.closeout_requirements; d public.deliverables; f public.files; s public.closeout_submissions;
pid uuid; target uuid; result jsonb; before_state jsonb; n integer; snapshot jsonb; counts jsonb;
begin
pid:=(payload->>'project_id')::uuid;
if not public.abf_write(pid) then raise exception 'Project write access denied' using errcode='42501'; end if;
select * into me from public.profiles where id=auth.uid() and active;
-- All commands for a project serialize, including numbering and review/submit races.
select * into p from public.projects where id=pid for update;
if p.archived or p.status in ('approved','closed') then raise exception 'Historical closed project is read-only'; end if;
if action='requirement_save' then
if me.role not in ('admin','project_manager','coordinator') then raise exception 'Coordinator required'; end if;
if coalesce(length(trim(payload->>'title')),0)=0 then raise exception 'Requirement title required'; end if;
target:=nullif(payload->>'responsible_company_id','')::uuid;
if target is not null and (target is distinct from p.contractor_company_id or not exists(select 1 from public.contractor_companies where id=target and organization_id=me.organization_id and active)) then raise exception 'Responsible company must be the project contractor'; end if;
if nullif(payload->>'id','') is not null then
select * into r from public.closeout_requirements where id=(payload->>'id')::uuid and project_id=pid and organization_id=me.organization_id for update;
if not found then raise exception 'Requirement not found'; end if;
if r.version is distinct from (payload->>'version')::integer then raise exception 'Requirement changed; reload before editing'; end if;
before_state:=to_jsonb(r);
update public.closeout_requirements set title=trim(payload->>'title'),category=coalesce(nullif(payload->>'category',''),'Other'),instructions=coalesce(payload->>'instructions',''),required=coalesce((payload->>'required')::boolean,true),minimum_count=coalesce((payload->>'minimum_count')::integer,1),responsible_company_id=target,version=version+1 where id=r.id returning to_jsonb(closeout_requirements.*) into result;
else
insert into public.closeout_requirements(organization_id,project_id,title,category,instructions,required,minimum_count,responsible_company_id,created_by)
values(me.organization_id,pid,trim(payload->>'title'),coalesce(nullif(payload->>'category',''),'Other'),coalesce(payload->>'instructions',''),coalesce((payload->>'required')::boolean,true),coalesce((payload->>'minimum_count')::integer,1),target,me.id) returning to_jsonb(closeout_requirements.*) into result;
end if;
elsif action='evidence_link' then
if me.role not in ('admin','project_manager','coordinator','contractor_admin','contractor_user') then raise exception 'Submission editor required'; end if;
select * into r from public.closeout_requirements where id=(payload->>'requirement_id')::uuid and project_id=pid and organization_id=me.organization_id;
if not found then raise exception 'Requirement not found'; end if;
select * into f from public.files where id=(payload->>'file_id')::uuid and project_id=pid and organization_id=me.organization_id;
if not found then raise exception 'Project file not found'; end if;
if me.role in ('contractor_admin','contractor_user') and not exists(select 1 from public.profiles where id=f.uploaded_by and contractor_company_id=me.contractor_company_id and organization_id=me.organization_id) then raise exception 'Contractors may link only their company evidence'; end if;
select to_jsonb(v.*) into result from public.evidence_versions v join public.deliverables x on x.id=v.deliverable_id where v.project_id=pid and v.file_id=f.id and x.requirement_id=r.id;
if result is not null then return result; end if;
if nullif(payload->>'deliverable_id','') is null then
insert into public.deliverables(organization_id,project_id,requirement_id,title,created_by) values(me.organization_id,pid,r.id,coalesce(nullif(trim(payload->>'title'),''),f.file_name),me.id) returning * into d;
else
select * into d from public.deliverables where id=(payload->>'deliverable_id')::uuid and requirement_id=r.id and project_id=pid for update;
if not found then raise exception 'Deliverable not found'; end if;
if me.role in ('contractor_admin','contractor_user') and not exists(select 1 from public.profiles where id=d.created_by and contractor_company_id=me.contractor_company_id and organization_id=me.organization_id) then raise exception 'Cannot revise another company deliverable'; end if;
end if;
select coalesce(max(version),0)+1 into n from public.evidence_versions where deliverable_id=d.id;
insert into public.evidence_versions(organization_id,project_id,deliverable_id,version,file_id,created_by) values(me.organization_id,pid,d.id,n,f.id,me.id) returning to_jsonb(evidence_versions.*) into result;
elsif action='submit' then
if me.role not in ('admin','project_manager','coordinator','contractor_admin','contractor_user') then raise exception 'Submitter required'; end if;
if payload->>'request_id' is null then raise exception 'Submission request ID required'; end if;
select * into s from public.closeout_submissions where project_id=pid and request_id=(payload->>'request_id')::uuid;
if found then return to_jsonb(s); end if;
if p.status not in ('draft','needs_rework','submitted','revision_submitted','coordinator_review','ready_for_inspection','inspector_review') then raise exception 'Submission not allowed'; end if;
select jsonb_agg(to_jsonb(q) order by q.id) into snapshot from public.closeout_requirements q where project_id=pid;
if snapshot is null then raise exception 'Configure closeout requirements before submission'; end if;
if not exists(select 1 from public.evidence_versions where project_id=pid) then raise exception 'Link evidence before submission'; end if;
select coalesce(max(sequence),0)+1 into n from public.closeout_submissions where project_id=pid;
insert into public.closeout_submissions(organization_id,project_id,sequence,submitted_by,request_id,requirements_snapshot)
values(me.organization_id,pid,n,me.id,(payload->>'request_id')::uuid,snapshot) returning * into s;
insert into public.submission_evidence(submission_id,version_id,project_id,organization_id)
select s.id,v.id,pid,me.organization_id from public.evidence_versions v where v.project_id=pid and v.version=(select max(x.version) from public.evidence_versions x where x.deliverable_id=v.deliverable_id);
update public.projects set status=case when n=1 then 'submitted'::public.project_status else 'revision_submitted'::public.project_status end where id=pid;
result:=to_jsonb(s);
elsif action='review' then
if me.role not in ('admin','project_manager','coordinator') then raise exception 'Completeness reviewer required'; end if;
select * into s from public.closeout_submissions where project_id=pid order by sequence desc limit 1;
if s.id is null or s.id is distinct from (payload->>'submission_id')::uuid then raise exception 'Submission changed; reload'; end if;
if s.submitted_by=me.id then raise exception 'A different person must review the submission'; end if;
target:=(payload->>'requirement_id')::uuid;
if not exists(select 1 from public.closeout_requirements q, jsonb_array_elements(s.requirements_snapshot) j where q.id=target and q.project_id=pid and (j->>'id')::uuid=q.id and (j->>'version')::integer=q.version) then raise exception 'Requirement changed; resubmit before review'; end if;
select x into counts from jsonb_array_elements(public.abf_closeout_state(pid)->'requirements') x where (x->>'id')::uuid=target;
if counts is null or counts->>'state'='pending_submission' then raise exception 'Evidence or requirement changed; resubmit before review'; end if;
if payload->>'decision'='accepted' and counts->>'state'='missing' then raise exception 'Required evidence count not met'; end if;
if payload->>'decision'='changes_requested' and coalesce(length(trim(payload->>'reason')),0)=0 then raise exception 'Correction reason required'; end if;
insert into public.completeness_reviews(submission_id,requirement_id,project_id,organization_id,decision,reason,reviewed_by)
values(s.id,target,pid,me.organization_id,payload->>'decision',coalesce(trim(payload->>'reason'),''),me.id) returning to_jsonb(completeness_reviews.*) into result;
update public.projects set status=case when payload->>'decision'='changes_requested' then 'needs_rework'::public.project_status else 'coordinator_review'::public.project_status end where id=pid;
elsif action='complete_review' then
if me.role not in ('admin','project_manager','coordinator') then raise exception 'Completeness reviewer required'; end if;
counts:=public.abf_closeout_state(pid)->'counts';
if (counts->>'required')::integer=0 or (counts->>'accepted')::integer<>(counts->>'required')::integer then raise exception 'All required evidence must be accepted'; end if;
if exists(select 1 from public.issues where project_id=pid and status not in ('resolved','closed')) then raise exception 'Open issues must be resolved before inspection handoff'; end if;
if p.status<>'coordinator_review' then raise exception 'Project must be in coordinator review'; end if;
update public.projects set status='ready_for_inspection' where id=pid returning to_jsonb(projects.*) into result;
else raise exception 'Unknown closeout command'; end if;
-- Editing evidence or requirements explicitly invalidates the prior handoff.
if action in ('requirement_save','evidence_link') and p.status<>'draft' then update public.projects set status='needs_rework' where id=pid; end if;
perform abf_private.audit(pid,action,jsonb_build_object('before',before_state,'after',result));
return result;
end $$;
revoke all on function public.abf_closeout_state(uuid),public.abf_closeout_command(text,jsonb) from public,anon;
grant execute on function public.abf_closeout_state(uuid),public.abf_closeout_command(text,jsonb) to authenticated;
