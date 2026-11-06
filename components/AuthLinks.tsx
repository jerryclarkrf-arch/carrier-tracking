'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@/lib/auth/client';

export default function AuthLinks() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <span className="w-8 h-8 rounded-full bg-slate-100 animate-pulse" aria-hidden />;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/account"
          className="px-4 py-2 rounded-lg text-sm font-semibold text-blue-700 border border-blue-300 bg-white hover:bg-blue-50 transition-colors"
        >
          {session.user.name || 'My Account'}
        </Link>
        <button
          type="button"
          onClick={async () => {
            await authClient.signOut();
            router.refresh();
          }}
          className="px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        href="/auth/sign-in"
        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
      >
        Sign in
      </Link>
      <Link
        href="/auth/sign-up"
        className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
      >
        Sign up
      </Link>
    </div>
  );
}