'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authClient } from '@/lib/auth/client';

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: window.location.origin + '/auth/reset-password',
      });
      if (error) {
        setError(error.message || 'Could not send the reset email');
        return;
      }
      setSent(true);
    } catch {
      setError('Could not send the reset email');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      {sent ? (
        <div className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
          <h1 className="text-2xl font-extrabold text-slate-900">Check your email</h1>
          <p className="text-sm text-slate-500">
            If an account exists for <strong className="text-slate-700">{email}</strong>, a password reset link has been
            sent. The link expires after 15 minutes.
          </p>
          <Link href="/auth/sign-in" className="inline-block text-sm font-semibold text-blue-700 hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Reset password</h1>
            <p className="text-sm text-slate-500 mt-1">Enter your account email and we&apos;ll send a reset link.</p>
          </div>

          <div>
            <label htmlFor="email" className={labelCls}>Email address</label>
            <input id="email" type="email" required placeholder="john@company.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>

          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
          )}

          <button type="submit" disabled={pending} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
            {pending ? 'Sending…' : 'Send reset link'}
          </button>

          <p className="text-sm text-slate-500 text-center">
            Remembered it?{' '}
            <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">Sign in</Link>
          </p>
        </form>
      )}
    </main>
  );
}