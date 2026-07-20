import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const allowedRoles = ['admin','project_manager','coordinator','inspector','contractor_admin','contractor_user','viewer'];

function respond(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ success: false, error: 'Method not allowed.' }, 405);

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) {
      return respond({ success: false, error: 'You must be signed in to invite users.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const secretKey = Deno.env.get('ASBUILTFLOW_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !secretKey) throw new Error('Supabase server configuration is incomplete.');

    const token = authorization.slice(7);
    const verificationClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error: userError } = await verificationClient.auth.getUser(token);
    if (userError || !user) return respond({ success: false, error: 'Your session is invalid or expired.' }, 401);

    const adminClient = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${secretKey}` } },
    });

    const { data: caller, error: callerError } = await adminClient
      .from('profiles')
      .select('id, organization_id, role, active')
      .eq('id', user.id)
      .single();
    if (callerError || !caller) throw new Error(`Unable to load caller profile: ${callerError?.message ?? 'Profile not found.'}`);
    if (!caller.active || caller.role !== 'admin') return respond({ success: false, error: 'Only an active administrator can invite users.' }, 403);

    const body = await request.json();
    const email = String(body.email ?? '').trim().toLowerCase();
    const fullName = String(body.fullName ?? body.full_name ?? '').trim();
    const role = String(body.role ?? '').trim().toLowerCase();
    const rawCompanyId = body.contractorCompanyId ?? body.contractor_company_id ?? null;
    const contractorCompanyId = typeof rawCompanyId === 'string' && rawCompanyId.trim() ? rawCompanyId.trim() : null;
    const redirectTo = String(body.redirectTo ?? body.redirect_to ?? 'https://www.asbuiltflow.com/app/setup-password').trim();

    if (!email || !fullName || !allowedRoles.includes(role)) {
      return respond({ success: false, error: 'A valid name, email address, and role are required.' }, 400);
    }
    if (['contractor_admin','contractor_user'].includes(role) && !contractorCompanyId) {
      return respond({ success: false, error: 'Select a contractor company for contractor users.' }, 400);
    }

    const { data: existing } = await adminClient.from('profiles').select('id').eq('email', email).maybeSingle();
    if (existing) return respond({ success: false, error: 'A user with this email already exists.' }, 409);

    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        full_name: fullName,
        organization_id: caller.organization_id,
        role,
        contractor_company_id: contractorCompanyId,
      },
    });
    if (inviteError) return respond({ success: false, error: inviteError.message }, 400);

    const invitedUserId = invited.user?.id;
    if (!invitedUserId) throw new Error('Supabase did not return an invited user ID.');

    const { error: profileError } = await adminClient.from('profiles').upsert({
      id: invitedUserId,
      organization_id: caller.organization_id,
      contractor_company_id: ['contractor_admin','contractor_user'].includes(role) ? contractorCompanyId : null,
      full_name: fullName,
      email,
      role,
      active: true,
    }, { onConflict: 'id' });

    if (profileError) {
      await adminClient.auth.admin.deleteUser(invitedUserId);
      throw new Error(`The invitation was created, but the profile could not be saved: ${profileError.message}`);
    }

    await adminClient.from('activity_events').insert({
      organization_id: caller.organization_id,
      actor_id: caller.id,
      event_type: 'user_invited',
      description: `${email} was invited as ${role.replaceAll('_', ' ')}`,
      metadata: { invited_user_id: invitedUserId, email, role },
    });

    return respond({ success: true, message: `Invitation sent to ${email}.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown invitation error occurred.';
    console.error('invite-user failed:', message);
    return respond({ success: false, error: message }, 500);
  }
});
