const eventLabels = {
  project_created: 'Project Created', project_updated: 'Project Updated', project_status: 'Project Status Changed',
  project_status_changed: 'Project Status Changed', lifecycle_advance: 'Lifecycle Advanced', lifecycle_advanced: 'Lifecycle Advanced',
  asset_upsert: 'Asset Updated', asset_created: 'Asset Created', issue_create: 'Issue Created', issue_created: 'Issue Created',
  issue_updated: 'Issue Updated', issue_comment: 'Issue Comment Added', issue_status: 'Issue Status Changed',
  submit: 'Submitted for Review', submitted: 'Submitted for Review', evidence_link: 'Evidence Linked',
  files_uploaded: 'Files Uploaded', revision_uploaded: 'Revision Uploaded', package_released: 'Construction Package Released',
  invoice_submitted: 'Invoice Submitted', invoice_reviewed: 'Invoice Reviewed', authorization_updated: 'Authorization Updated',
  user_invited: 'User Invited', user_updated: 'User Access Updated',
  requirement_save: 'Closeout Requirement Updated', complete_review: 'Ready for Inspector Review',
  package_create: 'Construction Revision Created', package_attach: 'Package Document Added', package_release: 'Construction Package Released',
  field_change_create: 'Field Change Reported', field_change_resolve: 'Field Change Resolved', asset_import: 'Assets Imported',
  asset_import_row: 'Asset Added', asset_link: 'Asset Relationship Updated', closeout_freeze: 'Closeout Accepted and Frozen',
  invoice_require: 'Invoice Requirement Updated', invoice_submit: 'Invoice Submitted', invoice_review: 'Invoice Reviewed',
  authorization_configure: 'Invoice Authorization Requirements Updated', authorization_revise: 'Authorization Revised',
  project_assignments_updated: 'Project Assignments Updated',
};

export function activityEventLabel(eventType) {
  const key = String(eventType || '').trim();
  return eventLabels[key] || 'Project Activity Recorded';
}

export function resolveNotificationTarget(notification, projects = []) {
  const body=String(notification?.body||'').trim();
  const issueNumber=String(notification?.title||'').match(/issue\s*#?(\d+)/i)?.[1];
  if(issueNumber){const matches=projects.flatMap(project=>(project.issues||[]).filter(issue=>String(issue.issue_number)===issueNumber&&(!body||body.includes(issue.title))).map(issue=>({kind:'issue',project,issue})));return matches.length===1?matches[0]:null}
  const statusMatch=body.match(/^(.+?) is now (.+)$/i);
  if(statusMatch){const matches=projects.filter(project=>project.name===statusMatch[1]);return matches.length===1?{kind:'project',project:matches[0]}:null}
  const projectId=notification?.project_id;
  const matches=projects.filter(project=>project.id===projectId);
  return matches.length===1?{kind:'project',project:matches[0]}:null;
}

export function notificationDescription(notification, target) {
  const body = String(notification?.body || notification?.description || '').replaceAll('_', ' ').trim();
  if (target?.kind === 'project' && body.includes(' is now ')) {
    const status=body.slice(body.lastIndexOf(' is now ')+8).trim().replace(/\b\w/g,c=>c.toUpperCase());
    return `Project status changed to ${status}.`;
  }
  if (body) return body;
  if (target?.issue) return `Update on issue #${target.issue.issue_number}: ${target.issue.title}.`;
  if (target?.project?.name) return `There is an update for ${target.project.name}.`;
  return 'There is an update in your workspace.';
}

export function formatActivityTime(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}
