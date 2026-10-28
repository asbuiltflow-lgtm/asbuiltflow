import test from 'node:test';
import assert from 'node:assert/strict';
import { closeoutStatus, lifecycleLabel, projectStatuses } from '../src/app/projectPresentation.js';

test('lifecycle values are presented in customer-facing title case',()=>{
 assert.equal(lifecycleLabel('initial_package'),'Initial Package');
 assert.equal(lifecycleLabel('walkout'),'Walkout / Revisions');
 assert.equal(lifecycleLabel('as_built'),'As-Built / Closeout');
});
test('lifecycle and closeout are derived independently',()=>{
 assert.deepEqual(projectStatuses({lifecycle_stage:'construction',status:'submitted',closeout:{counts:{required:2,accepted:0,pending:2,missing:0,changes_requested:0}}}),{lifecycle:'In Construction',closeout:'Awaiting Review'});
 assert.equal(closeoutStatus({status:'needs_rework',closeout:{counts:{required:2,accepted:1,pending:0,missing:0,changes_requested:1}}}),'Needs Revision');
 assert.equal(closeoutStatus({status:'approved',closeout:{counts:{required:2,accepted:2}}}),'Accepted Closeout');
});
