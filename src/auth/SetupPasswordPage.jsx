import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './AuthPage.css';

export default function SetupPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function prepareSession() {
      try {
        const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          window.history.replaceState({}, document.title, window.location.pathname);
        }
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session) throw new Error('This invitation link is invalid or has expired. Ask your administrator to send a new invitation.');
      } catch (err) {
        if (active) setError(err.message || 'Unable to verify this invitation.');
      } finally {
        if (active) setLoading(false);
      }
    }
    prepareSession();
    return () => { active = false; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setSaving(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateError) return setError(updateError.message);
    navigate('/app', { replace: true });
  }

  return (
    <div className="authPage">
      <section className="authBrandPanel">
        <a href="/" className="authLogo">AsBuiltFlow</a>
        <div>
          <span>Secure account setup</span>
          <h1>Finish creating your workspace account.</h1>
          <p>Create a password to access the projects and closeout packages assigned to you.</p>
          <ul>
            <li>Private organization workspace</li>
            <li>Role-based project access</li>
            <li>Secure document and revision history</li>
          </ul>
        </div>
        <small>AsBuiltFlow controlled pilot</small>
      </section>
      <section className="authCardWrap">
        <form className="authCard" onSubmit={submit}>
          <span className="authEyebrow">Invitation accepted</span>
          <h2>Create your password</h2>
          <p>Use at least eight characters. You will use this password for future sign-ins.</p>
          {loading ? <div className="authAlert success">Verifying your invitation…</div> : (
            <>
              <label>New password<input type="password" autoComplete="new-password" minLength="8" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
              <label>Confirm password<input type="password" autoComplete="new-password" minLength="8" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
              {error && <div className="authAlert error">{error}</div>}
              <button type="submit" disabled={saving || Boolean(error && !password)}>{saving ? 'Saving…' : 'Save password and enter workspace'}</button>
            </>
          )}
        </form>
      </section>
    </div>
  );
}
