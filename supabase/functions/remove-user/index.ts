import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
};
const respond=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,'Content-Type':'application/json'}});

Deno.serve(async(request)=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(request.method!=='POST')return respond({success:false,error:'Method not allowed.'},405);
  try{
    const authorization=request.headers.get('Authorization');
    if(!authorization?.startsWith('Bearer '))return respond({success:false,error:'You must be signed in.'},401);
    const url=Deno.env.get('SUPABASE_URL');
    const key=Deno.env.get('ASBUILTFLOW_SECRET_KEY')??Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!key)throw new Error('Supabase server configuration is incomplete.');
    const admin=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:{user},error:userError}=await admin.auth.getUser(authorization.slice(7));
    if(userError||!user)return respond({success:false,error:'Your session is invalid or expired.'},401);
    const {data:caller}=await admin.from('profiles').select('id,organization_id,role,active').eq('id',user.id).single();
    if(!caller?.active||caller.role!=='admin')return respond({success:false,error:'Only an active administrator can remove users.'},403);
    const {userId}=await request.json();
    if(!userId||typeof userId!=='string')return respond({success:false,error:'A user ID is required.'},400);
    if(userId===caller.id)return respond({success:false,error:'You cannot remove your own administrator account.'},400);
    const {data:target}=await admin.from('profiles').select('id,organization_id,full_name,email').eq('id',userId).single();
    if(!target||target.organization_id!==caller.organization_id)return respond({success:false,error:'User not found in your organization.'},404);

    const checks:[string,string][]=[
      ['projects','created_by'],['projects','coordinator_id'],['projects','inspector_id'],
      ['issues','created_by'],['issues','assigned_to'],['issue_comments','author_id'],
      ['files','uploaded_by'],['revisions','uploaded_by'],['project_checklist_items','completed_by'],
      ['activity_events','actor_id'],
    ];
    for(const [table,column] of checks){
      const {count,error}=await admin.from(table).select('*',{count:'exact',head:true}).eq(column,userId);
      if(error)throw new Error(`Unable to verify user history: ${error.message}`);
      if((count??0)>0)return respond({success:false,error:'This user has project history and cannot be permanently removed. Deactivate them instead to preserve the audit trail.'},409);
    }

    await admin.from('activity_events').insert({organization_id:caller.organization_id,actor_id:caller.id,event_type:'user_removed',description:`${target.full_name||target.email||'A user'} was permanently removed`,metadata:{removed_user_id:userId,email:target.email}});
    const {error:deleteError}=await admin.auth.admin.deleteUser(userId);
    if(deleteError)throw deleteError;
    await admin.from('profiles').delete().eq('id',userId);
    return respond({success:true,message:'User permanently removed.'});
  }catch(error){
    const message=error instanceof Error?error.message:'An unknown removal error occurred.';
    console.error('remove-user failed:',message);
    return respond({success:false,error:message},500);
  }
});
