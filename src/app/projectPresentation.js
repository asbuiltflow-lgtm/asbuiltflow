const lifecycleLabels={setup:'Setup',initial_package:'Initial Package',walkout:'Walkout / Revisions',released:'Released for Construction',construction:'Construction',as_built:'As-Built / Closeout',accepted_closeout:'Accepted Closeout'};
export function lifecycleLabel(value){const key=String(value||'setup');return lifecycleLabels[key]||key.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
export function closeoutStatus(project){
 if(['approved','closed'].includes(project?.status)||project?.lifecycle_stage==='accepted_closeout')return 'Accepted Closeout';
 const counts=project?.closeout?.counts;
 if(!counts||counts.required===0)return 'Not Configured';
 if((counts.changes_requested||0)>0||project.status==='needs_rework')return 'Needs Revision';
 if((counts.pending||0)>0||['submitted','coordinator_review','ready_for_inspection','inspector_review','revision_submitted'].includes(project?.status))return 'Awaiting Review';
 if((counts.missing||0)>0)return 'Evidence Needed';
 if(counts.accepted===counts.required)return 'Ready for Final Acceptance';
 return 'In Progress';
}
export function projectStatuses(project){return {lifecycle:lifecycleLabel(project?.lifecycle_stage),closeout:closeoutStatus(project)}}
