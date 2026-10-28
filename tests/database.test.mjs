import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1), otherOrg=id(2), company=id(3), otherCompany=id(4), project=id(5), otherProject=id(6);
const users={admin:id(10),coordinator:id(11),inspector:id(12),contractor:id(13),viewer:id(14),outsider:id(15),inactive:id(16),otherContractor:id(17)};
let requirement, deliverable, submission;
async function as(user,sql,params=[]) {
  return db.transaction(async tx=>{
    await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[users[user]]);
    await tx.exec('set local role authenticated');
    return (await tx.query(sql,params)).rows;
  });
}
async function command(user,action,payload={},closeout=false) {
  return (await as(user,`select public.${closeout?'abf_closeout_command':'abf_workspace_command'}($1,$2::jsonb) result`,[action,JSON.stringify({project_id:project,...payload})]))[0].result;
}
async function state(user='coordinator') {return (await as(user,'select abf_closeout_state($1) result',[project]))[0].result;}
async function file(n,user='contractor') {
  const path=`${org}/${project}/${id(n)}-test.pdf`;
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('project-files',$1,$2,'{\"mimetype\":\"application/pdf\",\"size\":12}')",[path,users[user]]);
  return command(user,'file_register',{path,name:'test.pdf',category:'As-built'});
}
before(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
  grant usage on schema auth to authenticated,anon; grant execute on all functions in schema auth to authenticated,anon;
  create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,unique(bucket_id,name));
  alter table storage.objects enable row level security;
  create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
  grant usage on schema storage to authenticated; grant all on storage.objects to authenticated;`);
  const baseline=(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8')).replace('create extension if not exists "pgcrypto";','');
  await db.exec(baseline);
  for (const name of ['202609170001_security.sql','202609170002_closeout.sql','202609170003_integrity.sql']) await db.exec(await readFile(new URL(`../supabase/migrations/${name}`,import.meta.url),'utf8'));
  await db.query('insert into organizations(id,name,slug) values($1,\'One\',\'one\'),($2,\'Two\',\'two\')',[org,otherOrg]);
  await db.query('insert into contractor_companies(id,organization_id,name) values($1,$2,\'A\'),($3,$4,\'B\')',[company,org,otherCompany,otherOrg]);
  for (const [name,uid] of Object.entries(users)) {
    await db.query('insert into auth.users(id,email) values($1,$2)',[uid,`${name}@example.test`]);
    const role={outsider:'admin',inactive:'coordinator',otherContractor:'contractor_user',contractor:'contractor_user'}[name]||name;
    await db.query('insert into profiles(id,organization_id,contractor_company_id,full_name,role,active) values($1,$2,$3,$4,$5,$6)',[uid,['outsider','otherContractor'].includes(name)?otherOrg:org,role==='contractor_user'?(name==='otherContractor'?otherCompany:company):null,name,role,name!=='inactive']);
  }
  await db.query("insert into projects(id,organization_id,contractor_company_id,project_number,name,created_by,inspector_id) values($1,$2,$3,'P1','One',$4,$5),($6,$7,$8,'P2','Two',$9,null)",[project,org,company,users.admin,users.inspector,otherProject,otherOrg,otherCompany,users.outsider]);
  await db.query("insert into activity_events(organization_id,description,event_type) values($1,'Private tenant event','invite'),($2,'Other tenant event','invite')",[org,otherOrg]);
});
after(()=>db.close());

test('tenant isolation includes null-project activity; inactive members see nothing',async()=>{
  const rows=await as('outsider','select * from activity_events');
  assert.equal(rows.length,1); assert.equal(rows[0].organization_id,otherOrg);
  assert.equal((await as('outsider','select * from projects where id=$1',[project])).length,0);
  assert.equal((await as('inactive','select * from projects')).length,0);
  await assert.rejects(state('outsider'),/access denied/);
});
test('direct writes and viewer RPC writes denied',async()=>{
  for(const role of ['admin','contractor','viewer']) await assert.rejects(as(role,"update projects set status='approved' where id=$1",[project]),/permission denied/);
  await assert.rejects(command('viewer','issue_create',{title:'Forbidden'}),/Read-only/);
  await assert.rejects(command('viewer','requirement_save',{title:'Forbidden'},true),/access denied/);
  await assert.rejects(command('inactive','project_status',{status:'approved'}),/Active membership/);
});
test('storage guard rejects viewers, foreign tenants, malformed paths, deletes and overwrites',async()=>{
  const path=`${org}/${project}/new.pdf`;
  await assert.rejects(as('viewer',"insert into storage.objects(bucket_id,name) values('project-files',$1)",[path]),/row-level security/);
  await assert.rejects(as('outsider',"insert into storage.objects(bucket_id,name) values('project-files',$1)",[path]),/row-level security/);
  assert.equal((await as('contractor','select abf_storage_access($1,true) ok',['bad/path']))[0].ok,false);
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('project-files',$1,$2)",[path,users.contractor]);
  assert.equal((await as('admin','delete from storage.objects where name=$1 returning *',[path])).length,0);
  assert.equal((await as('admin',"update storage.objects set metadata='{}' where name=$1 returning *",[path])).length,0);
});
test('project/company assignment rejects cross-tenant IDs',async()=>{
  await assert.rejects(command('admin','project_create',{name:'Bad',projectNumber:'bad',contractorCompanyId:otherCompany}),/Invalid contractor/);
  await assert.rejects(db.query('update profiles set contractor_company_id=$1 where id=$2',[otherCompany,users.contractor]),/Invalid contractor/);
});
test('approval, closure and submission cannot bypass evidence workflow',async()=>{
  for(const role of ['admin','inspector','contractor']) for(const status of ['approved','closed','submitted','ready_for_inspection']) await assert.rejects(command(role,'project_status',{status}),/Transition not permitted/);
  await assert.rejects(command('contractor','submit',{request_id:id(80)},true),/Configure closeout/);
});
test('requirements configured independently; missing counts are accurate',async()=>{
  requirement=await command('coordinator','requirement_save',{title:'As-built drawings',category:'Drawings',minimum_count:2,required:true,responsible_company_id:company},true);
  let x=await state(); assert.equal(x.submission,null);assert.equal(x.counts.required,1);assert.equal(x.counts.missing,1);assert.equal(x.counts.percent,0);
  const y=(await as('outsider','select abf_closeout_state($1) result',[otherProject]))[0].result;
  assert.equal(y.counts.required,0);assert.equal(y.counts.percent,null);
});
test('file finalization validates ownership, preserves idempotence, and versions evidence',async()=>{
  const f=await file(30);
  await assert.rejects(command('coordinator','file_register',{path:f.storage_path,name:'stolen.pdf'}),/owned by another/);
  assert.equal((await command('contractor','file_register',{path:f.storage_path,name:'test.pdf'})).id,f.id);
  const v=await command('contractor','evidence_link',{requirement_id:requirement.id,file_id:f.id},true);deliverable=v.deliverable_id;
  const f2=await file(31);
  await command('contractor','evidence_link',{requirement_id:requirement.id,file_id:f2.id},true);
  const x=await state();assert.equal(x.counts.pending,1);assert.equal(x.requirements[0].state,'pending_submission');
  await assert.rejects(as('contractor','delete from evidence_versions where id=$1',[v.id]),/permission denied/);
});
test('contractor submission atomically changes status and snapshots evidence; retry does not duplicate',async()=>{
  submission=await command('contractor','submit',{request_id:id(81)},true);
  assert.equal((await command('contractor','submit',{request_id:id(81)},true)).id,submission.id);
  assert.equal((await as('contractor','select status from projects where id=$1',[project]))[0].status,'submitted');
  assert.equal((await state()).requirements[0].state,'pending_review');
  assert.equal((await as('contractor','select * from submission_evidence where submission_id=$1',[submission.id])).length,2);
});
test('review requires reviewer role; rejection reason required; decisions immutable',async()=>{
  const payload={submission_id:submission.id,requirement_id:requirement.id,decision:'accepted'};
  await assert.rejects(command('contractor','review',payload,true),/reviewer required/);
  await assert.rejects(command('coordinator','review',{...payload,decision:'changes_requested'},true),/reason required/);
  await command('coordinator','review',{...payload,decision:'changes_requested',reason:'Correct footage'},true);
  assert.equal((await state()).counts.changes_requested,1);
  await assert.rejects(command('coordinator','review',payload,true),/unique constraint/);
});
test('new evidence preserves history and requires fresh submission/review',async()=>{
  const f=await file(32);
  const v=await command('contractor','evidence_link',{requirement_id:requirement.id,deliverable_id:deliverable,file_id:f.id},true);
  assert.equal(v.version,2);assert.equal((await state()).requirements[0].state,'pending_submission');
  await assert.rejects(command('coordinator','review',{submission_id:submission.id,requirement_id:requirement.id,decision:'accepted'},true),/resubmit/);
  submission=await command('contractor','submit',{request_id:id(82)},true);
  await command('coordinator','review',{submission_id:submission.id,requirement_id:requirement.id,decision:'accepted'},true);
  assert.equal((await state()).counts.percent,100);
  assert.equal((await as('contractor','select * from evidence_versions where deliverable_id=$1',[deliverable])).length,2);
  await command('coordinator','complete_review',{},true);
  assert.equal((await as('coordinator','select status from projects where id=$1',[project]))[0].status,'ready_for_inspection');
  await assert.rejects(command('admin','project_status',{status:'approved'}),/Transition not permitted/);
});
test('requirement edits invalidate acceptance and handoff without deleting prior decisions',async()=>{
  await command('coordinator','requirement_save',{...requirement,minimum_count:3},true);
  assert.equal((await state()).counts.missing,1);
  await assert.rejects(command('coordinator','complete_review',{},true),/must be accepted/);
  assert.equal((await as('coordinator','select count(*)::int n from completeness_reviews'))[0].n,2);
  await assert.rejects(command('coordinator','requirement_save',{...requirement,title:'Stale edit'},true),/reload/);
});
test('issue lifecycle denies contractor closure and allocates numbers server-side',async()=>{
  const i=await command('inspector','issue_create',{title:'Depth correction',priority:'high'});
  await assert.rejects(command('contractor','issue_status',{id:i.id,status:'closed'}),/not permitted/);
  await command('contractor','issue_status',{id:i.id,status:'contractor_responded'});
  await command('contractor','issue_status',{id:i.id,status:'ready_for_review'});
  await command('inspector','issue_status',{id:i.id,status:'resolved'});
  await command('inspector','issue_status',{id:i.id,status:'closed'});
  const next=await command('inspector','issue_create',{title:'Second correction'});
  assert.equal(next.issue_number,i.issue_number+1);
  await assert.rejects(command('outsider','issue_status',{id:i.id,status:'open',project_id:otherProject}),/Issue not found/);
});

test('same-tenant contractor isolation and disabled membership cannot issue commands',async()=>{
  const uid=id(90), c=id(91);
  await db.query("insert into contractor_companies(id,organization_id,name) values($1,$2,'Unassigned contractor')",[c,org]);
  await db.query("insert into auth.users(id) values($1)",[uid]);
  await db.query("insert into profiles(id,organization_id,contractor_company_id,full_name,role) values($1,$2,$3,'Unassigned','contractor_user')",[uid,org,c]);
  users.unassigned=uid;
  assert.equal((await as('unassigned','select * from projects where id=$1',[project])).length,0);
  await assert.rejects(command('unassigned','submit',{request_id:id(92)},true),/access denied/);
  await assert.rejects(command('inspector','issue_create',{title:'Wrong company assignment',assignedTo:uid}),/Assignee must have project access/);
  assert.equal((await as('unassigned','select * from files where project_id=$1',[project])).length,0);
});
test('RPC cannot append fake audit events, mutate files, or redirect an issue parent',async()=>{
  await assert.rejects(as('admin',"insert into activity_events(organization_id,description,event_type) values($1,'Forged','fake')",[org]),/permission denied/);
  await assert.rejects(as('contractor',"update files set project_id=$1",[otherProject]),/permission denied/);
  await assert.rejects(db.query("update issues set project_id=$1 where project_id=$2",[otherProject,project]),/immutable/);
});
test('self review, stale submission IDs, and missing evidence cannot be accepted',async()=>{
  const s=await command('coordinator','submit',{request_id:id(93)},true);
  await assert.rejects(command('coordinator','review',{submission_id:s.id,requirement_id:requirement.id,decision:'accepted'},true),/different person/);
  await assert.rejects(command('admin','review',{submission_id:submission.id,requirement_id:requirement.id,decision:'accepted'},true),/Submission changed/);
  await assert.rejects(command('admin','review',{submission_id:s.id,requirement_id:requirement.id,decision:'accepted'},true),/count not met/);
});
test('parallel requests serialize issue numbers and replay-safe submissions',async()=>{
  const issues=await Promise.all([command('inspector','issue_create',{title:'Concurrent A'}),command('inspector','issue_create',{title:'Concurrent B'})]);
  assert.notEqual(issues[0].issue_number,issues[1].issue_number);
  const submissions=await Promise.all([command('contractor','submit',{request_id:id(94)},true),command('contractor','submit',{request_id:id(94)},true)]);
  assert.equal(submissions[0].id,submissions[1].id);
});
test('failed command rolls back its domain changes and audit event',async()=>{
  const before=(await db.query('select count(*)::int n from activity_events')).rows[0].n;
  await assert.rejects(command('coordinator','requirement_save',{title:'Bad count',minimum_count:0},true),/check constraint/);
  assert.equal((await db.query('select count(*)::int n from activity_events')).rows[0].n,before);
  assert.equal((await db.query("select count(*)::int n from closeout_requirements where title='Bad count'")).rows[0].n,0);
});
test('profile reactivation is allowed while self-demotion and cross-tenant edits are denied',async()=>{
  await command('admin','profile_update',{id:users.inactive,full_name:'Restored',role:'coordinator',active:true});
  assert.equal((await as('inactive','select * from projects')).length,1);
  await assert.rejects(command('admin','profile_update',{id:users.admin,role:'viewer',active:false}),/another administrator/);
  await assert.rejects(command('admin','profile_update',{id:users.outsider,role:'viewer',active:false}),/Member not found/);
});
test('feature rollback refuses to erase populated requirements',async()=>{
  await assert.rejects(db.exec(await readFile(new URL('../supabase/rollback/202609170002_closeout.down.sql',import.meta.url),'utf8')),/Rollback refused/);
  await db.exec('rollback');
  assert.ok((await state()).requirements.length>0);
});
test('anonymous guard defeats a permissive legacy object policy',async()=>{
 await db.transaction(async tx=>{
  await tx.exec("grant usage on schema storage to anon;grant select on storage.objects to anon;create policy legacy_anonymous on storage.objects for select to anon using(true)");
  await tx.exec('set local role anon');
  assert.equal((await tx.query("select * from storage.objects where bucket_id='project-files'")).rows.length,0);
 });
});
