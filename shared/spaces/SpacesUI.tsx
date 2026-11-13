import { useEffect, useState } from 'react'
import { Check, ChevronDown, Link2, Loader2, LogOut, Pencil, Plus, UserMinus, UserPlus, Users, X } from 'lucide-react'
import type { Space, SpaceInvite, SpaceMember } from '../crypto/spaces'

/** Platform glue: desktop goes through IPC, iOS/web call shared/crypto/spaces directly. */
export interface SpacesApi {
  create(name: string, myName: string): Promise<Space>
  join(input: string, myName: string): Promise<Space>
  /** Name of the space behind an invite link, before joining. */
  preview(input: string): Promise<{ name: string }>
  invite(spaceId: string): Promise<SpaceInvite>
  members(spaceId: string): Promise<SpaceMember[]>
  rename(spaceId: string, name: string): Promise<void>
  /** target null = leave the space yourself. */
  remove(spaceId: string, target: string | null): Promise<void>
  open(spaceId: string | null): Promise<void>
  copy(text: string): Promise<void>
  /** iOS share sheet; when absent the link is copied. */
  share?(text: string): Promise<void>
}

const errText = (err: unknown): string => (err as Error)?.message || 'İşlem yapılamadı'
const field = 'h-11 w-full rounded-xl border border-border bg-card px-3 text-[16px] outline-none focus:border-primary'
const primary = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50'

type Dialog = { kind: 'new' } | { kind: 'join'; input: string } | { kind: 'people' } | null

/**
 * Everything about shared spaces in one place at the top of the notes list:
 * "Notlarım ▾" menu, and for an open space a "Kişiler" button.
 */
export function SpaceBar({ api, spaces, activeId, myName, pendingInvite, onInviteHandled, mobile }: {
  api: SpacesApi
  spaces: Space[]
  activeId: string | null
  /** Remembered display name; asked only when empty. */
  myName: string
  /** Invite link opened from outside (snipotter://katil#…). */
  pendingInvite?: string | null
  onInviteHandled?: () => void
  mobile?: boolean
}): JSX.Element {
  const [menu, setMenu] = useState(false)
  const [dialog, setDialog] = useState<Dialog>(null)
  const active = spaces.find((s) => s.id === activeId) ?? null

  useEffect(() => {
    if (pendingInvite) setDialog({ kind: 'join', input: pendingInvite })
  }, [pendingInvite])

  const close = (): void => {
    if (dialog?.kind === 'join') onInviteHandled?.()
    setDialog(null)
  }
  const pick = (id: string | null): void => {
    setMenu(false)
    if (id !== activeId) void api.open(id)
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <div className="relative min-w-0">
        <button type="button" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}
          className="flex h-9 max-w-full items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-accent">
          {active && <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
          <span className="truncate">{active ? active.name : 'Notlarım'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} aria-hidden="true" />
            <div role="menu" className="absolute left-0 top-10 z-50 w-60 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
              <MenuItem selected={!activeId} onClick={() => pick(null)} label="Notlarım" />
              {spaces.map((s) => (
                <MenuItem key={s.id} selected={s.id === activeId} onClick={() => pick(s.id)} label={s.name} shared />
              ))}
              <div className="my-1 h-px bg-border" />
              <MenuAction icon={<Plus className="h-4 w-4" />} label="Yeni ortak alan" onClick={() => { setMenu(false); setDialog({ kind: 'new' }) }} />
              <MenuAction icon={<Link2 className="h-4 w-4" />} label="Davete katıl" onClick={() => { setMenu(false); setDialog({ kind: 'join', input: '' }) }} />
            </div>
          </>
        )}
      </div>
      {active && (
        <button type="button" onClick={() => setDialog({ kind: 'people' })}
          className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-medium text-primary hover:bg-primary/20">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" /> Kişiler
        </button>
      )}

      {dialog && (
        <Sheet mobile={mobile} onClose={close}
          title={dialog.kind === 'new' ? 'Yeni ortak alan' : dialog.kind === 'join' ? 'Davete katıl' : active?.name ?? ''}>
          {dialog.kind === 'new' && <NewSpace api={api} myName={myName} onDone={close} />}
          {dialog.kind === 'join' && <JoinSpace api={api} myName={myName} initial={dialog.input} onDone={close} />}
          {dialog.kind === 'people' && active && <People api={api} space={active} onLeft={close} />}
        </Sheet>
      )}
    </div>
  )
}

function MenuItem({ selected, onClick, label, shared }: { selected: boolean; onClick: () => void; label: string; shared?: boolean }): JSX.Element {
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} onClick={onClick}
      className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-accent">
      {shared ? <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" /> : <span className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  )
}

function MenuAction({ icon, label, onClick }: { icon: JSX.Element; label: string; onClick: () => void }): JSX.Element {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-primary hover:bg-accent">
      {icon} {label}
    </button>
  )
}

function Sheet({ title, mobile, onClose, children }: { title: string; mobile?: boolean; onClose: () => void; children: React.ReactNode }): JSX.Element {
  return (
    <div className={`fixed inset-0 z-[60] flex bg-black/50 ${mobile ? 'items-end' : 'items-center justify-center p-6'}`} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className={mobile
          ? 'max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border-t border-border bg-background px-4 pb-[max(env(safe-area-inset-bottom),16px)] pt-3'
          : 'max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-2xl'}>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-[17px] font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-accent">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function useRun(): { busy: boolean; error: string | null; run: (fn: () => Promise<void>) => Promise<void> } {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

const ErrorText = ({ error }: { error: string | null }): JSX.Element | null =>
  error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null

function NewSpace({ api, myName, onDone }: { api: SpacesApi; myName: string; onDone: () => void }): JSX.Element {
  const [name, setName] = useState('')
  const [me, setMe] = useState(myName)
  const { busy, error, run } = useRun()
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.create(name, me); onDone() }) }} className="space-y-3">
      <p className="text-sm text-muted-foreground">Eşinle, ailenle ya da arkadaşlarınla notları birlikte yazın. Pano geçmişin yalnızca sende kalır.</p>
      <input className={field} value={name} maxLength={60} autoFocus placeholder="Alanın adı (ör. Ev)" aria-label="Alanın adı" onChange={(e) => setName(e.target.value)} />
      {!myName && <input className={field} value={me} maxLength={40} placeholder="Adın (diğerleri görür)" aria-label="Adın" onChange={(e) => setMe(e.target.value)} />}
      <button type="submit" className={primary} disabled={busy || !name.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Oluştur
      </button>
      <ErrorText error={error} />
    </form>
  )
}

function JoinSpace({ api, myName, initial, onDone }: { api: SpacesApi; myName: string; initial: string; onDone: () => void }): JSX.Element {
  const [input, setInput] = useState(initial)
  const [me, setMe] = useState(myName)
  const [preview, setPreview] = useState<{ name: string } | null>(null)
  const { busy, error, run } = useRun()

  // An invite opened from a link: show which space it is right away.
  useEffect(() => {
    if (initial) void run(async () => setPreview(await api.preview(initial)))
  }, [initial])

  if (preview) {
    return (
      <div className="space-y-3 text-center">
        <Users className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
        <p className="text-[15px]"><b>{preview.name}</b> alanına davet edildin.</p>
        {!myName && <input className={field} value={me} maxLength={40} placeholder="Adın (diğerleri görür)" aria-label="Adın" onChange={(e) => setMe(e.target.value)} />}
        <button type="button" className={primary} disabled={busy} onClick={() => void run(async () => { await api.join(input, me); onDone() })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Katıl
        </button>
        <ErrorText error={error} />
      </div>
    )
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); void run(async () => setPreview(await api.preview(input))) }} className="space-y-3">
      <p className="text-sm text-muted-foreground">Sana gönderilen davet bağlantısını yapıştır.</p>
      <input className={field} value={input} autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false}
        placeholder="https://snipotter.com/katil#…" aria-label="Davet bağlantısı" onChange={(e) => setInput(e.target.value)} />
      <button type="submit" className={primary} disabled={busy || !input.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Devam
      </button>
      <ErrorText error={error} />
    </form>
  )
}

function People({ api, space, onLeft }: { api: SpacesApi; space: Space; onLeft: () => void }): JSX.Element {
  const [members, setMembers] = useState<SpaceMember[] | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const { busy, error, run } = useRun()
  const load = (): void => { api.members(space.id).then(setMembers, () => setMembers([])) }
  useEffect(load, [space.id])

  const invite = (): Promise<void> => run(async () => {
    const { link } = await api.invite(space.id)
    const text = `Snipotter'da "${space.name}" ortak alanına katıl: ${link}`
    if (api.share) await api.share(text)
    else {
      await api.copy(link)
      setDone('Davet bağlantısı kopyalandı. Davet etmek istediğin kişiye gönder; tek kişilik ve 7 gün geçerli.')
    }
  })

  return (
    <div className="space-y-4">
      <button type="button" className={primary} disabled={busy} onClick={() => void invite()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Kişi davet et
      </button>
      {done && <p className="rounded-xl bg-primary/10 p-3 text-sm text-primary" role="status">{done}</p>}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {!members && <li className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></li>}
        {members?.map((m) => (
          <li key={m.personId} className="flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary" aria-hidden="true">
              {m.name.slice(0, 1).toLocaleUpperCase('tr')}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">{m.name}{m.isMe ? ' (sen)' : ''}</span>
            {space.isOwner && !m.isMe && (
              <button type="button" aria-label={`${m.name} kişisini çıkar`} disabled={busy}
                onClick={() => { if (window.confirm(`${m.name} bu alandan çıkarılsın mı?`)) void run(async () => { await api.remove(space.id, m.personId); load() }) }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-destructive">
                <UserMinus className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {renaming !== null && (
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { await api.rename(space.id, renaming); setRenaming(null) }) }}>
          <input className={`${field} min-w-0 flex-1`} value={renaming} maxLength={60} autoFocus aria-label="Alanın yeni adı" onChange={(e) => setRenaming(e.target.value)} />
          <button type="submit" disabled={!renaming.trim() || busy} className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Kaydet</button>
        </form>
      )}

      <div className="flex items-center justify-between text-sm">
        {renaming === null ? (
          <button type="button" className="flex h-9 items-center gap-1.5 text-muted-foreground hover:text-foreground" onClick={() => setRenaming(space.name)}>
            <Pencil className="h-3.5 w-3.5" /> Adını değiştir
          </button>
        ) : <span />}
        <button type="button" disabled={busy} className="flex h-9 items-center gap-1.5 text-destructive"
          onClick={() => {
            const alone = (members?.length ?? 0) <= 1
            const ok = window.confirm(alone
              ? `"${space.name}" alanından çıkarsan alanda kimse kalmaz ve notları silinir. Emin misin?`
              : `"${space.name}" alanından çıkılsın mı? Notlar diğer kişilerde kalır.`)
            if (ok) void run(async () => { await api.remove(space.id, null); onLeft() })
          }}>
          <LogOut className="h-3.5 w-3.5" /> Alandan çık
        </button>
      </div>
      <ErrorText error={error} />
    </div>
  )
}
