import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activityEventLabel } from '../src/app/activityLabels.js';

test('activity event keys have concise customer-facing labels', () => {
  const examples = {
    lifecycle_advance: 'Lifecycle Advanced',
    project_assignments_updated: 'Project Assignments Updated',
    asset_upsert: 'Asset Updated',
    issue_create: 'Issue Created',
    project_status: 'Project Status Changed',
    submit: 'Submitted for Review',
    evidence_link: 'Evidence Linked',
  };
  for (const [eventType, label] of Object.entries(examples)) {
    assert.equal(activityEventLabel(eventType), label);
  }
});

test('unknown activity keys never leak their raw internal value', () => {
  assert.equal(activityEventLabel('unexpected_internal_action'), 'Project Activity Recorded');
  assert.equal(activityEventLabel(null), 'Project Activity Recorded');
});
