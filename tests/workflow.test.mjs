import {test} from 'node:test';
import assert from 'node:assert/strict';
import {projectTransitions,issueTransitions,completionText,isProjectWritable} from '../src/app/workflow.js';
test('UI never offers final approval or bare contractor submission',()=>{
 for(const role of ['admin','project_manager','coordinator','inspector','contractor_admin','contractor_user','viewer']){
  for(const status of ['draft','submitted','coordinator_review','needs_rework','approved','closed']){
   const actions=projectTransitions(role,status);
   assert.ok(!actions.includes('Approved'));assert.ok(!actions.includes('Closed'));assert.ok(!actions.includes('Submitted'));
  }
 }
});
test('viewer and contractor issue choices mirror server workflow boundaries',()=>{
 assert.deepEqual(issueTransitions('viewer','ready_for_review'),[]);
 assert.deepEqual(issueTransitions('contractor_user','ready_for_review'),[]);
 assert.deepEqual(issueTransitions('inspector','ready_for_review'),['Resolved','Open']);
});
test('completion never reuses stage percentage; historical closed projects are read-only',()=>{
 assert.equal(completionText({progress:100}),'Not configured');
 assert.equal(completionText({progress:100,closeout:{counts:{percent:25}}}),'25%');
 assert.equal(isProjectWritable({status:'approved'}),false);
});
