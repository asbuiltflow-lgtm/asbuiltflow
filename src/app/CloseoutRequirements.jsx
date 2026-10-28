import { useEffect, useRef, useState } from 'react';
import { closeoutCommand, getEvidence, getProfiles, linkSlotEvidence, pendingUploads, retryUploadRegistration, saveRequirementWithSlots, submitCloseout, uploadProjectFiles } from '../services/workspace';
import {personLabel,evidenceLabel} from './projectPresentation';
import LifecyclePanel from './LifecyclePanel';
import InvoiceDocuments from './InvoiceDocuments';
import AuthorizationDocuments from './AuthorizationDocuments';
import { canCoordinate, canEditEvidence, isProjectWritable } from './workflow';
import './CloseoutRequirements.css';

const CATEGORIES=['As-built drawings','Construction photos','Fiber / cable / footage','Handholes / vaults / pedestals','Conduit / duct','Aerial / poles','Splice documentation','OTDR results','Power-meter / test results','Bore / road-crossing documentation','Equipment documentation','GPS / asset locations','Materials / reconciliation','Permits / inspections','Restoration','Custom requirement'];
const STATES={missing:'Missing',pending_submission:'Uploaded — submit for review',pending_review:'Submitted — pending review',accepted:'Accepted',changes_requested:'Needs correction'};
const emptyEvidence={deliverables:[],versions:[],submissions:[],submissionEvidence:[],reviews:[]};
const when=value=>new Date(value).toLocaleString();

export default function CloseoutRequirements({project,profile,onRefresh,onFile,onInvite,view='closeout'}){
 const [evidence,setEvidence]=useState(emptyEvidence);
 const [people,setPeople]=useState([]);
 useEffect(()=>{let active=true;getProfiles(project.organization_id).then(p=>{if(active)setPeople(p)}).catch(()=>{});return()=>{active=false}},[project.organization_id]);
 const [editing,setEditing]=useState(null);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [submissionNotes,setSubmissionNotes]=useState('');
 const submitRequest=useRef(null);
 const writable=isProjectWritable(project);
 const coordinate=canCoordinate(profile.role)&&writable;
 const editEvidence=canEditEvidence(profile.role)&&writable;
 const {requirements=[],counts={},submission}=project.closeout||{};
 useEffect(()=>{
  if(view!=='closeout')return undefined;
  let active=true;
  getEvidence(project.id).then(data=>{if(active)setEvidence(data);}).catch(err=>{if(active)setError(err.message);});
  return()=>{active=false;};
 },[project.id,project.closeout,view]);
 async function run(task,success){
  if(busy)return;
  setBusy(true);setError('');setMessage('');
  try{await task();setEvidence(await getEvidence(project.id));await onRefresh();setMessage(success);}
  catch(err){setError(err.message||'Unable to save. Reload and try again.');}
  finally{setBusy(false);}
 }
 const command=(action,payload={})=>closeoutCommand(action,{project_id:project.id,...payload});
 async function submit(){
  submitRequest.current ||= crypto.randomUUID();
  await submitCloseout({project_id:project.id,request_id:submitRequest.current,submission_notes:submissionNotes});submitRequest.current=null;setSubmissionNotes('');
 }
 const retryEntries=pendingUploads(profile,project.id);
 if(view==='commercial')return <section className="rwCommercialWorkspace" aria-label="Commercial authorizations and invoice">
  <div id="authorizations"><AuthorizationDocuments project={project} profile={profile} people={people} onRefresh={onRefresh} onFile={onFile}/></div>
  <div id="invoice-documents"><InvoiceDocuments project={project} profile={profile} people={people} onRefresh={onRefresh} onFile={onFile}/></div>
 </section>;
 return <section className="rwPanel coPanel" aria-label="Closeout requirements">
  <header className="coHeading" id="required-deliverables"><div><h2>Required deliverables</h2><p>Track required evidence and review decisions. Final inspection and acceptance follow after the coordinator review.</p></div>{coordinate&&<button className="rwSecondary" disabled={busy} onClick={()=>setEditing({})}>Add requirement</button>}</header>
  <div className="coCounts">{[['Required',counts.required||0],['Accepted',counts.accepted||0],['Missing',counts.missing||0],['Pending',counts.pending||0],['Corrections',counts.changes_requested||0]].map(([label,n])=><div key={label}><span>{label}</span><strong>{n}</strong></div>)}</div>
  <p className="coHelp">{counts.percent==null?'Configure required deliverables to calculate completion.':`${counts.percent}% accepted. Counts cover required items; optional items are labeled separately.`} Uploading a file does not mean it has been reviewed.</p>
  {error&&<div className="rwAlert" role="alert">{error}</div>}{message&&<p role="status" className="coSuccess">{message}</p>}
  {!writable&&<p className="coHelp">{project.lifecycle_stage==='accepted_closeout'?'Final closeout is accepted and locked. Original documents, revisions and decisions remain available in the final export.':'This project is read-only. Historical files and decisions remain preserved; a legacy approval is not a new completeness certification.'}</p>}
  {editing&&<RequirementEditor key={editing.id||'new'} value={editing} project={project} busy={busy} onCancel={()=>setEditing(null)} onSave={values=>run(async()=>{await saveRequirementWithSlots({project_id:project.id,...values});setEditing(null);},'Requirement saved. Prior decisions remain in submission history.')}/>}
  {!requirements.length&&<div className="rwEmpty"><strong>No required deliverables yet</strong><span>Add the documents, photos, or records contractors must submit before closeout can be completed. Existing project files remain available.</span></div>}
  <div className="coRequirements">{requirements.map(r=><Requirement key={r.id} requirement={r} project={project} evidence={evidence} submission={submission} profile={profile} people={people} coordinate={coordinate} editEvidence={editEvidence} busy={busy} onEdit={()=>setEditing(r)} onFile={onFile}
   onLink={values=>run(()=>command('evidence_link',{requirement_id:r.id,...values}),'Evidence version linked. Submit the updated package for review.')}
   onUpload={(files,deliverableId,slotKey)=>run(async()=>{const uploaded=await uploadProjectFiles(project,profile,files,r.category);for(const f of uploaded){if(slotKey)await linkSlotEvidence({project_id:project.id,requirement_id:r.id,file_id:f.id,slot_key:slotKey,deliverable_id:deliverableId||null});else await command('evidence_link',{requirement_id:r.id,file_id:f.id,deliverable_id:deliverableId||null});}},'Evidence uploaded. Earlier versions remain available.')}
   onReview={(decision,reason)=>run(()=>command('review',{submission_id:submission.id,requirement_id:r.id,decision,reason}),'Completeness decision recorded.')}/> )}</div>
  <div className="coFooter">
   {editEvidence&&requirements.length>0&&<><label className="coSubmissionNotes">Submission notes<textarea value={submissionNotes} onChange={event=>setSubmissionNotes(event.target.value)} maxLength={5000} placeholder="Add field notes, location details, or context for the reviewer…"/><small>Saved with this submission and preserved in its history (up to 5,000 characters).</small></label><button className="rwPrimary" disabled={busy||!evidence.versions.length} onClick={()=>run(submit,'Submission snapshot recorded. Awaiting independent completeness review.')}>{busy?'Saving…':submission?'Submit new revision for review':'Submit for completeness review'}</button></>}
   {coordinate&&<button className="rwSecondary" disabled={busy||!counts.required||counts.accepted!==counts.required||project.status!=='coordinator_review'} onClick={()=>run(()=>command('complete_review'),'Completeness review finished. Ready for inspection.')}>Finish completeness review</button>}
  </div>
  {editEvidence&&retryEntries.length>0&&<details className="coHistory"><summary>Uploads awaiting registration ({retryEntries.length})</summary><p>Retry after an interrupted response. If the object never uploaded, upload the file again. Unregistered objects are never counted as evidence.</p>{retryEntries.map(entry=><div key={entry.path}>{entry.name} <button className="rwSecondary" disabled={busy} onClick={()=>run(()=>retryUploadRegistration(profile,entry),'File registered. Link it to a requirement below.')}>Retry registration</button></div>)}</details>}
  <details className="coHistory"><summary>Submission and decision history ({evidence.submissions.length})</summary>{[...evidence.submissions].sort((a,b)=>b.sequence-a.sequence).map(s=>{const records=evidence.submissionEvidence.filter(item=>item.submission_id===s.id).map(item=>evidence.versions.find(version=>version.id===item.version_id)).filter(Boolean);return <article key={s.id}><strong>Submission {s.sequence} · {when(s.submitted_at)}</strong><p>Submitted by {personLabel(people,s.submitted_by,profile.id)}. {s.requirements_snapshot.length} requirement snapshots preserved.</p><p><strong>Construction revision at submission:</strong> {s.construction_package_snapshot?`${s.construction_package_snapshot.revision_label} · released ${when(s.construction_package_snapshot.released_at)}`:'No released package recorded (legacy submission or no package released).'}</p>{s.submission_notes&&<p><strong>Field notes:</strong> {s.submission_notes}</p>}{records.length>0&&<div><strong>Evidence included in this submission</strong>{records.map(version=>{const deliverable=evidence.deliverables.find(item=>item.id===version.deliverable_id);const requirement=s.requirements_snapshot.find(item=>item.id===deliverable?.requirement_id);const slot=requirement?.evidence_slots?.find(item=>item.key===version.slot_key);const file=project.files?.find(item=>item.id===version.file_id);return <p key={version.id}>{requirement?.title||deliverable?.title||'Evidence'}{slot?` · ${slot.title}`:''} · v{version.version} · {file?.file_name||'File unavailable'} · {when(version.created_at)}</p>})}</div>}{evidence.reviews.filter(r=>r.submission_id===s.id).map(r=><p key={r.id}>{s.requirements_snapshot.find(q=>q.id===r.requirement_id)?.title||'Requirement'}: {evidenceLabel(r.decision)} · {personLabel(people,r.reviewed_by,profile.id)} · {when(r.reviewed_at)}{r.reason&&` — ${r.reason}`}</p>)}</article>})}</details>
  <LifecyclePanel view="closeout" project={project} profile={profile} people={people} onRefresh={onRefresh} onFile={onFile} onInvite={onInvite}/>
 </section>;
}


function RequirementEditor({value,project,busy,onSave,onCancel}){
 const [slots,setSlots]=useState(()=>Array.isArray(value.evidence_slots)?value.evidence_slots.map(slot=>({...slot})):[]);
 return <form className="rwForm coEditor" onSubmit={event=>{event.preventDefault();const v=Object.fromEntries(new FormData(event.currentTarget));onSave({...v,id:value.id,version:value.version,required:v.required==='true',minimum_count:Number(v.minimum_count),evidence_slots:slots});}}>
  <h3>{value.id?'Edit requirement':'New requirement'}</h3>
  <label>Title<input name="title" defaultValue={value.title||''} maxLength={200} required/></label>
  <div><label>Category<select name="category" defaultValue={value.category||CATEGORIES[0]}>{[...new Set([...CATEGORIES,...(value.category?[value.category]:[])])].map(c=><option key={c}>{c}</option>)}</select></label><label>Minimum evidence files<input name="minimum_count" type="number" min="1" max="1000" defaultValue={value.minimum_count||1} required/></label></div>
  <label>Instructions<textarea name="instructions" defaultValue={value.instructions||''} maxLength={10000}/></label>
  <div><label>Applicability<select name="required" defaultValue={String(value.required!==false)}><option value="true">Required</option><option value="false">Optional</option></select></label><label>Responsible company<select name="responsible_company_id" defaultValue={value.responsible_company_id||''}><option value="">Project team</option>{project.contractor_company&&<option value={project.contractor_company.id}>{project.contractor_company.name}</option>}</select></label></div>
  <fieldset className="coSlotEditor"><legend>Guided evidence slots (optional)</legend><p className="coHelp">Define the specific photos or files this requirement needs. These are project-configured, not universal defaults. Leave empty to use the minimum-file-count workflow.</p>{slots.map((slot,index)=><div className="coSlotEditRow" key={slot.key}><label>Slot name<input value={slot.title} maxLength={160} required onChange={event=>setSlots(current=>current.map((item,i)=>i===index?{...item,title:event.target.value}:item))}/></label><label>Capture instructions<textarea value={slot.instructions||''} maxLength={2000} onChange={event=>setSlots(current=>current.map((item,i)=>i===index?{...item,instructions:event.target.value}:item))}/></label><label className="coSlotRequired"><input type="checkbox" checked={slot.required!==false} onChange={event=>setSlots(current=>current.map((item,i)=>i===index?{...item,required:event.target.checked}:item))}/> Required slot</label><button type="button" className="rwLink" onClick={()=>setSlots(current=>current.filter((_,i)=>i!==index))}>Remove slot</button></div>)}<button type="button" className="rwSecondary" disabled={slots.length>=40} onClick={()=>setSlots(current=>[...current,{key:`slot-${crypto.randomUUID()}`,title:'',instructions:'',required:true}])}>Add evidence slot</button></fieldset>
  <p className="coHelp">Changes create a new requirement version and invalidate its current acceptance. Previous submissions keep their original requirements.</p>
  <p className="coHelp">For invoices, use the separate Invoice documents requirement switch; it enforces document approval before final acceptance.</p>
  <div className="coFooter"><button className="rwPrimary" disabled={busy}>Save requirement</button><button type="button" className="rwSecondary" onClick={onCancel}>Cancel</button></div>
 </form>;
}

function Requirement({requirement:r,project,evidence,submission,profile,people,coordinate,editEvidence,busy,onEdit,onFile,onLink,onUpload,onReview}){
 const [reason,setReason]=useState('');
 const [deliverableId,setDeliverableId]=useState('');
 const [slotTargets,setSlotTargets]=useState({});
 const [fileId,setFileId]=useState('');
 const deliverables=evidence.deliverables.filter(d=>d.requirement_id===r.id);
 const configuredSlots=Array.isArray(r.evidence_slots)?r.evidence_slots:[];
 const currentSubmissionIds=new Set(evidence.submissionEvidence.filter(item=>item.submission_id===submission?.id).map(item=>item.version_id));
 const latestVersions=evidence.versions.filter(v=>deliverables.some(d=>d.id===v.deliverable_id)&&v.version===Math.max(...evidence.versions.filter(x=>x.deliverable_id===v.deliverable_id).map(x=>x.version)));
 const existingFiles=(project.files||[]).filter(f=>!evidence.versions.some(v=>v.file_id===f.id));
 const snapshotted=submission?.requirements_snapshot?.some(q=>q.id===r.id&&q.version===r.version);
 const canReview=coordinate&&snapshotted&&submission.submitted_by!==profile.id&&['pending_review','missing'].includes(r.state)&&!evidence.reviews.some(x=>x.submission_id===submission.id&&x.requirement_id===r.id);
 return <article className="coRequirement">
  <div className="coHeading"><div><span className="coCategory">{r.category} · {r.required?'Required':'Optional'} · v{r.version}</span><h3>{r.title}</h3></div><div><span className={`rwStatus ${r.state==='accepted'?'approved':r.state==='changes_requested'?'needs_rework':''}`}>{STATES[r.state]}</span>{coordinate&&<button className="rwLink" disabled={busy} onClick={onEdit}>Edit</button>}</div></div>
  {r.instructions&&<p>{r.instructions}</p>}<p className="coHelp">{r.evidence_count} of {r.minimum_count} minimum evidence files · {r.responsible_company_id?project.contractor_company?.name:'Project team'}</p>
  {configuredSlots.length>0&&<div className="coEvidenceSlots"><h4>Your evidence checklist</h4>{configuredSlots.map(slot=>{const files=latestVersions.filter(v=>v.slot_key===slot.key);const slotDeliverables=deliverables.filter(d=>files.some(v=>v.deliverable_id===d.id));const inSubmission=files.some(v=>currentSubmissionIds.has(v.id));const review=evidence.reviews.find(x=>x.submission_id===submission?.id&&x.requirement_id===r.id);const state=!files.length?(slot.required===false?'Optional':'Missing'):inSubmission?(review?.decision==='accepted'?'Accepted':review?.decision==='changes_requested'?'Needs correction':'Awaiting review'):'Uploaded';return <section className="coEvidenceSlot" key={slot.key}><div><strong>{slot.title}</strong><span className={`rwStatus ${state==='Accepted'?'approved':state==='Needs correction'?'needs_rework':''}`}>{state}</span></div>{slot.instructions&&<p>{slot.instructions}</p>}{files.map(file=>{const asset=project.files?.find(x=>x.id===file.file_id);return <p className="coEvidenceSlotFile" key={file.id}>{asset?.file_name||'Evidence file'} · v{file.version} · {when(file.created_at)}{asset&&<button className="rwLink" disabled={!asset} onClick={()=>onFile(asset)}>Open</button>}</p>})}{editEvidence&&<><label>Evidence file<select value={slotTargets[slot.key]||''} onChange={event=>setSlotTargets(current=>({...current,[slot.key]:event.target.value}))} disabled={busy}><option value="">Add another file to this slot</option>{slotDeliverables.map(item=><option key={item.id} value={item.id}>Replace current: {item.title}</option>)}</select></label><label>{slotTargets[slot.key]?'Upload correction / replacement':'Add file to'} {slot.title}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={!slotTargets[slot.key]} disabled={busy} onChange={event=>{const files=Array.from(event.target.files||[]);event.target.value='';if(files.length)onUpload(files,slotTargets[slot.key]||null,slot.key);}}/></label></>}</section>})}</div>}
  {r.decision_reason&&<p className="coReason">Reviewer: {r.decision_reason}</p>}
  {(r.asset_id||r.asset_type)&&<p className="coHelp">Asset-scoped requirement: {r.asset_type||'specific project asset'}. Each current evidence version must be linked to its asset by the coordinator before submission. See Asset relationships above.</p>}
  {submission&&<p className="coHelp">Latest submission #{submission.sequence} · {personLabel(people,submission.submitted_by,profile.id)} · {when(submission.submitted_at)}</p>}
  {deliverables.map(d=>{const versions=evidence.versions.filter(v=>v.deliverable_id===d.id).sort((a,b)=>b.version-a.version);return <details className="coVersions" key={d.id} open={r.state==='pending_review'||r.state==='changes_requested'}><summary>{d.title} · Current v{versions[0]?.version} · {versions.length} preserved version(s)</summary>{versions.map((v,index)=>{const f=project.files?.find(x=>x.id===v.file_id);return <div key={v.id} className={index===0?'coVersionCurrent':''}><span>{index===0?'CURRENT':'Previous'} v{v.version} · {when(v.created_at)} · {personLabel(people,v.created_by,profile.id)}</span> <button className="rwLink" disabled={!f} onClick={()=>f&&onFile(f)}>{f?.file_name||'Document unavailable — reload project'}</button></div>})}</details>})}
  {editEvidence&&configuredSlots.length===0&&<div className="coEvidenceForm">
   <label>Evidence item<select value={deliverableId} onChange={e=>setDeliverableId(e.target.value)} disabled={busy}><option value="">New deliverable / evidence item</option>{deliverables.map(d=><option key={d.id} value={d.id}>New version of: {d.title}</option>)}</select></label>
   <label>Upload {deliverableId?'replacement version':'evidence'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif" multiple={!deliverableId} disabled={busy} onChange={e=>{if(e.target.files?.length)onUpload(Array.from(e.target.files),deliverableId);e.target.value='';}}/></label>
   <label>Or link an existing project file<select value={existingFiles.some(f=>f.id===fileId)?fileId:''} onChange={e=>setFileId(e.target.value)} disabled={busy}><option value="">Choose unclassified file</option>{existingFiles.map(f=><option key={f.id} value={f.id}>{f.file_name}</option>)}</select></label><button className="rwSecondary" disabled={busy||!existingFiles.some(f=>f.id===fileId)} onClick={()=>onLink({file_id:fileId,deliverable_id:deliverableId||null})}>Link file</button>
  </div>}
  {canReview&&<div className="coReview"><label>Review note / correction reason<textarea value={reason} onChange={e=>setReason(e.target.value)} maxLength={10000}/></label><div className="coFooter"><button className="rwPrimary" disabled={busy||r.state==='missing'} onClick={()=>onReview('accepted',reason)}>Accept completeness</button><button className="rwSecondary" disabled={busy||!reason.trim()} onClick={()=>onReview('changes_requested',reason)}>Request corrections</button></div></div>}
  {r.state==='pending_review'&&<p className="coReviewHandoff" role="status"><strong>Awaiting independent review.</strong> Next: a Coordinator or Admin who did not submit this evidence must review it.</p>}
  {r.state==='changes_requested'&&<p className="coReviewHandoff correction"><strong>Needs revision.</strong> The contractor must upload corrected evidence and submit it again; this item is not waiting on a review decision.</p>}
 </article>;
}
