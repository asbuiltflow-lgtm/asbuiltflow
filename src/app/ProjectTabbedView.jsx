import { useState } from 'react';
import CloseoutRequirements from './CloseoutRequirements';
import LifecyclePanel from './LifecyclePanel';
import ProjectAssignmentsPanel from './ProjectAssignmentsPanel';
import ProjectReferenceDocuments from './ProjectReferenceDocuments';
import { activityEventLabel } from './notificationPresentation';
import { closeoutStatus, lifecycleLabel, personLabel, projectStatusLabel } from './projectPresentation';
import { canCoordinate, canCreateIssue, isProjectWritable, projectTransitions } from './workflow';
import { issueStatusLabel } from '../services/workspace';

const STEPS=['Draft','Submitted','Coordinator Review','Ready for Inspection','Inspector Review','Needs Revision','Revision Submitted','Approved','Closed'];
const fmtDate=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric'}).format(new Date(`${value}T12:00:00`)):'—';
const fmtTime=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(value)):'—';

export default function ProjectTabbedView({project,profile,profiles=[],contractors=[],onRefresh,onSaveAssignments,onInvite,onBack,onStatus,onIssue,onCreateIssue,onUpload,onRevision,onChecklist,onFile}){
 const tabs=[['overview','Overview'],['documents','Documents'],['field-work','Field Work'],['closeout','Closeout'],['commercial','Commercial'],['issues','Issues'],['activity','Activity']];
 const available=new Set(tabs.map(([id])=>id));
 const [activeTab,setActiveTab]=useState(()=>{const prefix=`#project-${project.id}-`;const requested=window.location.hash.startsWith(prefix)?window.location.hash.slice(prefix.length):'';return available.has(requested)?requested:'overview'});
 const writable=isProjectWritable(project),transitions=writable?projectTransitions(profile.role,project.status):[];
 const closeout=closeoutStatus(project);
 const statusLabel=project.status==='needs_rework'?({ 'Needs Revision':'Needs Revision','Awaiting Review':'Coordinator Review','Contractor Action Required':'Revision Submitted'}[closeout]||'Coordinator Review'):projectStatusLabel(project.status);
 const currentIndex=STEPS.indexOf(statusLabel==='Needs Revision'?'Needs Revision':statusLabel);
 const openIssues=(project.issues||[]).filter(issue=>!['resolved','closed'].includes(issue.status));
 const fieldPhotos=(project.files||[]).filter(file=>file.category==='Field Photo');
 function selectTab(id){setActiveTab(id);window.history.replaceState(null,'',`${window.location.pathname}${window.location.search}#project-${project.id}-${id}`)}
 function keyDown(event){if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;event.preventDefault();const current=tabs.findIndex(([id])=>id===activeTab);const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(current+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;selectTab(tabs[next][0]);document.getElementById(`project-tab-${tabs[next][0]}`)?.focus()}
 const actionFor=step=>step==='Needs Revision'?'Needs Rework':step;
 return <>
  <button className="rwBack" onClick={onBack}>← Back to projects</button>
  <header className="rwPageHeader"><div><span>{project.project_number}</span><h1>{project.name}</h1><p>{project.description||'No project description.'}</p></div></header>
  <nav className="rwProjectTabs" role="tablist" aria-label={`${project.name} sections`} onKeyDown={keyDown}>{tabs.map(([id,label])=><button key={id} type="button" role="tab" id={`project-tab-${id}`} aria-selected={activeTab===id} aria-controls={`project-panel-${id}`} tabIndex={activeTab===id?0:-1} className={activeTab===id?'active':''} onClick={()=>selectTab(id)}>{label}</button>)}</nav>
  <section className="rwProjectTabPanel" role="tabpanel" id={`project-panel-${activeTab}`} aria-labelledby={`project-tab-${activeTab}`}>
   {activeTab==='overview'&&<>
    <section className="rwWorkflow"><header><span>PROJECT STATUS</span><div className="rwWorkflowStatuses"><span><small>Lifecycle</small><strong>{lifecycleLabel(project.lifecycle_stage)}</strong></span><span><small>Closeout</small><strong>{closeoutStatus(project)}</strong></span></div></header><div>{STEPS.map((step,index)=>{const action=actionFor(step),enabled=transitions.includes(action)&&action!==project.status;return <button key={step} disabled={!enabled} onClick={()=>enabled&&onStatus(action)} className={`${index<currentIndex?'done':''} ${index===currentIndex?'current':''}`}><b>{index<currentIndex?'✓':index+1}</b><span>{step}</span></button>})}</div></section>
    <section className="rwProjectTeam"><div><span>Assigned contractor</span><strong>{project.contractor_company?.name||'Unassigned'}</strong></div><div><span>Coordinator</span><strong>{project.coordinator?.full_name||'Unassigned'}</strong></div><div><span>Inspector</span><strong>{project.inspector?.full_name||'Unassigned'}</strong></div><div><span>Due date</span><strong>{fmtDate(project.due_date)}</strong></div></section>
    {canCoordinate(profile.role)&&<ProjectAssignmentsPanel project={project} profiles={profiles} contractors={contractors} onSave={onSaveAssignments}/>}
    <LifecyclePanel view="overview" project={project} profile={profile} people={profiles} onRefresh={onRefresh} onFile={onFile} onInvite={onInvite}/>
   </>}
   {activeTab==='documents'&&<>
    {['contractor_admin','contractor_user'].includes(profile.role)&&<p className="rwFieldCrewHint">Start here for the current construction package, maps, workbooks, and other references used to perform this project.</p>}
    <ProjectReferenceDocuments project={project} canUpload={canCoordinate(profile.role)} onUpload={onUpload} onFile={onFile}/>
    <LifecyclePanel view="documents" project={project} profile={profile} people={profiles} onRefresh={onRefresh} onFile={onFile}/>
    <Panel title="Supplemental document revisions"><div className="rwActions"><label><input type="file" accept="application/pdf" disabled={!writable||profile.role==='viewer'} hidden onChange={event=>onRevision(event.target.files?.[0])}/><b>R+</b><span><strong>Upload supplemental document revision</strong><small>Preserves earlier uploaded file versions</small></span></label></div><p className="rwNote">For construction changes, use Add package revision above. This separate upload preserves a supplemental project-file version.</p></Panel>
   </>}
   {activeTab==='field-work'&&<>
    {['contractor_admin','contractor_user'].includes(profile.role)&&<aside className="rwFieldCrewHint"><div><strong>Your assigned work</strong><p>Access project work assigned to {project.contractor_company?.name||'your contractor company'}. Use Documents for the current package and shared references.</p></div><span>{project.closeout?.counts?.accepted||0} / {project.closeout?.counts?.required||0} required items accepted</span><button className="rwSecondary" onClick={()=>selectTab('closeout')}>View required closeout work</button></aside>}
    <Panel title="Field completion photos"><p className="rwNote">These are progress/reference photos. For reviewable closeout proof, upload them against the matching requirement in Closeout.</p>{writable&&profile.role!=='viewer'&&<label className="rwFieldPhotoUpload">Take or upload photos<input type="file" accept="image/*" capture="environment" multiple onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';if(files.length)onUpload(files,'Field Photo')}}/></label>}{fieldPhotos.length?<div className="rwReferenceList">{fieldPhotos.map(file=><article key={file.id}><span className="rwReferenceFile"><strong>{file.file_name}</strong><small>{fmtTime(file.created_at)}</small></span><button type="button" className="rwLink" onClick={()=>onFile(file)}>Open</button></article>)}</div>:<Empty text="No field completion photos have been added yet."/>}</Panel>
    <LifecyclePanel view="field-work" project={project} profile={profile} people={profiles} onRefresh={onRefresh} onFile={onFile}/>
   </>}
   {activeTab==='closeout'&&<>
    <div className="rwActions"><label><input type="file" accept="application/pdf" disabled={!writable||profile.role==='viewer'} hidden onChange={event=>onUpload(event.target.files,'As-Built PDF')}/><b>PDF</b><span><strong>Add as-built file</strong><small>For tracked review, upload under the matching required deliverable below.</small></span></label><button disabled={!writable||!canCreateIssue(profile.role)} onClick={onCreateIssue}><b>+</b><span><strong>Create punch-list issue</strong><small>Record a correction tied to this project</small></span></button></div>
    <CloseoutRequirements key={`${project.id}-closeout`} view="closeout" project={project} profile={profile} onRefresh={onRefresh} onFile={onFile} onInvite={onInvite}/>
   </>}
   {activeTab==='commercial'&&<CloseoutRequirements key={`${project.id}-commercial`} view="commercial" project={project} profile={profile} people={profiles} onRefresh={onRefresh} onFile={onFile}/>}
   {activeTab==='issues'&&<>
    <div className="rwActions"><button disabled={!writable||!canCreateIssue(profile.role)} onClick={onCreateIssue}><b>+</b><span><strong>Create issue</strong><small>Assign and track a correction</small></span></button></div>
    <Panel title={`Punch list · ${openIssues.length} open`}><div id="project-issues" className="rwCards">{(project.issues||[]).map(issue=><button className="rwIssueRow" key={issue.id} onClick={()=>onIssue(issue.id)}><span><strong>#{issue.issue_number} {issue.title}</strong><small>{issue.sheet||'No sheet'} · {issue.priority}</small></span><i className={`rwStatus ${issue.status}`}>{issueStatusLabel(issue.status)}</i></button>)}{!project.issues?.length&&<Empty text="No punch-list items yet."/>}</div></Panel>
    <details className="coHistory"><summary>Legacy checklist (historical; excluded from completion) · {(project.project_checklist_items||[]).length}</summary><div className="rwChecklist">{(project.project_checklist_items||[]).sort((a,b)=>a.sort_order-b.sort_order).map(item=><label key={item.id}><input type="checkbox" disabled={!writable||!canCoordinate(profile.role)} checked={Boolean(item.completed_at)} onChange={()=>onChecklist(item)}/><span><strong>{item.label}</strong><small>{item.completed_at?`Completed ${fmtTime(item.completed_at)}`:'Legacy manual checklist item'}</small></span></label>)}</div></details>
   </>}
   {activeTab==='activity'&&<Panel title="Project activity"><div className="rwTimeline">{(project.activity_events||[]).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(event=><div key={event.id}><i>✓</i><span><strong>{activityEventLabel(event.event_type)}</strong><small>{personLabel(profiles,event.actor_id,profile.id)} · {project.name} · {fmtTime(event.created_at)}</small></span></div>)}{!project.activity_events?.length&&<Empty text="No activity has been recorded yet."/>}</div></Panel>}
  </section>
 </>;
}

function Panel({title,children}){return <section className="rwPanel"><header><h2>{title}</h2></header>{children}</section>}
function Empty({text}){return <div className="rwEmpty"><b>○</b><span>{text}</span></div>}
