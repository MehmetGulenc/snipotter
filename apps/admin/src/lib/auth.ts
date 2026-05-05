import { getSupabase } from './supabase'

/**
 * Auth model: Supabase magic-link with a hardcoded allowlist of admin
 * emails. Even if someone knows the project URL and gets a magic link
 * for a non-allowlisted email, the guard below signs them out the
 * moment the dashboard mounts.
 *
 * Why magic link rather than a password? The admin only ever needs to
 * log in once per device per week, and we don't want to manage a
 * separate credential store. Magic-link gives us "click an email →
 * you're in" UX without us touching passwords.
 */

function adminEmails(): string[] {
  const raw = process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? ''
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  return adminEmails().includes(email.toLowerCase())
}

export interface SessionUser {
  id: string
  email: string
}

/**
 * Resolve the current admin session, or null. Validates against the
 * email allowlist — if Supabase returns a session for a non-admin email
 * (e.g. the same browser was used to sign into another Snipotter
 * project), we proactively call signOut() so the page can route to the
 * login screen on the next render.
 */
export async function getSession(): Promise<SessionUser | null> {
  const sb = getSupabase()
  const { data, error } = await sb.auth.getSession()
  if (error || !data.session) return null
  const u = data.session.user
  if (!u.email || !isAdminEmail(u.email)) {
    // Eject silently — never expose dashboard data to a stale or
    // attacker-controlled session.
    await sb.auth.signOut()
    return null
  }
  return { id: u.id, email: u.email }
}

export async function sendMagicLink(email: string, redirectTo: string): Promise<void> {
  const sb = getSupabase()
  if (!isAdminEmail(email)) {
    // We deliberately produce the same UX as a successful send so an
    // attacker can't enumerate admin emails by trying random ones.
    // The actual dashboard guard rejects non-admins anyway.
    await new Promise((r) => setTimeout(r, 800))
    return
  }
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  await getSupabase().auth.signOut()
}
