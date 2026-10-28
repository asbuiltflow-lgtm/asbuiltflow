import test from 'node:test';
import assert from 'node:assert/strict';
import { activityEventLabel, formatActivityTime, notificationDescription, resolveNotificationTarget } from '../src/app/notificationPresentation.js';

test('activity event names are presented as readable customer labels', () => {
  assert.equal(activityEventLabel('lifecycle_advance'), 'Lifecycle Advanced');
  assert.equal(activityEventLabel('asset_upsert'), 'Asset Updated');
  assert.equal(activityEventLabel('issue_create'), 'Issue Created');
  assert.equal(activityEventLabel('submit'), 'Submitted for Review');
  assert.equal(activityEventLabel('evidence_link'), 'Evidence Linked');
  assert.equal(activityEventLabel('unknown_database_operation'), 'Project Activity Recorded');
});

test('notification descriptions use available context without exposing missing ids', () => {
  assert.equal(notificationDescription({ body: 'Review is needed' }), 'Review is needed');
  assert.equal(notificationDescription({}, { kind: 'project', project: { name: 'North Ridge' } }), 'There is an update for North Ridge.');
  assert.equal(notificationDescription({}), 'There is an update in your workspace.');
});

test('notification targets are resolved only when a project or issue is unambiguous',()=>{
  const project={id:'p1',name:'North Ridge',issues:[{id:'i1',issue_number:4,title:'Missing handhole photo'}]};
  assert.equal(resolveNotificationTarget({body:'North Ridge is now in_construction'},[project]).project,project);
  assert.equal(resolveNotificationTarget({title:'Issue #4',body:'Missing handhole photo'},[project]).issue.id,'i1');
  assert.equal(resolveNotificationTarget({title:'Unknown',body:'details'},[project]),null);
});

test('activity timestamps include the year and remain safe for invalid values', () => {
  assert.match(formatActivityTime('2026-10-28T16:00:00Z'), /2026/);
  assert.equal(formatActivityTime('invalid'), 'Time unavailable');
});
