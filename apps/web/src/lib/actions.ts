/**
 * Action bridge (web/iOS side): a computer sends "open this on the phone"
 * records (device_actions); this file loads, watches and consumes them, and
 * keeps the push token for this device in push_tokens.
 */
import { getSupabase } from './supabase'
import { codec } from '@shared/crypto/codec'

export type ActionKind = 'phone' | 'address' | 'iban' | 'url' | 'text'
export type ActionButton = 'call' | 'map' | 'copy' | 'open'

export interface DeviceAction {
  id: string
  kind: ActionKind
  payload: string
  label: string | null
  senderUserId: string | null
  senderDevice: string | null
  createdAt: string
  expiresAt: string
}

interface DeviceActionRow {
  id: string
  kind: ActionKind
  payload: string
  label: string | null
  sender_user_id: string | null
  sender_device: string | null
  created_at: string
  expires_at: string
  consumed_at: string | null
  target_platform: 'ios' | 'any'
}

const fromRow = (r: DeviceActionRow): DeviceAction => ({
  id: r.id,
  kind: r.kind,
  payload: r.payload,
  label: r.label,
  senderUserId: r.sender_user_id,
  senderDevice: r.sender_device,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
})

/** Payload and label are end-to-end encrypted in encrypted workspaces. */
const openAction = async (r: DeviceActionRow): Promise<DeviceAction> => fromRow(await codec().openRow('device_actions', r))

const usable = (r: DeviceActionRow): boolean =>
  !r.consumed_at && new Date(r.expires_at).getTime() > Date.now()

/** Unconsumed, unexpired actions for this workspace, oldest first. */
export async function listPendingActions(workspaceId: string): Promise<DeviceAction[]> {
  const { data, error } = await getSupabase()
    .from('device_actions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('consumed_at', null)
    .gt('expires_at', new Date().toISOString())
    .in('target_platform', ['ios', 'any'])
    .order('created_at', { ascending: true })
    .limit(20)
  if (error) throw error
  return Promise.all(((data ?? []) as DeviceActionRow[]).filter(usable).map(openAction))
}

/** Calls back for every new action of this workspace; returns the unsubscribe. */
export function subscribeActions(workspaceId: string, onAction: (a: DeviceAction) => void): () => void {
  const sb = getSupabase()
  const channel = sb
    .channel(`device-actions:${workspaceId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'device_actions', filter: `workspace_id=eq.${workspaceId}` },
      (payload) => {
        const row = payload.new as DeviceActionRow
        if (row.target_platform !== 'any' && row.target_platform !== 'ios') return
        if (usable(row)) void openAction(row).then(onAction)
      },
    )
    .subscribe()
  return () => {
    void sb.removeChannel(channel)
  }
}

/** Marks an action as handled so it is not shown again on any device. */
export async function consumeAction(id: string): Promise<void> {
  const { error } = await getSupabase()
    .from('device_actions')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', id)
    .is('consumed_at', null)
  if (error) throw error
}

/** The action when it still exists, is unexpired and not yet consumed; otherwise null. */
export async function fetchUsableAction(id: string): Promise<DeviceAction | null> {
  const { data, error } = await getSupabase().from('device_actions').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  const row = data as DeviceActionRow | null
  return row && usable(row) ? openAction(row) : null
}

/** What the primary buttons of an action do. */
export function buttonsFor(kind: ActionKind): ActionButton[] {
  switch (kind) {
    case 'phone':
      return ['call', 'copy']
    case 'address':
      return ['map', 'copy']
    case 'url':
      return ['open', 'copy']
    default:
      return ['copy']
  }
}

export function hrefFor(button: ActionButton, payload: string): string | null {
  if (button === 'call') return `tel:${payload.replace(/[^\d+]/g, '')}`
  if (button === 'map') return `https://maps.apple.com/?q=${encodeURIComponent(payload)}`
  if (button === 'open') return /^https?:\/\//i.test(payload) ? payload : `https://${payload}`
  return null
}

// ── Push token (push_tokens) ───────────────────────────────────────────────────

/** localStorage key: present while notifications are switched on for this device. */
export const PUSH_TOKEN_KEY = 'snipotter.push.token'

export async function savePushToken(args: {
  workspaceId: string
  token: string
  environment: 'sandbox' | 'production'
  deviceName: string
}): Promise<void> {
  const { error } = await getSupabase()
    .from('push_tokens')
    .upsert(
      {
        workspace_id: args.workspaceId,
        token: args.token,
        platform: 'ios',
        environment: args.environment,
        device_name: args.deviceName,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    )
  if (error) throw error
}

export async function deletePushToken(token: string): Promise<void> {
  const { error } = await getSupabase().from('push_tokens').delete().eq('token', token)
  if (error) throw error
}
