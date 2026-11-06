'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setPending(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        setError(error.message || 'Reset failed. The link may be invalid or expired.');
        return;
      }
      setDone(true);
    } catch {
      setError('Reset failed. The link may be invalid or expired.');
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-extrabold text-slate-900">Password reset</h1>
        <p className="text-sm text-slate-500">Your password has been updated.</p>
        <Link href="/auth/sign-in" className="inline-block text-sm font-semibold text-blue-700 hover:underline">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900">Set a new password</h1>
        <p className="text-sm text-slate-500 mt-1">Use the link from your reset email to set a new password.</p>
      </div>

      <div>
        <label htmlFor="password" className={labelCls}>New password</label>
        <input id="password" type="password" required placeholder="••••••••" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label htmlFor="confirm" className={labelCls}>Confirm password</label>
        <input id="confirm" type="password" required placeholder="••••••••" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputCls} />
      </div>

      {error && (
        <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      <button type="submit" disabled={pending && !token} className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors">
        {pending ? 'Resetting…' : 'Reset password'}
      </button>

      <p className="text-sm text-slate-500 text-center">
        <Link href="/auth/sign-in" className="font-semibold text-blue-700 hover:underline">Back to sign in</Link>
      </p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <ResetForm />
      </Suspense>
    </main>
  );
}