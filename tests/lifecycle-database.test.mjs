import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
const id=n=>`20000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),other=id(2),project=id(3),foreign=id(4),file=id(5),foreignFile=id(6);
const users={admin:id(10),coordinator:id(11),inspector:id(12),contractor:id(13),viewer:id(14),outsider:id(15)};
const sql=name=>readFile(new URL(`../supabase/${name}`,import.meta.url),'utf8');
async function as(role,query,params=[]){return db.transaction(async tx=>{await tx.query("select set_config('request.jwt.claim.sub',$1,true)",[users[role]]);await tx.exec('set local role authenticated');return (await tx.query(query,params)).rows;});}
async function cmd(role,action,payload={}){return (await as(role,'select abf_lifecycle_command($1,$2) result',[action,JSON.stringify({project_id:project,...payload})]))[0].result;}
before(async()=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
 grant usage on schema auth to authenticated,anon;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid,bucket_id text,name text,owner_id text,metadata jsonb);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
 create publication supabase_realtime;`);
 for(const name of ['202609170000_legacy_baseline','202609170001_security','202609170002_closeout','202609170003_integrity','202609220000_lifecycle_v1'])await db.exec((await sql(`migrations/${name}.sql`)).replace('create extension if not exists "pgcrypto";',''));
 // Verify dependency-correct empty rollback and reapply before fixtures exist.
 await db.exec(await sql('rollback/202609220000_lifecycle_v1.down.sql'));
 await db.exec(await sql('migrations/202609220000_lifecycle_v1.sql'));
 await db.exec(await sql('migrations/202610060000_invoice_documents.sql'));
 await db.exec(await sql('rollback/202610060000_invoice_documents.down.sql'));
 await db.exec(await sql('migrations/202610060000_invoice_documents.sql'));
 await db.exec(await sql('migrations/202610070000_commercial_authorizations.sql'));
 await db.exec(await sql('migrations/202610140000_project_assignments.sql'));
 await db.exec(await sql('migrations/202610200000_field_documentation.sql'));
 await db.query("insert into organizations(id,name,slug) values($1,'One','one'),($2,'Two','two')",[org,other]);
 await db.query("insert into contractor_companies(id,organization_id,name) values($1,$2,'Contractor'),($3,$4,'Reassigned Contractor'),($5,$6,'Foreign Contractor')",[id(7),org,id(8),org,id(9),other]);
 for(const [role,uid] of Object.entries(users)){
  await db.query('insert into auth.users(id) values($1)',[uid]);
  await db.query('insert into profiles(id,organization_id,full_name,role,contractor_company_id) values($1,$2,$3,$4,$5)',[uid,role==='outsider'?other:org,role,role==='outsider'?'admin':role==='contractor'?'contractor_user':role,role==='contractor'?id(7):null]);
 }
 await db.query("insert into projects(id,organization_id,project_number,name,created_by,contractor_company_id) values($1,$2,'A','One',$3,$4),($5,$6,'B','Two',$7,null)",[project,org,users.admin,id(7),foreign,other,users.outsider]);
 await db.query('update projects set inspector_id=$1 where id=$2',[users.inspector,project]);
 await db.query("insert into files(id,organization_id,project_id,storage_path,file_name,uploaded_by) values($1,$2,$3,'a.pdf','a.pdf',$4),($5,$6,$7,'b.pdf','b.pdf',$8)",[file,org,project,users.admin,foreignFile,other,foreign,users.outsider]);
});
after(()=>db.close());
let first,second;
test('project assignments can be reassigned only by internal project managers and retain audit history',async()=>{
 const value=(await as('coordinator','select public.abf_project_assignments_update($1,$2,$3,$4) result',[project,id(8),users.admin,users.inspector]))[0].result;
 assert.equal(value.contractor_company_id,id(8));assert.equal(value.coordinator_id,users.admin);assert.equal(value.inspector_id,users.inspector);
 const history=await as('coordinator',"select action,record from lifecycle_history where project_id=$1 and action='project_assignments_updated'",[project]);
 assert.equal(history.length,1);assert.equal(history[0].record.before.contractor_company_id,id(7));assert.equal(history[0].record.after.contractor_company_id,id(8));
 assert.equal((await as('coordinator',"select event_type from activity_events where project_id=$1 and event_type='project_assignments_updated'",[project])).length,1);
 await assert.rejects(as('coordinator','select public.abf_project_assignments_update($1,$2,$3,$4)',[project,id(9),users.admin,users.inspector]),/belong to this organization/);
 await assert.rejects(as('coordinator','select public.abf_project_assignments_update($1,$2,$3,$4)',[project,id(8),users.inspector,users.inspector]),/Coordinator/);
 await assert.rejects(as('coordinator','select public.abf_project_assignments_update($1,$2,$3,$4)',[project,id(8),users.admin,users.coordinator]),/Inspector/);
 for(const role of ['contractor','viewer','outsider']) await assert.rejects(as(role,'select public.abf_project_assignments_update($1,$2,$3,$4)',[project,id(8),users.admin,users.inspector]),/requires an active Admin or Coordinator|denied/);
 await as('coordinator','select public.abf_project_assignments_update($1,$2,$3,$4)',[project,id(7),users.coordinator,users.inspector]);
});
test('package release requires draft, local attachment, and revision explanation',async()=>{
 first=await cmd('coordinator','package_create',{revision_label:'Rev 0',status:'released'});assert.equal(first.status,'draft');
 await assert.rejects(cmd('coordinator','package_release',{package_id:first.id}),/Attach/);
 await assert.rejects(cmd('coordinator','package_attach',{package_id:first.id,file_id:foreignFile}),/Project file/);
 await cmd('coordinator','package_attach',{package_id:first.id,file_id:file});
 await cmd('coordinator','package_release',{package_id:first.id});
 await assert.rejects(cmd('coordinator','package_attach',{package_id:first.id,file_id:file}),/Only draft/);
 await assert.rejects(cmd('coordinator','package_release',{package_id:first.id}),/Only a draft/);
 second=await cmd('coordinator','package_create',{revision_label:'Rev 1',notes:'Walkout route correction'});
 await cmd('coordinator','package_attach',{package_id:second.id,file_id:file});await cmd('coordinator','package_release',{package_id:second.id});
 const rows=await as('contractor','select * from construction_packages order by revision_number');
 assert.equal(rows[0].status,'superseded');assert.equal(rows[1].status,'released');assert.equal(rows[0].revision_label,'Rev 0');
});
test('lifecycle role controls and known foreign IDs fail closed',async()=>{
 for(const role of ['viewer','outsider'])for(const action of ['package_create','package_attach','package_release','asset_upsert','asset_import','field_change_create','field_change_resolve','asset_link','requirement_asset','lifecycle_advance','accept_closeout'])await assert.rejects(cmd(role,action,{package_id:second.id,revision_label:'forbidden'}),/denied/);
 for(const role of ['contractor','inspector'])await assert.rejects(cmd(role,'package_create',{revision_label:'no'}),/Coordinator/);
 for(const table of ['construction_packages','construction_package_files','project_assets','field_changes','asset_imports','lifecycle_history','asset_links','closeout_packages']){
  assert.equal((await as('outsider',`select * from ${table} where project_id=$1`,[project])).length,0);
  await assert.rejects(as('admin',`delete from ${table} where project_id=$1`,[project]),/permission denied/);
 }
});
test('CSV import is atomic on duplicate and malformed rows; preserves existing records',async()=>{
 const row={identifier:'SP-1',asset_type:'splice',planned_description:'Original'};
 await cmd('admin','asset_import',{source_name:'synthetic.csv',rows:[row]});
 await assert.rejects(cmd('admin','asset_import',{rows:[{...row,identifier:'SP-2'},row]}),/unique/);
 await assert.rejects(cmd('admin','asset_import',{rows:[{...row,identifier:'SP-3',asset_type:'bogus'}]}),/check constraint/);
 assert.equal((await as('admin','select * from project_assets')).length,1);assert.equal((await as('admin','select * from asset_imports')).length,1);
 await cmd('inspector','asset_upsert',{identifier:'SP-1',asset_type:'splice',actual_description:'Field verified'});
 const [asset]=await as('admin','select * from project_assets');assert.equal(asset.planned_description,'Original');assert.equal(asset.actual_description,'Field verified');
 await assert.rejects(cmd('contractor','asset_upsert',row),/denied/);
});
test('field changes resolve to same-project revisions; populated rollback refuses',async()=>{
 const change=await cmd('contractor','field_change_create',{title:'Route obstruction'});
 await assert.rejects(cmd('admin','field_change_resolve',{id:change.id,package_id:id(999),resolution:'bad'}),/Project package/);
 const resolved=await cmd('admin','field_change_resolve',{id:change.id,package_id:second.id,resolution:'Rerouted in Rev 1'});assert.equal(resolved.status,'resolved');
 await assert.rejects(db.exec(await sql('rollback/202609220000_lifecycle_v1.down.sql')),/Refusing/);
 assert.equal((await db.query('select count(*)::int n from construction_packages')).rows[0].n,2);
});
test('configured evidence slots, submission notes/revision snapshot, and field attachments stay tenant-safe',async()=>{
 const pid=id(110),packageFile=id(111),slotFile=id(112),fieldFile=id(113),slotInside=id(116);
 await db.query("insert into projects(id,organization_id,project_number,name,created_by,contractor_company_id) values($1,$2,'SNAP-1','Snapshot test',$3,$4)",[pid,org,users.admin,id(7)]);
 await db.query("insert into files(id,organization_id,project_id,storage_path,file_name,uploaded_by) values($1,$2,$3,'snap-package.pdf','Package.pdf',$4),($5,$2,$3,'slot-photo.jpg','Slot.jpg',$6),($7,$2,$3,'walkout-photo.jpg','Walkout.jpg',$8),($9,$2,$3,'inside-photo.jpg','Inside.jpg',$10)",[packageFile,org,pid,users.admin,slotFile,users.contractor,fieldFile,users.contractor,slotInside,users.contractor]);
 const life=async(role,action,payload={})=>(await as(role,'select abf_lifecycle_command($1,$2) result',[action,JSON.stringify({project_id:pid,...payload})]))[0].result;
 const rpc=async(role,name,payload={})=>(await as(role,`select public.${name}($1) result`,[JSON.stringify({project_id:pid,...payload})]))[0].result;
 const rev0=await life('coordinator','package_create',{revision_label:'Rev 0'});
 await life('coordinator','package_attach',{package_id:rev0.id,file_id:packageFile});await life('coordinator','package_release',{package_id:rev0.id});
 const requirement=await rpc('coordinator','abf_requirement_save_v12',{title:'Enclosure documentation',category:'Field photos',required:true,minimum_count:1,evidence_slots:[{key:'outside',title:'Enclosure exterior',instructions:'Show the enclosure and surrounding location.',required:true},{key:'inside',title:'Interior arrangement',instructions:'Show the tray arrangement and labels.',required:true}]});
 assert.equal(requirement.evidence_slots.length,2);
 await assert.rejects(rpc('viewer','abf_requirement_save_v12',{title:'Forbidden',evidence_slots:[]}),/Coordinator required/);
 await assert.rejects(rpc('contractor','abf_evidence_slot_link_v12',{requirement_id:requirement.id,file_id:slotFile,slot_key:'unknown'}),/current requirement/);
 await assert.rejects(as('contractor','select abf_closeout_command($1,$2)', ['submit',JSON.stringify({project_id:pid,request_id:id(114),submission_notes:'Field notes'})]),/Required evidence missing: Enclosure documentation — Enclosure exterior/);
 const evidence=await rpc('contractor','abf_evidence_slot_link_v12',{requirement_id:requirement.id,file_id:slotFile,slot_key:'outside'});
 assert.equal(evidence.slot_key,'outside');
 const state=(await as('coordinator','select abf_closeout_state($1) state',[pid]))[0].state;
 assert.equal(state.requirements[0].state,'missing','required slot must be missing even if minimum file count is met');
 assert.equal(state.requirements[0].slot_states.find(slot=>slot.key==='inside').state,'missing');
 assert.equal(state.counts.missing,1);
 const queueStates=(await as('coordinator','select public.abf_invoice_states() state'))[0].state;
 const foreignQueueStates=(await as('outsider','select public.abf_invoice_states() state'))[0].state;
 assert.ok(queueStates[pid]);assert.equal(foreignQueueStates[pid],undefined,'batched invoice queue state is access-scoped');
 await assert.rejects(rpc('contractor','abf_submit_closeout_v12',{request_id:id(115),submission_notes:'Field notes'}),/Required evidence missing: Enclosure documentation — Interior arrangement/);
 await rpc('contractor','abf_evidence_slot_link_v12',{requirement_id:requirement.id,file_id:slotInside,slot_key:'inside'});
 const submission=await rpc('contractor','abf_submit_closeout_v12',{request_id:id(117),submission_notes:'Measured enclosure at station 14+20; photos show exterior.'});
 assert.equal(submission.construction_package_id,rev0.id);assert.equal(submission.construction_package_snapshot.revision_label,'Rev 0');
 assert.equal(submission.submission_notes,'Measured enclosure at station 14+20; photos show exterior.');
 const rev1=await life('coordinator','package_create',{revision_label:'Rev 1',notes:'Walkout adjustment'});
 await life('coordinator','package_attach',{package_id:rev1.id,file_id:packageFile});await life('coordinator','package_release',{package_id:rev1.id});
 const [unchanged]=await as('admin','select * from closeout_submissions where id=$1',[submission.id]);
 assert.equal(unchanged.construction_package_snapshot.revision_label,'Rev 0');assert.equal(unchanged.submission_notes,'Measured enclosure at station 14+20; photos show exterior.');
 await assert.rejects(rpc('viewer','abf_field_change_create_v12',{title:'No'}),/Field change write denied/);
 await assert.rejects(rpc('contractor','abf_field_change_create_v12',{title:'Wrong asset',asset_id:id(999)}),/Asset must belong/);
 const change=await rpc('contractor','abf_field_change_create_v12',{title:'Handhole obstruction',change_type:'handhole',location:'Station 14+20',sheet_reference:'C-04 / Grid B7',description:'Cover blocked by temporary material.',file_ids:[fieldFile]});
 assert.equal(change.reported_by,users.contractor);assert.equal(change.sheet_reference,'C-04 / Grid B7');
 assert.equal((await as('contractor','select * from field_change_files where field_change_id=$1',[change.id])).length,1);
 await assert.rejects(rpc('contractor','abf_field_change_create_v12',{title:'Foreign attachment',file_ids:[foreignFile]}),/registered file in this project/);
 const rev2=await life('coordinator','package_create',{revision_label:'Rev 2',notes:'Resolved the handhole obstruction'});
 await rpc('coordinator','abf_field_change_resolve_v12',{id:change.id,package_id:rev2.id,resolution:'Relocated material and confirmed clearance in Rev 2.'});
 const [resolved]=await as('coordinator','select * from field_changes where id=$1',[change.id]);assert.equal(resolved.status,'resolved');assert.equal(resolved.resulting_package_id,rev2.id);
 assert.equal((await as('outsider','select * from field_change_files where project_id=$1',[pid])).length,0);
 for(const role of ['admin','contractor','viewer','outsider'])await assert.rejects(as(role,'insert into field_change_files(organization_id,project_id,field_change_id,file_id,added_by) values($1,$2,$3,$4,$5)',[org,pid,change.id,fieldFile,users.admin]),/permission denied/);
 assert.equal((await as('contractor','select * from closeout_submissions where id=$1',[submission.id])).length,1);
 assert.equal((await as('outsider','select * from closeout_submissions where id=$1',[submission.id])).length,0);
 await assert.rejects(db.exec(await sql('rollback/202610200000_field_documentation.down.sql')),/Refusing rollback/);
});
const invoiceCmd=async(role,action,payload={})=>(await as(role,'select abf_invoice_command($1,$2) result',[action,JSON.stringify({project_id:project,...payload})]))[0].result;
let invoiceV1,invoiceV2;
test('invoice document permissions, validation, required gate and safe retry',async()=>{
 for(const role of ['viewer','outsider','inspector'])await assert.rejects(invoiceCmd(role,'require',{required:true}),/denied|Coordinator/);
 await invoiceCmd('coordinator','require',{required:true});
 await assert.rejects(cmd('inspector','accept_closeout'),/invoice documents/);
 await assert.rejects(as('admin','select abf_private.lifecycle_command_v1($1,$2)',['accept_closeout',JSON.stringify({project_id:project})]),/permission denied/);
 await db.query("insert into files(id,organization_id,project_id,storage_path,file_name,uploaded_by) values($1,$2,$3,'invoice1.pdf','invoice1.pdf',$4),($5,$2,$3,'invoice2.pdf','invoice2.pdf',$4)",[id(40),org,project,users.contractor,id(41)]);
 const fields={invoice_number:'TEST-1',amount:'250.00',currency:'USD',invoice_date:'2026-10-06',file_id:id(40)};
 await assert.rejects(invoiceCmd('admin','submit',fields),/contractor/);
 await assert.rejects(invoiceCmd('contractor','submit',{...fields,file_id:foreignFile}),/Own project/);
 await assert.rejects(invoiceCmd('contractor','submit',{...fields,amount:'-1'}),/check constraint/);
 invoiceV1=await invoiceCmd('contractor','submit',fields);
 assert.equal((await invoiceCmd('contractor','submit',fields)).id,invoiceV1.id,'response retry reuses same file/version');
 await assert.rejects(invoiceCmd('contractor','review',{version_id:invoiceV1.id,decision:'approved'}),/Coordinator/);
 await assert.rejects(invoiceCmd('coordinator','review',{version_id:invoiceV1.id,decision:'needs_correction'}),/Explain/);
 await assert.rejects(db.exec(await sql('rollback/202610060000_invoice_documents.down.sql')),/Refusing/);
 await db.exec('rollback');
});
test('invoice corrections preserve immutable originals and approve only current document',async()=>{
 await invoiceCmd('coordinator','review',{version_id:invoiceV1.id,decision:'needs_correction',notes:'Correct reference'});
 const fields={invoice_id:invoiceV1.invoice_id,previous_version_id:invoiceV1.id,file_id:id(41),invoice_number:'TEST-1',amount:'250.00',currency:'USD',invoice_date:'2026-10-06',reference_number:'PO-1'};
 await assert.rejects(invoiceCmd('contractor','submit',{...fields,previous_version_id:id(999)}),/changed/);
 invoiceV2=await invoiceCmd('contractor','submit',fields);assert.equal(invoiceV2.version,2);
 await assert.rejects(invoiceCmd('coordinator','review',{version_id:invoiceV1.id,decision:'approved'}),/current/);
 await invoiceCmd('coordinator','review',{version_id:invoiceV2.id,decision:'approved'});
 assert.equal((await as('contractor','select abf_invoice_state($1) state',[project]))[0].state.complete,true);
 for(const table of ['invoice_versions','invoice_reviews']){
  assert.equal((await as('viewer',`select * from ${table}`)).length,2);
  assert.equal((await as('outsider',`select * from ${table}`)).length,0);
  for(const role of ['admin','contractor','viewer','outsider'])await assert.rejects(as(role,`delete from ${table}`),/permission denied/);
  await assert.rejects(db.exec(`update ${table} set project_id=project_id`),/immutable/);
 }
});
test('asset-scoped completeness and independent final acceptance freeze the complete record',async()=>{
 const closeout=async(role,action,payload={})=>(await as(role,'select abf_closeout_command($1,$2) result',[action,JSON.stringify({project_id:project,...payload})]))[0].result;
 const state=async()=>(await as('coordinator','select abf_closeout_state($1) result',[project]))[0].result;
 await assert.rejects(cmd('coordinator','accept_closeout'),/Inspector or admin/);
 await assert.rejects(cmd('admin','accept_closeout'),/As-built/);
 await assert.rejects(cmd('admin','lifecycle_advance',{stage:'accepted_closeout'}),/Invalid/);
 await cmd('coordinator','lifecycle_advance',{stage:'construction'});await cmd('coordinator','lifecycle_advance',{stage:'as_built'});
 const requirement=await closeout('coordinator','requirement_save',{title:'Splice as-built',category:'As-built',required:true});
 const [asset]=await as('admin','select * from project_assets');
 await assert.rejects(cmd('admin','asset_upsert',{identifier:'SP-1',asset_type:'splice',from_asset_id:id(900)}),/From asset/);
 await assert.rejects(cmd('admin','requirement_asset',{id:requirement.id,version:1,asset_id:id(900)}),/Project asset/);
 await cmd('coordinator','requirement_asset',{id:requirement.id,version:1,asset_id:asset.id});
 await db.query("insert into files(id,organization_id,project_id,storage_path,file_name,uploaded_by) values($1,$2,$3,'contractor-v1.pdf','contractor-v1.pdf',$4),($5,$2,$3,'contractor-v2.pdf','contractor-v2.pdf',$4)",[id(30),org,project,users.contractor,id(31)]);
 const evidence=await closeout('contractor','evidence_link',{requirement_id:requirement.id,file_id:id(30)});
 assert.equal((await state()).counts.missing,1,'unlinked evidence does not cover scoped asset');
 await assert.rejects(cmd('admin','asset_link',{asset_id:asset.id,resource_type:'evidence',resource_id:foreignFile}),/Same-project/);
 await cmd('coordinator','asset_link',{asset_id:asset.id,resource_type:'evidence',resource_id:evidence.id});
 assert.equal((await state()).counts.missing,0);
 const firstSubmission=await closeout('contractor','submit',{request_id:id(79)});
 await closeout('coordinator','review',{submission_id:firstSubmission.id,requirement_id:requirement.id,decision:'changes_requested',reason:'Include corrected splice detail'});
 assert.equal((await state()).counts.changes_requested,1);
 const revision=await closeout('contractor','evidence_link',{requirement_id:requirement.id,file_id:id(31),deliverable_id:evidence.deliverable_id});
 assert.equal(revision.version,2);
 assert.equal((await state()).counts.missing,1,'new evidence version needs its own asset association');
 await cmd('coordinator','asset_link',{asset_id:asset.id,resource_type:'evidence',resource_id:revision.id});
 const revisedSubmission=await closeout('contractor','submit',{request_id:id(80)});
 await closeout('coordinator','review',{submission_id:revisedSubmission.id,requirement_id:requirement.id,decision:'accepted'});
 assert.equal((await state()).counts.percent,100);
 assert.equal((await as('contractor','select * from evidence_versions where id=$1',[evidence.id])).length,1);
 assert.equal((await as('contractor','select * from submission_evidence where submission_id=$1 and version_id=$2',[firstSubmission.id,evidence.id])).length,1);
 // A new admin submission exercises the independent final-acceptance guard.
 const submission=await closeout('admin','submit',{request_id:id(81)});
 await closeout('coordinator','review',{submission_id:submission.id,requirement_id:requirement.id,decision:'accepted'});
 await closeout('coordinator','complete_review');
 await as('inspector','select abf_workspace_command($1,$2)', ['project_status',JSON.stringify({project_id:project,status:'inspector_review'})]);
 await assert.rejects(cmd('admin','accept_closeout'),/Independent/);
 const receipt=await cmd('inspector','accept_closeout');
 assert.deepEqual(receipt.snapshot.authorization_versions,[]);assert.ok(Array.isArray(receipt.snapshot.authorization_approval_receipts));
 assert.equal(receipt.snapshot.invoice_versions.length,2);assert.equal(receipt.snapshot.invoice_reviews.length,2);assert.equal(receipt.snapshot.invoice_state.complete,true);
 await assert.rejects(invoiceCmd('coordinator','require',{required:false}),/denied/);
 assert.equal(receipt.snapshot.assets.length,1);assert.equal(receipt.snapshot.construction_packages.length,2);assert.equal(receipt.snapshot.evidence_versions.length,2);assert.equal(receipt.snapshot.closeout.counts.percent,100);
 assert.ok(receipt.snapshot.files.every(f=>f.project_id===project));
 assert.equal((await as('outsider','select * from closeout_packages')).length,0);
 await assert.rejects(cmd('admin','asset_upsert',{identifier:'SP-1',asset_type:'splice'}),/denied/);
 await assert.rejects(closeout('admin','requirement_save',{title:'changed'}),/denied/);
 assert.equal((await as('viewer','select * from closeout_packages')).length,1);
});

test('populated V1 resources remain tenant isolated and immutable to direct writes',async()=>{
 for(const table of ['construction_packages','construction_package_files','project_assets','field_changes','asset_imports','lifecycle_history','asset_links','closeout_packages']){
  const own=await as('viewer',`select * from ${table} where project_id=$1`,[project]);assert.ok(own.length>0,`${table} positive populated control`);
  assert.equal((await as('outsider',`select * from ${table} where project_id=$1`,[project])).length,0);
  for(const role of ['viewer','contractor','outsider'])await assert.rejects(as(role,`update ${table} set project_id=project_id where project_id=$1`,[project]),/permission denied/);
 }
});

test('same-tenant unassigned contractor and inactive member cannot read populated lifecycle records',async()=>{
 users.unassigned=id(90);
 await db.query("insert into contractor_companies(id,organization_id,name) values($1,$2,'Unassigned contractor')",[id(91),org]);
 await db.query('insert into auth.users(id) values($1)',[users.unassigned]);
 await db.query("insert into profiles(id,organization_id,full_name,role,contractor_company_id) values($1,$2,'Unassigned','contractor_user',$3)",[users.unassigned,org,id(91)]);
 await db.query("insert into projects(id,organization_id,project_number,name,created_by,contractor_company_id) values($1,$2,'C','Assigned elsewhere',$3,$4)",[id(92),org,users.admin,id(91)]);
 assert.equal((await as('unassigned','select * from projects where id=$1',[id(92)])).length,1);
 for(const table of ['construction_packages','construction_package_files','project_assets','field_changes','asset_imports','lifecycle_history','asset_links','closeout_packages','invoice_versions','invoice_reviews'])
  assert.equal((await as('unassigned',`select * from ${table} where project_id=$1`,[project])).length,0,table);
 await db.query('update profiles set active=false where id=$1',[users.viewer]);
 for(const table of ['construction_packages','project_assets','closeout_packages','lifecycle_history','invoice_versions','invoice_reviews'])assert.equal((await as('viewer',`select * from ${table}`)).length,0);
});
