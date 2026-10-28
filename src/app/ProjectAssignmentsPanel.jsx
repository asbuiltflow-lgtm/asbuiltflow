import {useState} from 'react';
import './projectAssignments.css';

export default function ProjectAssignmentsPanel({project,profiles,contractors,onSave}){
 const [contractorCompanyId,setContractorCompanyId]=useState(project.contractor_company_id||'');
 const [coordinatorId,setCoordinatorId]=useState(project.coordinator_id||'');
 const [inspectorId,setInspectorId]=useState(project.inspector_id||'');
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const locked=project.archived||['approved','closed'].includes(project.status);
 async function submit(event){
  event.preventDefault();setSaving(true);setError('');
  try{await onSave({contractorCompanyId,coordinatorId,inspectorId});}
  catch(reason){setError(reason?.message||'Assignments could not be saved.');}
  finally{setSaving(false);}
 }
 return <section className="rwPanel" aria-labelledby="project-assignment-title">
  <header><h2 id="project-assignment-title">Project assignments</h2></header>
  <p className="rwNote">Changes are recorded in project history. Contractor access updates to match the assigned company.</p>
  <form className="rwForm projectAssignmentsForm" onSubmit={submit}>
   <label>Contractor company<select disabled={locked} value={contractorCompanyId} onChange={event=>setContractorCompanyId(event.target.value)}><option value="">Unassigned</option>{contractors.filter(item=>item.active!==false).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
   <label>Coordinator<select disabled={locked} value={coordinatorId} onChange={event=>setCoordinatorId(event.target.value)}><option value="">Unassigned</option>{profiles.filter(item=>item.active!==false&&['admin','project_manager','coordinator'].includes(item.role)).map(item=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
   <label>Inspector<select disabled={locked} value={inspectorId} onChange={event=>setInspectorId(event.target.value)}><option value="">Unassigned</option>{profiles.filter(item=>item.active!==false&&item.role==='inspector').map(item=><option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
   {error&&<p role="alert" className="rwAlert">{error}</p>}
   <button className="rwPrimary" disabled={locked||saving}>{saving?'Saving…':'Save assignments'}</button>
   {locked&&<small>Accepted or archived projects cannot be reassigned.</small>}
  </form>
 </section>;
}
