import { useState } from 'react';
import { supabase } from '../lib/supabase';
import './AuthPage.css';

export default function AuthPage() {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'reset') {
        const redirectTo = `${window.location.origin}/app`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (resetError) throw resetError;
        setMessage('Password reset instructions were sent to your email.');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
    } catch (err) {
      setError(err.message || 'Unable to continue. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="authPage">
      <section className="authBrandPanel">
        <a href="/" className="authLogo">AsBuiltFlow</a>
        <div>
          <span>Telecom closeout platform</span>
          <h1>One secure workflow from submission to final approval.</h1>
          <p>Manage projects, plan reviews, revisions, issues, photos, and approvals in one shared workspace.</p>
          <ul>
            <li>Role-based access for admins, coordinators, inspectors, and contractors</li>
            <li>Private project files and revision history</li>
            <li>Mobile photo uploads for field teams</li>
          </ul>
        </div>
        <small>AsBuiltFlow early access</small>
      </section>

      <section className="authCardWrap">
        <form className="authCard" onSubmit={submit}>
          <span className="authEyebrow">Secure workspace</span>
          <h2>{mode === 'reset' ? 'Reset your password' : 'Sign in to AsBuiltFlow'}</h2>
          <p>{mode === 'reset' ? 'Enter your work email and we will send reset instructions.' : 'Use the account provided by your organization administrator.'}</p>

          <label>
            Work email
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required placeholder="you@company.com" />
          </label>

          {mode !== 'reset' && (
            <label>
              Password
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required minLength="8" placeholder="Enter your password" />
            </label>
          )}

          {error && <div className="authAlert error">{error}</div>}
          {message && <div className="authAlert success">{message}</div>}

          <button type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>

          <button type="button" className="authTextButton" onClick={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setError(''); setMessage(''); }}>
            {mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}
          </button>

          <div className="authDivider"><span>or</span></div>
          <a className="authDemoLink" href="/demo">Explore the interactive demo</a>
          <small className="authFinePrint">Accounts are invite-only during early access.</small>
        </form>
      </section>
    </div>
  );
}


export function UpdatePasswordPage({ onComplete }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) setError(updateError.message); else onComplete();
  }
  return <div className="authPage"><section className="authBrandPanel"><a href="/" className="authLogo">AsBuiltFlow</a><div><span>Secure account recovery</span><h1>Create your new password.</h1><p>Choose a strong password for your AsBuiltFlow workspace account.</p></div><small>AsBuiltFlow early access</small></section><section className="authCardWrap"><form className="authCard" onSubmit={submit}><span className="authEyebrow">Password recovery</span><h2>Set a new password</h2><label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="8" required autoComplete="new-password"/></label><label>Confirm password<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} minLength="8" required autoComplete="new-password"/></label>{error&&<div className="authAlert error">{error}</div>}<button disabled={loading}>{loading?'Saving…':'Save password'}</button></form></section></div>;
}
