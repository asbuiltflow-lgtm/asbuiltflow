import {test} from 'node:test';
import assert from 'node:assert/strict';
import {actionTypeLabel,buildActionQueue} from '../src/app/actionQueue.js';

const profile=role=>({role});
const project=(overrides={})=>({id:'p1',project_number:'JOB-1',name:'Fiber build',status:'submitted',lifecycle_stage:'construction',issues:[],closeout:{requirements:[],counts:{required:0,accepted:0}},invoiceState:{required:false,complete:true,authorization_blockers:[]},...overrides});

test('PM action queue derives review, correction, missing evidence, invoice blockers and issues',()=>{
 const p=project({
  closeout:{requirements:[{id:'r1',title:'Splice test',state:'pending_review',required:true},{id:'r2',title:'Bore photos',state:'changes_requested',required:true},{id:'r3',title:'Redline',state:'missing',required:true}],counts:{required:3,accepted:0}},
  invoiceState:{required:true,complete:false,authorization_blockers:['NTP revision required']},
  issues:[{id:'i1',title:'Restoration settlement',status:'open',priority:'high',due_date:'2020-01-01'}],
 });
 const tasks=buildActionQueue([p],profile('coordinator'),new Date('2026-10-20T12:00:00Z'));
 assert.deepEqual(new Set(tasks.map(t=>t.type)),new Set(['awaiting_review','needs_revision','missing_evidence','invoice_blocked','issue']));
 assert.equal(tasks.find(t=>t.type==='invoice_blocked').detail,'NTP revision required');
 assert.equal(tasks.find(t=>t.type==='issue').overdue,true);
 assert.equal(actionTypeLabel('missing_evidence'),'Missing Required Evidence');
});

test('queue respects role handoffs and exposes inspector/final acceptance only to responsible roles',()=>{
 const ready=project({status:'ready_for_inspection',lifecycle_stage:'as_built'});
 assert.ok(buildActionQueue([ready],profile('coordinator')).some(t=>t.type==='inspector_review'));
 const final=project({status:'inspector_review',lifecycle_stage:'as_built',closeout:{requirements:[{id:'r1',state:'accepted',required:true}],counts:{required:1,accepted:1}}});
 assert.ok(buildActionQueue([final],profile('inspector')).some(t=>t.type==='final_acceptance'));
 assert.equal(buildActionQueue([ready],profile('contractor_user')).some(t=>t.type==='inspector_review'),false);
 const waiting=project({closeout:{requirements:[{id:'r1',title:'Splice test',state:'pending_review',required:true}],counts:{required:1,accepted:0}}});
 assert.equal(buildActionQueue([waiting],profile('contractor_user')).some(t=>t.type==='awaiting_review'),false);
});
