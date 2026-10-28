import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite(),id=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),foreignOrg=id(2),pid=id(3),company=id(4),file=id(5),invoiceFile=id(6);
const users={admin:id(10),coordinator:id(11),contractor:id(12),viewer:id(13),outsider:id(14),inspector:id(15)};
const sql=name=>readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8');
async function as(role,query,params=[]){return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[users[role]]);await tx.exec('set local role authenticated');return (await tx.query(query,params)).rows;});}
const command=async(role,fn,action,payload={})=>(await as(role,`select ${fn}($1,$2) result`,[action,JSON.stringify({project_id:pid,...payload})]))[0].result;
const auth=(role,action,p)=>command(role,'abf_authorization_command',action,p);
const invoice=(role,action,p)=>command(role,'abf_invoice_command',action,p);
let v,ntp,po;
const fields={number:'SYNTHETIC',effective_date:'2020-01-01',currency:'USD',amount:'100',scope:'Test telecom scope',status:'current',file_id:file};
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;grant usage on schema auth to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text,name text,owner_id text,metadata jsonb);alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;create publication supabase_realtime;`);
 for(const m of ['202609170000_legacy_baseline','202609170001_security','202609170002_closeout','202609170003_integrity','202609220000_lifecycle_v1','202610060000_invoice_documents','202610070000_commercial_authorizations'])await db.exec((await sql(`migrations/${m}.sql`)).replace('create extension if not exists "pgcrypto";',''));
 await db.exec(await sql('rollback/202610070000_commercial_authorizations.down.sql'));
 await db.exec(await sql('migrations/202610070000_commercial_authorizations.sql'));
 await db.query("insert into organizations(id,name,slug) values($1,'A','a'),($2,'B','b')",[org,foreignOrg]);
 await db.query("insert into contractor_companies(id,organization_id,name) values($1,$2,'Contractor')",[company,org]);
 for(const [role,uid] of Object.entries(users)){await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into profiles(id,organization_id,full_name,role,contractor_company_id) values($1,$2,$3,$4,$5)',[uid,role==='outsider'?foreignOrg:org,role,role==='contractor'?'contractor_user':role==='outsider'?'admin':role,role==='contractor'?company:null]);}
 await db.query("insert into projects(id,organization_id,project_number,name,created_by,contractor_company_id,inspector_id) values($1,$2,'AUTH-TEST','Test',$3,$4,$5)",[pid,org,users.admin,company,users.inspector]);
 await db.query("insert into files(id,organization_id,project_id,storage_path,file_name,uploaded_by) values($1,$2,$3,'auth.pdf','auth.pdf',$4),($5,$2,$3,'invoice.pdf','invoice.pdf',$6)",[file,org,pid,users.admin,invoiceFile,users.contractor]);
});
after(()=>db.close());
const check=async()=> (await as('coordinator','select abf_authorization_check($1,$2) result',[pid,v.id]))[0].result;
test('authorization gates are opt-in; required missing documents deny approval server-side',async()=>{
 await assert.rejects(invoice('contractor','submit',{file_id:invoiceFile,invoice_number:'I-1',amount:'100',currency:'USD',invoice_date:'2026-10-07',ntp_id:id(999)}),/Same-project/);
 v=await invoice('contractor','submit',{file_id:invoiceFile,invoice_number:'I-1',amount:'100',currency:'USD',invoice_date:'2026-10-07'});
 assert.equal((await check()).can_approve,true);
 await auth('admin','configure',{ntp_required:true,po_required:true,amount_check:true});
 assert.equal((await check()).blockers.length,2);
 await assert.rejects(invoice('coordinator','review',{version_id:v.id,decision:'approved',scope_confirmed:true}),/NTP missing/);
});
test('only internal managers publish authorization revisions; immutable history and tenant RLS',async()=>{
 for(const role of ['contractor','viewer','outsider','inspector'])await assert.rejects(auth(role,'revise',{...fields,kind:'ntp'}),/denied|required/);
 ntp=await auth('coordinator','revise',{...fields,kind:'ntp',status:'revision_required'});
 po=await auth('admin','revise',{...fields,kind:'po',amount:'99'});
 assert.match((await check()).blockers.join(' '),/NTP revision required/);
 await assert.rejects(invoice('coordinator','review',{version_id:v.id,decision:'approved',scope_confirmed:true}),/revision required/);
 ntp=await auth('coordinator','revise',{...fields,kind:'ntp',previous_id:ntp.id});
 await assert.rejects(invoice('coordinator','review',{version_id:v.id,decision:'approved',scope_confirmed:true}),/exceeds current PO/);
 assert.equal((await as('contractor','select * from authorization_versions')).length,3);
 assert.equal((await as('outsider','select * from authorization_versions')).length,0);
 await assert.rejects(as('viewer','update authorization_versions set amount=0'),/permission denied/);
 await assert.rejects(db.exec('update authorization_versions set amount=0'),/immutable/);
 await assert.rejects(auth('admin','revise',{...fields,kind:'po',previous_id:id(999)}),/changed/);
});
test('currency, superseded, future date and amount configuration produce explicit blockers',async()=>{
 po=await auth('admin','revise',{...fields,kind:'po',previous_id:po.id,currency:'EUR'});assert.match((await check()).blockers.join(' '),/currency/);
 po=await auth('admin','revise',{...fields,kind:'po',previous_id:po.id,status:'superseded'});assert.match((await check()).blockers.join(' '),/superseded/);
 po=await auth('admin','revise',{...fields,kind:'po',previous_id:po.id,effective_date:'2999-01-01'});assert.match((await check()).blockers.join(' '),/not yet effective/);
 po=await auth('admin','revise',{...fields,kind:'po',previous_id:po.id,amount:'1'});
 await auth('admin','configure',{ntp_required:true,po_required:true,amount_check:false});assert.equal((await check()).can_approve,true);
 await auth('admin','configure',{ntp_required:true,po_required:true,amount_check:true});
 po=await auth('admin','revise',{...fields,kind:'po',previous_id:po.id,amount:'100'});assert.equal((await check()).can_approve,true);
});
test('valid current authorization permits approval with scope confirmation and freezes approval snapshot',async()=>{
 await assert.rejects(invoice('coordinator','review',{version_id:v.id,decision:'approved'}),/Confirm.*scope/);
 await invoice('coordinator','review',{version_id:v.id,decision:'approved',scope_confirmed:true});
 const receipt=(await as('viewer','select * from authorization_approval_receipts'))[0];assert.equal(receipt.snapshot.current.po.id,po.id);assert.equal(receipt.snapshot.scope_confirmed,true);
 await invoice('coordinator','require',{required:true});
 ntp=await auth('admin','revise',{...fields,kind:'ntp',previous_id:ntp.id,status:'revision_required'});
 assert.equal((await as('coordinator','select abf_invoice_state($1) s',[pid]))[0].s.complete,false);
 assert.equal((await as('viewer','select * from authorization_approval_receipts'))[0].snapshot.current.ntp.version,2,'approval-time snapshot remains immutable');
 ntp=await auth('admin','revise',{...fields,kind:'ntp',previous_id:ntp.id});
 assert.equal((await as('coordinator','select abf_invoice_state($1) s',[pid]))[0].s.complete,true);
 for(const table of ['invoice_authorization_links','authorization_approval_receipts']){assert.equal((await as('outsider',`select * from ${table}`)).length,0);await assert.rejects(as('admin',`delete from ${table}`),/permission denied/);}
 await assert.rejects(as('admin','select abf_private.invoice_command_v11($1,$2)',['review',JSON.stringify({project_id:pid})]),/permission denied/);
 await assert.rejects(db.exec(await sql('rollback/202610070000_commercial_authorizations.down.sql')),/Refusing/);await db.exec('rollback');
});
test('inactive and same-tenant unassigned contractors cannot read authorization records or mutate frozen projects',async()=>{
 await db.query('update profiles set active=false where id=$1',[users.viewer]);
 for(const table of ['authorization_versions','invoice_authorization_links','authorization_approval_receipts'])assert.equal((await as('viewer',`select * from ${table}`)).length,0);
 await db.query("insert into contractor_companies(id,organization_id,name) values($1,$2,'Other same-tenant contractor')",[id(99),org]);
 await db.query('update profiles set contractor_company_id=$1 where id=$2',[id(99),users.contractor]);
 for(const table of ['authorization_versions','invoice_authorization_links','authorization_approval_receipts'])assert.equal((await as('contractor',`select * from ${table}`)).length,0);
 await db.query("update projects set status='approved' where id=$1",[pid]);
 await assert.rejects(auth('admin','configure',{ntp_required:false,po_required:false,amount_check:false}),/denied/);
});
