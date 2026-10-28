'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { ArrowLeft, ArrowRight, Layers3, ShieldCheck } from 'lucide-react';
export default function AuthForm({ mode }: { mode: 'signin' | 'signup' }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signup = mode === 'signup';
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email')),
      password = String(form.get('password'));
    try {
      if (signup) {
        const response = await fetch('/api/v1/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: form.get('name'), email, password, role: form.get('role') }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
      }
      const result = await signIn('credentials', { email, password, redirect: false });
      if (result?.error)
        throw new Error('Unable to sign in. Check your email and password, or try again later.');
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to connect.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <aside>
        <Link className="brand" href="/">
          <Layers3 />
          Proof<span className="blue">Pay</span>
        </Link>
        <div>
          <span className="eyebrow">WORK WITH CLARITY</span>
          <h1>
            A clear finish line.
            <br />
            For every milestone.
          </h1>
          <p>
            Clear requirements.
            <br />
            Verifiable progress.
            <br />
            Confident payments.
          </p>
          <div className="auth-quote">
            <ShieldCheck />
            <span>
              AI assists. Evidence informs.
              <br />
              People decide.
            </span>
          </div>
        </div>
        <small>Prototype · Sandbox payments · No escrow</small>
      </aside>
      <main>
        <Link className="back" href="/">
          <ArrowLeft size={17} /> Back to ProofPay
        </Link>
        <div className="auth-card">
          <span className="eyebrow">YOUR WORKSPACE AWAITS</span>
          <h2>{signup ? 'Start with a shared understanding.' : 'Welcome back.'}</h2>
          <p className="muted">
            {signup
              ? 'Create an account to bring clarity to your next project.'
              : 'Sign in to pick up where you left off.'}
          </p>
          <form onSubmit={submit}>
            {signup && (
              <label>
                Full name
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Your name"
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                required
                minLength={12}
                maxLength={128}
                autoComplete={signup ? 'new-password' : 'current-password'}
                placeholder="At least 12 characters"
              />
            </label>
            {signup && (
              <label>
                I am a
                <select name="role">
                  <option value="CLIENT">Client — I commission and review work</option>
                  <option value="FREELANCER">Freelancer — I deliver work</option>
                </select>
              </label>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="auth-switch">
            {signup ? 'Already have an account?' : 'New to ProofPay?'}{' '}
            <Link href={signup ? '/signin' : '/signup'}>
              {signup ? 'Sign in' : 'Create an account'}
            </Link>
          </p>
          <small className="muted">
            By continuing, you acknowledge the{' '}
            <Link href="/legal">prototype terms and privacy notice</Link>.
          </small>
        </div>
      </main>
    </div>
  );
}
