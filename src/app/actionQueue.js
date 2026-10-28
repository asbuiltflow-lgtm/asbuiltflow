const INTERNAL=new Set(['admin','project_manager','coordinator','inspector']);
const INSPECTOR=new Set(['admin','inspector']);
const OPEN_ISSUES=new Set(['resolved','closed']);

export const ACTION_FILTERS=[
 ['all','All attention'],['awaiting_review','Awaiting Review'],['needs_revision','Needs Revision'],
 ['missing_evidence','Missing Required Evidence'],['invoice_blocked','Invoice Blocked'],
 ['issue','Open / Overdue Issue'],['inspector_review','Ready for Inspector Review'],['final_acceptance','Ready for Final Acceptance'],
];

export function buildActionQueue(projects,profile,now=new Date()){
 const tasks=[];
 for(const project of projects){
  const requirements=project.closeout?.requirements||[];
  if(INTERNAL.has(profile.role))for(const requirement of requirements){
   if(requirement.state==='pending_review')tasks.push({key:`review:${project.id}:${requirement.id}`,type:'awaiting_review',title:requirement.title,detail:'Evidence is waiting for an independent review.',project,tab:'closeout'});
  }
  for(const requirement of requirements){
   if(requirement.required===false)continue;
   if(requirement.state==='changes_requested')tasks.push({key:`revision:${project.id}:${requirement.id}`,type:'needs_revision',title:requirement.title,detail:'Corrected evidence is needed before closeout can progress.',project,tab:'closeout'});
   else if(requirement.state==='missing')tasks.push({key:`missing:${project.id}:${requirement.id}`,type:'missing_evidence',title:requirement.title,detail:'Required evidence has not been submitted.',project,tab:'closeout'});
  }
  const invoice=project.invoiceState;
  if(INTERNAL.has(profile.role)&&invoice&&(invoice.authorization_blockers?.length||invoice.required&&!invoice.complete)){
   const blocker=invoice.authorization_blockers?.[0];
   tasks.push({key:`invoice:${project.id}`,type:'invoice_blocked',title:project.name,detail:blocker||'Required invoice documents are not approved.',project,tab:'commercial'});
  }
  for(const issue of project.issues||[]){
   if(OPEN_ISSUES.has(issue.status))continue;
   const overdue=issue.due_date&&new Date(`${issue.due_date}T23:59:59`)<now;
   tasks.push({key:`issue:${issue.id}`,type:'issue',title:issue.title,detail:`${overdue?'Overdue · ':''}${issue.priority} priority · ${issue.status.replaceAll('_',' ')}`,project,issue,tab:'issues',overdue:Boolean(overdue)});
  }
  if(INTERNAL.has(profile.role)&&project.status==='ready_for_inspection')tasks.push({key:`inspection:${project.id}`,type:'inspector_review',title:project.name,detail:'Coordinator review is complete; inspection handoff is ready.',project,tab:'closeout'});
  const count=project.closeout?.counts||{};
  if(INSPECTOR.has(profile.role)&&project.lifecycle_stage==='as_built'&&project.status==='inspector_review'&&count.required>0&&count.accepted===count.required&&!(project.issues||[]).some(i=>!OPEN_ISSUES.has(i.status))&&(!invoice?.required||invoice.complete)){
   tasks.push({key:`final:${project.id}`,type:'final_acceptance',title:project.name,detail:'Required closeout is accepted and no open issues remain.',project,tab:'overview'});
  }
 }
 return tasks;
}

export function actionTypeLabel(type){return ACTION_FILTERS.find(([key])=>key===type)?.[1]||'Project attention';}
