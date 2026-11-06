'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authClient } from '@/lib/auth/client';

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function SignUpPage() {
  const router = useRouter();
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setPending(true);
    try {
      const { data, error } = await authClient.signUp.email({ name, email, password });
      if (error) {
        setError(error.message || 'Failed to create account');
        return;
      }
      if (data?.user && !data.user.emailVerified) {
        setInfo('Check your email for a verification code, then enter it below.');
        setStep('verify');
        return;
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setPending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error } = await authClient.emailOtp.verifyEmail({ email, otp: code.trim() });
      if (error) {
        setError(error.message || 'Invalid or expired code');
        return;
      }
      // Auto sign-in after verification is enabled on the branch, so a session exists now.
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setPending(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setInfo('Resending…');
    try {
      const { error } = await authClient.sendVerificationEmail({ email, callbackURL: window.location.origin + '/' });
      if (error) {
        setError(error.message || 'Could not resend the code');
        setInfo(null);
        return;
      }
      setInfo('Verification code resent. Codes expire after 15 minutes.');
    } catch {
      setError('Could not resend the code');
      setInfo(null);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      {step === 'form' ? (
        <form onSubmit={handleSignUp} className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Create account</h1>
            <p className="text-sm text-slate-500 mt-1">Join Carrier Intelligence to unlock saved searches and alerts.</p>
          </div>

          <div>
            <label htmlFor="name" className={labelCls}>Name</label>
            <input id="name" type="text" required placeholder="John Doe" value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="email" className={labelCls}>Email address</label>
            <input id="email" type="email" required placeholder="john@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>Password</label>
            <input id="password" type="password" required placeholder="••••••••" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {info && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{info}</div>}

          <button type="submit" disabled={pending} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
            {pending ? 'Creating account…' : 'Create Account'}
          </button>

          <p className="text-sm text-slate-500 text-center">
            Already have an account?{' '}
            <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">Sign in</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Verify your email</h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter the verification code sent to <strong className="text-slate-700">{email}</strong>
            </p>
          </div>

          <div>
            <label htmlFor="code" className={labelCls}>Verification code</label>
            <input id="code" type="text" required inputMode="numeric" autoComplete="one-time-code" placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}
          {info && <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-700">{info}</div>}

          <button type="submit" disabled={pending} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
            {pending ? 'Verifying…' : 'Verify & continue'}
          </button>

          <p className="text-sm text-slate-500 text-center">
            Didn&apos;t get it?{' '}
            <button type="button" onClick={handleResend} className="font-semibold text-blue-700 hover:underline">
              Resend code
            </button>
          </p>
        </form>
      )}
    </main>
  );
}