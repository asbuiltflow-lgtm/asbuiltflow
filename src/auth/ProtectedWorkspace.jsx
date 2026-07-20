import { useEffect, useState } from 'react';
import AuthPage, { UpdatePasswordPage } from './AuthPage';
import RealWorkspace from '../app/RealWorkspace';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

function fullNameFromUser(user) {
  return user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Workspace User';
}

export default function ProtectedWorkspace() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profileError, setProfileError] = useState('');
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;

    let mounted = true;

    async function loadProfile(activeSession) {
      if (!activeSession?.user) {
        if (mounted) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const user = activeSession.user;
      let { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, organization_id, contractor_company_id, active')
        .eq('id', user.id)
        .maybeSingle();

      if (!data && !error) {
        const bootstrap = await supabase.rpc('bootstrap_organization', { org_name: 'AsBuiltFlow' });
        data = bootstrap.data;
        error = bootstrap.error;
      }

      if (!mounted) return;

      if (error) {
        setProfileError(error.message);
      }

      setProfile({
        id: user.id,
        name: data?.full_name || fullNameFromUser(user),
        email: user.email,
        role: data?.role || 'admin',
        company: data?.organization?.name || 'AsBuiltFlow',
        organizationId: data?.organization_id || null,
        contractorCompanyId: data?.contractor_company_id || null,
        active: data?.active !== false,
      });
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      loadProfile(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(nextSession);
      setLoading(true);
      loadProfile(nextSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (!isSupabaseConfigured) {
    return (
      <div style={{padding:'48px',fontFamily:'Inter,system-ui',maxWidth:'760px',margin:'0 auto'}}>
        <h1>Supabase setup required</h1>
        <p>Create a <code>.env.local</code> file beside <code>package.json</code> and add your VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY values.</p>
        <p><a href="/demo">Open the interactive demo instead</a></p>
      </div>
    );
  }

  if (loading) return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',fontFamily:'Inter,system-ui'}}>Loading secure workspace…</div>;
  if (!session) return <AuthPage />;
  if (recovering) return <UpdatePasswordPage onComplete={() => setRecovering(false)} />;
  if (!profile?.active) return <div style={{padding:'48px',fontFamily:'Inter,system-ui'}}>This account has been deactivated. Contact your organization administrator.</div>;

  return (
    <>
      {profileError && <div style={{position:'fixed',top:12,left:'50%',transform:'translateX(-50%)',zIndex:9999,background:'#fff7ed',border:'1px solid #fed7aa',padding:'10px 14px',borderRadius:10,color:'#9a3412'}}>Profile setup notice: {profileError}</div>}
      <RealWorkspace profile={profile} onSignOut={() => supabase.auth.signOut()} />
    </>
  );
}
