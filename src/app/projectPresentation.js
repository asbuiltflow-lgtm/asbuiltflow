export const humanize=value=>String(value||'Not recorded').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const titleCaseStatus=value=>String(value||'Not recorded').replaceAll('_',' ').replace(/\b[a-z]/g,c=>c.toUpperCase());
export const lifecycleLabel=value=>({initial_package:'Initial Package',walkout:'Walkout / Revisions',released:'Released for Construction',construction:'In Construction',as_built:'As-Built / Closeout',accepted_closeout:'Accepted Closeout'}[value]||'Initial Package');
export const projectLifecycleStatus=project=>lifecycleLabel(project.lifecycle_stage);
const PROJECT_STATUS_LABELS={draft:'Draft',submitted:'Submitted',coordinator_review:'Coordinator Review',ready_for_inspection:'Ready for Inspection',inspector_review:'Inspector Review',needs_rework:'Needs Rework',revision_submitted:'Revision Submitted',approved:'Approved',closed:'Closed',initial_package:'Initial Package',walkout:'Walkout / Revisions',released:'Released for Construction',construction:'In Construction',as_built:'As-Built / Closeout',accepted_closeout:'Accepted Closeout'};
export const projectStatusLabel=value=>PROJECT_STATUS_LABELS[value]||titleCaseStatus(value);
export const evidenceLabel=value=>({missing:'Missing',pending_submission:'Uploaded — submit for review',pending_review:'Submitted — pending review',accepted:'Accepted',changes_requested:'Needs correction'}[value]||humanize(value));
export const personLabel=(people,id,self)=>id===self?'You':people.find(p=>p.id===id)?.full_name||'Project team member';

const requiredItems=project=>(project.closeout?.requirements||[]).filter(item=>item.required);
export function closeoutStatus(project){
 if(project.closeout?.receipt||project.closeout?.accepted_at||project.lifecycle_stage==='accepted_closeout'||project.status==='approved')return 'Accepted Closeout';
 if(project.status==='closed')return 'Closed';
 const items=requiredItems(project);
 if(items.some(item=>item.state==='changes_requested'))return 'Needs Revision';
 if(items.some(item=>item.state==='pending_review'))return 'Awaiting Review';
 if(items.some(item=>['missing','pending_submission'].includes(item.state)))return 'Contractor Action Required';
 const counts=project.closeout?.counts;
 if((counts?.changes_requested||0)>0)return 'Needs Revision';
 if((counts?.pending||0)>0)return 'Awaiting Review';
 if((counts?.missing||0)>0)return 'Contractor Action Required';
 const status=project.status;
 return ({submitted:'Awaiting Review',coordinator_review:'Coordinator Review',ready_for_inspection:'Ready for Inspection',inspector_review:'Inspector Review',approved:'Accepted',closed:'Closed',draft:'In Progress',revision_submitted:'Awaiting Review',needs_rework:'Closeout In Progress'})[status]||titleCaseStatus(status);
}
export const projectCloseoutStatus=project=>closeoutStatus(project);
export const projectStatuses=project=>({lifecycle:projectLifecycleStatus(project),closeout:projectCloseoutStatus(project)});

export function nextProjectAction(project,data={}){
 if(data.closeouts?.length)return null;
 const items=requiredItems(project);
 if(items.some(item=>item.state==='changes_requested'))return {message:'Correct the requested items and submit the updated evidence for review.',role:'Contractor'};
 if(items.some(item=>item.state==='pending_review'))return {message:'An independent reviewer must review the submitted evidence.',role:'Coordinator / Admin (not the submitter)'};
 if(items.some(item=>['missing','pending_submission'].includes(item.state)))return {message:'Upload any missing or updated evidence, then submit it for review.',role:'Contractor'};
 if(!(data.packages||[]).some(item=>item.status==='released'))return {message:'Release a construction package revision so the crew knows which documents to build from.',role:'Admin / Coordinator'};
 if(!project.closeout?.counts?.required)return {message:'Configure the required closeout deliverables for this project.',role:'Admin / Coordinator'};
 if(data.invoiceState?.authorization_blockers?.length)return {message:'Resolve the NTP / PO authorization blockers before approving the invoice.',role:'Admin / Coordinator'};
 if(data.invoiceState?.required&&!data.invoiceState.complete)return {message:'Review and approve the required invoice document before final acceptance.',role:'Coordinator / Admin'};
 const open=(project.issues||[]).filter(issue=>!['resolved','closed'].includes(issue.status));
 if(open.length)return {message:'Resolve the open punch-list items before final acceptance.',role:'Assigned owner / Coordinator'};
 if(project.status==='coordinator_review')return {message:'Complete the coordinator review and hand the project to inspection.',role:'Coordinator / Admin'};
 if(['ready_for_inspection','inspector_review'].includes(project.status))return {message:'Complete the independent field inspection and record final acceptance.',role:'Inspector / Admin'};
 if(project.lifecycle_stage!=='as_built'&&project.lifecycle_stage!=='accepted_closeout')return {message:'Continue construction, then advance the job to As-built / closeout when field work is complete.',role:'Admin / Coordinator'};
 return {message:'Review remaining project blockers and complete the next closeout step.',role:'Coordinator / Inspector'};
}

export function setupChecklist(project,data,people=[]){
 const packages=data.packages||[], released=packages.some(item=>item.status==='released');
 const hasPackageFile=packages.some(item=>(data.attachments||[]).some(file=>file.package_id===item.id));
 const companyId=project.contractor_company_id||project.contractor_company?.id;
 const assignedContractor=Boolean(companyId&&people.some(person=>person.active!==false&&['contractor_admin','contractor_user'].includes(person.role)&&person.contractor_company_id===companyId));
 const authorization=data.authorizations?.state||{};
 const ntpOk=!authorization.ntp_required||authorization.current?.ntp?.status==='current';
 const poOk=!authorization.po_required||authorization.current?.po?.status==='current';
 const invoiceConfigured=typeof data.invoiceState?.required==='boolean';
 const authConfigured=ntpOk&&poOk&&invoiceConfigured;
 return [
  {label:'Assign a contractor company',done:Boolean(companyId),hint:companyId?'':'Set during project creation.'},
  {label:'Upload the initial construction package',done:hasPackageFile,href:'#construction-package'},
  {label:'Release the current package revision',done:released,href:'#construction-package'},
  {label:'Configure required closeout deliverables',done:Boolean(project.closeout?.counts?.required),href:'#required-deliverables'},
  {label:'Configure NTP / PO and invoice requirements if applicable',done:authConfigured,href:'#authorizations',optional:!authorization.ntp_required&&!authorization.po_required},
  {label:'Invite the assigned contractor',done:assignedContractor,invite:true},
 ];
}

const item=(group,message,href)=>({group,message,href});
export function groupedCloseoutBlockers(project,data={}){
 const result={Construction:[], 'Closeout Review':[], 'Commercial / Invoice':[], 'Final Acceptance':[]};
 const counts=project.closeout?.counts||{};
 if(!counts.required)result['Closeout Review'].push(item('Closeout Review','Configure at least one required deliverable.','#required-deliverables'));
 for(const requirement of requiredItems(project))if(requirement.state!=='accepted'){
  const title=requirement.title||'Required deliverable';
  const messages={
   missing:`${title}: Add the required evidence file(s).`,
   pending_submission:`${title}: Upload the latest file and submit it for review.`,
   pending_review:`${title}: An independent Coordinator / Admin review is still needed.`,
   changes_requested:`${title}: The contractor must correct and resubmit this item${requirement.decision_reason?` — ${requirement.decision_reason}`:''}.`,
  };
  result['Closeout Review'].push(item('Closeout Review',messages[requirement.state]||`${title}: ${evidenceLabel(requirement.state)}.`, '#required-deliverables'));
 }
 const changes=(data.changes||[]).filter(change=>!['resolved','accepted'].includes(change.status));
 if(changes.length)result.Construction.push(item('Construction',`Resolve ${changes.length} open field change${changes.length===1?'':'s'} and record the resulting package revision.`,'#construction-package'));
 if(!(data.packages||[]).some(pkg=>pkg.status==='released'))result.Construction.push(item('Construction','Release a construction package revision before directing field work.','#construction-package'));
 const missing=(data.assets||[]).filter(asset=>asset.status!=='retired'&&!asset.actual_description?.trim());
 if(missing.length)result.Construction.push(item('Construction',`Add as-built location details for ${missing.length} asset${missing.length===1?'':'s'}.`,'#construction-package'));
 if(project.lifecycle_stage!=='as_built'&&project.lifecycle_stage!=='accepted_closeout')result.Construction.push(item('Construction','Advance the lifecycle to As-built / closeout after construction is complete.','#construction-package'));
 const open=(project.issues||[]).filter(issue=>!['resolved','closed'].includes(issue.status));
 if(open.length)result['Final Acceptance'].push(item('Final Acceptance',`Resolve ${open.length} open punch-list item${open.length===1?'':'s'} before final acceptance.`,'#project-issues'));
 const invoice=data.invoiceState;
 if(invoice?.required&&!invoice.complete)result['Commercial / Invoice'].push(item('Commercial / Invoice','Required invoice documents must be approved before final acceptance.','#invoice-documents'));
 for(const reason of new Set(invoice?.authorization_blockers||[])){
  const text=String(reason).replace(/^Invoice approval blocked\s*[—-]\s*/i,'');
  result['Commercial / Invoice'].push(item('Commercial / Invoice',`Invoice approval is blocked — ${text}`,'#authorizations'));
 }
 const allRequiredAccepted=counts.required>0&&counts.accepted===counts.required;
 if(!data.closeouts?.length&&allRequiredAccepted&&!open.length&&!(invoice?.required&&!invoice.complete)&&project.status!=='inspector_review')result['Final Acceptance'].push(item('Final Acceptance','The required evidence is accepted. An Inspector / authorized Admin must complete final inspection and acceptance.','#required-deliverables'));
 return Object.entries(result).map(([group,items])=>({group,items})).filter(section=>section.items.length);
}

// Kept as a flat presentation helper for existing callers/tests; UI uses groupedCloseoutBlockers.
export function closeoutBlockers(project,data){return groupedCloseoutBlockers(project,data).flatMap(section=>section.items.map(blocker=>blocker.message));}
