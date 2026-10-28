import { supabase } from '../lib/supabase';
import { activityEventLabel } from '../app/notificationPresentation';

const ROLE_LABELS = {
  admin: 'Admin', project_manager: 'Project Manager', coordinator: 'Coordinator', inspector: 'Inspector', contractor_admin: 'Contractor Admin', contractor_user: 'Contractor', viewer: 'Read-only Viewer',
};
const STATUS_LABELS = {
  draft: 'Draft', submitted: 'Submitted', coordinator_review: 'Coordinator Review', ready_for_inspection: 'Ready for Inspection', inspector_review: 'Inspector Review', needs_rework: 'Needs Rework', revision_submitted: 'Revision Submitted', approved: 'Approved', closed: 'Closed',
};
const ISSUE_STATUS_LABELS = { open:'Open', in_progress:'In Progress', contractor_responded:'Contractor Responded', ready_for_review:'Ready for Review', resolved:'Resolved', closed:'Closed' };
export const roleLabel=(v)=>ROLE_LABELS[v]||v||'Viewer';
export const statusLabel=(v)=>STATUS_LABELS[v]||String(v||'Draft').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
export const issueStatusLabel=(v)=>ISSUE_STATUS_LABELS[v]||v||'Open';
export const statusValue=(label)=>Object.entries(STATUS_LABELS).find(([,v])=>v===label)?.[0]||label;
export const issueStatusValue=(label)=>Object.entries(ISSUE_STATUS_LABELS).find(([,v])=>v===label)?.[0]||label;

export async function getOrganization(id){const {data,error}=await supabase.from('organizations').select('*').eq('id',id).single();if(error)throw error;return data}
export async function getProfiles(organizationId){const {data,error}=await supabase.from('profiles').select('id,full_name,email,role,active,contractor_company_id,created_at').eq('organization_id',organizationId).order('full_name');if(error)throw error;return data||[]}
export async function getContractors(organizationId){const {data,error}=await supabase.from('contractor_companies').select('*').eq('organization_id',organizationId).order('name');if(error)throw error;return data||[]}
async function query(request){const {data,error}=await request;if(error)throw error;return data}
async function optional(request,fallback){try{return await query(request)}catch(error){if(['PGRST202','PGRST205','42P01','42883'].includes(error.code))return fallback;throw error}}
export const workspaceCommand=(action,payload={})=>query(supabase.rpc('abf_workspace_command',{action,payload}));
export async function getProjects(){const {data,error}=await supabase.from('projects').select(`*,contractor_company:contractor_companies(id,name),coordinator:profiles!projects_coordinator_id_fkey(id,full_name),inspector:profiles!projects_inspector_id_fkey(id,full_name),issues(id,issue_number,title,description,sheet,priority,status,assigned_to,due_date,created_at,updated_at,pin_x,pin_y),files(id,file_name,mime_type,size_bytes,category,caption,revision_number,created_at,storage_path),revisions(id,version,label,status,created_at,file_id),project_checklist_items(id,project_id,label,sort_order,completed_at,completed_by),activity_events(id,event_type,description,created_at,actor_id)`).eq('archived',false).order('updated_at',{ascending:false});if(error)throw error;const projects=data||[];const [closeouts,invoices]=await Promise.all([optional(supabase.rpc('abf_closeout_states'),{}),optional(supabase.rpc('abf_invoice_states'),{})]);return projects.map(project=>({...project,closeout:closeouts[project.id],invoiceState:invoices[project.id],activity_events:(project.activity_events||[]).map(event=>({...event,description:activityEventLabel(event.event_type)}))}))}
export const lifecycleCommand=(action,payload)=>query(supabase.rpc('abf_lifecycle_command',{action,payload}));
export const invoiceCommand=(action,payload)=>query(supabase.rpc('abf_invoice_command',{action,payload}));
export const authorizationCommand=(action,payload)=>query(supabase.rpc('abf_authorization_command',{action,payload}));
export async function getLifecycle(projectId){const names=['construction_packages','construction_package_files','field_changes','project_assets','lifecycle_history','asset_imports','asset_links','closeout_packages','evidence_versions'];const result=await Promise.all(names.map(name=>query(supabase.from(name).select('*').eq('project_id',projectId))));const [changeFiles,invoiceState,authorizations]=await Promise.all([optional(supabase.from('field_change_files').select('*').eq('project_id',projectId),[]),optional(supabase.rpc('abf_invoice_state',{pid:projectId}),{}),getAuthorizations(projectId)]);const values=Object.fromEntries(names.map((name,index)=>[name,result[index]]));return {packages:values.construction_packages.sort((a,b)=>b.revision_number-a.revision_number),attachments:values.construction_package_files,changes:values.field_changes,assets:values.project_assets.sort((a,b)=>a.identifier.localeCompare(b.identifier)),history:values.lifecycle_history,imports:values.asset_imports,links:values.asset_links,closeouts:values.closeout_packages,evidence:values.evidence_versions,changeFiles,invoiceState,authorizations}}
export async function getAuthorizations(projectId){const [versions,state]=await Promise.all([query(supabase.from('authorization_versions').select('*').eq('project_id',projectId).order('version',{ascending:false})),query(supabase.rpc('abf_authorization_check',{pid:projectId}))]);return {versions,state}}
export async function getInvoices(projectId){const [versions,reviews,state,authorizations]=await Promise.all([query(supabase.from('invoice_versions').select('*').eq('project_id',projectId).order('submitted_at',{ascending:false})),query(supabase.from('invoice_reviews').select('*').eq('project_id',projectId)),query(supabase.rpc('abf_invoice_state',{pid:projectId})),getAuthorizations(projectId)]);const checks=Object.fromEntries(await Promise.all(versions.map(async version=>[version.id,query(supabase.rpc('abf_authorization_check',{pid:projectId,invoice_version:version.id}))])));return {versions,reviews,state,authorizations,checks}}
export async function getEvidence(projectId){const names=['deliverables','evidence_versions','closeout_submissions','submission_evidence','completeness_reviews'];const result=await Promise.all(names.map(name=>query(supabase.from(name).select('*').eq('project_id',projectId))));return {deliverables:result[0],versions:result[1],submissions:result[2],submissionEvidence:result[3],reviews:result[4]}}
export const updateProjectAssignments=({projectId,contractorCompanyId,coordinatorId,inspectorId})=>query(supabase.rpc('abf_project_assignments_update',{pid:projectId,contractor_id:contractorCompanyId||null,coordinator_profile_id:coordinatorId||null,inspector_profile_id:inspectorId||null}));
export const saveRequirementWithSlots=payload=>query(supabase.rpc('abf_requirement_save_v12',{payload}));
export const linkSlotEvidence=payload=>query(supabase.rpc('abf_evidence_slot_link_v12',{payload}));
export const submitCloseout=payload=>query(supabase.rpc('abf_submit_closeout_v12',{payload}));
export const createFieldChange=payload=>query(supabase.rpc('abf_field_change_create_v12',{payload}));
export const resolveFieldChange=payload=>query(supabase.rpc('abf_field_change_resolve_v12',{payload}));
export const closeoutCommand=(action,payload)=>query(supabase.rpc('abf_closeout_command',{action,payload}));
export const closeoutState=projectId=>query(supabase.rpc('abf_closeout_state',{pid:projectId}));
export async function getIssueComments(issueId){const {data,error}=await supabase.from('issue_comments').select('id,body,created_at,author:profiles!issue_comments_author_id_fkey(id,full_name,role)').eq('issue_id',issueId).order('created_at');if(error)throw error;return data||[]}
export const createProject=(_profile,values)=>workspaceCommand('project_create',values);
export const updateProject=(projectId,changes)=>workspaceCommand('project_status',{project_id:projectId,status:changes.status});
export const createIssue=(project,_profile,values)=>workspaceCommand('issue_create',{project_id:project.id,...values});
export const updateIssue=(issueId,projectId,_profile,changes)=>workspaceCommand('issue_status',{project_id:projectId,id:issueId,status:changes.status});
export const addIssueComment=(issueId,projectId,_profile,body)=>workspaceCommand('comment',{project_id:projectId,id:issueId,body});
const clean=(name)=>name.replace(/[^a-zA-Z0-9._-]/g,'-');
const acceptedUploadTypes=new Set(['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif']);
export function validateUpload(file){if(!acceptedUploadTypes.has(file.type))throw new Error('Use PDF, JPEG, PNG, WebP, HEIC or HEIF files.');if(!file.size||file.size>50*1024*1024)throw new Error('Files must be between 1 byte and 50 MiB.')}
const pendingKey=profile=>`abf-pending-uploads:${profile.id}`;
export function pendingUploads(profile,projectId){try{return JSON.parse(localStorage.getItem(pendingKey(profile))||'[]').filter(item=>item.project_id===projectId)}catch{return []}}
function storePending(profile,entry,remove=false){let rows;try{rows=JSON.parse(localStorage.getItem(pendingKey(profile))||'[]')}catch{rows=[]}rows=rows.filter(item=>item.path!==entry.path);if(!remove)rows.push(entry);localStorage.setItem(pendingKey(profile),JSON.stringify(rows))}
export async function retryUploadRegistration(profile,entry){const file=await workspaceCommand('file_register',entry);storePending(profile,entry,true);return file}
export async function uploadProjectFiles(project,profile,fileList,category,onProgress){const files=Array.from(fileList||[]),results=[];files.forEach(validateUpload);for(let index=0;index<files.length;index+=1){const file=files[index],path=`${profile.organizationId}/${project.id}/${crypto.randomUUID()}-${clean(file.name)}`,entry={project_id:project.id,path,name:file.name,category};storePending(profile,entry);const {error}=await supabase.storage.from('project-files').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});if(error)throw error;results.push(await retryUploadRegistration(profile,entry));onProgress?.(Math.round(((index+1)/files.length)*100))}return results}
export async function uploadRevision(project,profile,file,onProgress){const [uploaded]=await uploadProjectFiles(project,profile,[file],'Revision',onProgress);return workspaceCommand('revision_register',{project_id:project.id,file_id:uploaded.id})}
export async function getSignedFileUrl(path){const {data,error}=await supabase.storage.from('project-files').createSignedUrl(path,300);if(error)throw error;return data.signedUrl}
export async function toggleChecklist(item){return workspaceCommand('checklist',{project_id:item.project_id,id:item.id,done:!item.completed_at})}
export async function getNotifications(profileId){const {data,error}=await supabase.from('notifications').select('*').eq('recipient_id',profileId).order('created_at',{ascending:false}).limit(30);if(error)throw error;return data||[]}
export async function markNotificationsRead(){return workspaceCommand('notifications_read')}
export async function updateProfile(profileId,changes){return workspaceCommand('profile_update',{id:profileId,...changes})}
export async function createContractor(_organizationId,name){return workspaceCommand('contractor_create',{name})}
export async function inviteUser(values){const {data:{session}}=await supabase.auth.getSession();if(!session)throw new Error('Your session has expired. Sign in again.');const payload={...values,redirectTo:`${window.location.origin}/app/setup-password`};const {data,error}=await supabase.functions.invoke('invite-user',{body:payload,headers:{Authorization:`Bearer ${session.access_token}`}});if(error)throw error;if(!data?.success)throw new Error(data?.error||'Invitation failed.');return data}


export async function removeUser(profileId){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('Your session has expired. Sign in again.');
  const {data,error}=await supabase.functions.invoke('remove-user',{body:{userId:profileId},headers:{Authorization:`Bearer ${session.access_token}`}});
  if(error)throw error;
  if(!data?.success)throw new Error(data?.error||'User removal failed.');
  return data;
}
