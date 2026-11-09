import { auth } from '@/lib/auth/server';

/**
 * Master/admin access is an email allowlist in the environment:
 *   ADMIN_EMAILS="you@example.com,ops@example.com"
 * No schema change, revocable instantly, and empty by default (no admins).
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const list = adminEmails();
  return list.length > 0 && list.includes(email.toLowerCase());
}

export interface AdminUser {
  id: string;
  email: string | null;
}

/** Returns the signed-in user when they are an admin, otherwise null. */
export async function currentAdmin(): Promise<AdminUser | null> {
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) return null;
  if (!isAdminEmail(user.email)) return null;
  return { id: user.id, email: user.email ?? null };
}
