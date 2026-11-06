'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import AuthLinks from '@/components/AuthLinks';

const SNAPSHOT_URL = process.env.NEXT_PUBLIC_SNAPSHOT_URL || 'https://carrier-snapshot.vercel.app';

export default function Nav() {
  const path = usePathname();
  const link = (href: string, label: string) => {
    const active = href === '/' ? path === '/' : path.startsWith(href);
    return (
      <Link
        href={href}
        className={`px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${
          active ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="bg-white border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-blue-600 text-white grid place-items-center font-extrabold">
            LT
          </span>
          <span className="leading-tight">
            <span className="block text-sm font-extrabold text-slate-900">Carrier Load Track</span>
            <span className="block text-[10px] font-medium text-slate-400 uppercase tracking-wide">
              Live load visibility
            </span>
          </span>
        </Link>
        <div className="flex items-center gap-3">
          <nav className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1">
            {link('/', 'Loads')}
          </nav>
          <a
            href={SNAPSHOT_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-700"
          >
            Carrier Snapshot ↗
          </a>
          <AuthLinks />
        </div>
      </div>
    </header>
  );
}
