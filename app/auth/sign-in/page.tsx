'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInWithEmail } from './actions';

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-600 outline-none';
const labelCls = 'block text-sm font-medium text-slate-700 mb-1';

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center px-4">
      <form action={formAction} className="w-full max-w-md space-y-4 bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome back to Carrier Intelligence.</p>
        </div>

        <div>
          <label htmlFor="email" className={labelCls}>Email address</label>
          <input id="email" name="email" type="email" required placeholder="john@company.com" className={inputCls} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className={labelCls}>Password</label>
            <Link href="/auth/forgot-password" className="text-xs font-semibold text-blue-700 hover:underline">
              Forgot password?
            </Link>
          </div>
          <input id="password" name="password" type="password" required placeholder="••••••••" className={inputCls} />
        </div>

        {state?.error && (
          <div className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2.5 text-sm font-semibold text-white transition-colors"
        >
          {isPending ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-sm text-slate-500 text-center">
          No account?{' '}
          <Link href="/auth/sign-up" className="font-semibold text-blue-700 hover:underline">
            Create one
          </Link>
        </p>
      </form>
    </main>
  );
}