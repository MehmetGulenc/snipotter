import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Copy, Crown, Link2, Loader2, LogOut, Pencil, Plus, Share2, UserMinus, Users, X } from 'lucide-react'
import type { Space, SpaceInvite, SpaceMember } from '../crypto/spaces'

/** Platform glue: desktop goes through IPC, iOS/web call shared/crypto/spaces directly. */
export interface SpacesApi {
  create(name: string, myName: string): Promise<Space>
  join(input: string, myName: string): Promise<Space>
  invite(spaceId: string): Promise<SpaceInvite>
  members(spaceId: string): Promise<SpaceMember[]>
  rename(spaceId: string, name: string): Promise<void>
  /** target null = leave the space yourself. */
  remove(spaceId: string, target: string | null): Promise<void>
  open(spaceId: string | null): Promise<void>
  copy(text: string): Promise<void>
  /** iOS share sheet; falls back to copy when absent. */
  share?(text: string): Promise<void>
}

const errText = (err: unknown): string => (err as Error)?.message || 'İşlem yapılamadı'

/** "Notlarım ▾" menu at the top of the notes list. */
export function SpaceSwitcher({ spaces, activeId, onOpen, onManage }: {
  spaces: Space[]
  activeId: string | null
  onOpen: (id: string | null) => void
  onManage: () => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const active = spaces.find((s) => s.id === activeId)
  const pick = (id: string | null): void => {
    setOpen(false)
    if (id !== activeId) onOpen(id)
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex h-9 max-w-full items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-accent"
      >
        {active ? <Users className="h-4 w-4 shrink-0 text-primary" /> : null}
        <span className="truncate">{active ? active.name : 'Notlarım'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="menu" className="absolute left-0 top-10 z-50 w-64 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-xl">
            <MenuRow selected={!activeId} onClick={() => pick(null)} label="Notlarım" hint="Yalnızca sen" />
            {spaces.map((s) => (
              <MenuRow key={s.id} selected={s.id === activeId} onClick={() => pick(s.id)} label={s.name} hint="Ortak alan" icon />
            ))}
            <div className="my-1 h-px bg-border" />
            <button type="button" role="menuitem" onClick={() => { setOpen(false); onManage() }}
              className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-primary hover:bg-accent">
              <Plus className="h-4 w-4" /> Ortak alanlar
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function MenuRow({ selected, onClick, label, hint, icon }: { selected: boolean; onClick: () => void; label: string; hint: string; icon?: boolean }): JSX.Element {
  return (
    <button type="button" role="menuitemradio" aria-checked={selected} onClick={onClick}
      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent">
      {icon ? <Users className="h-4 w-4 shrink-0 text-primary" /> : <span className="h-4 w-4 shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{label}</span>
        <span className="block text-[11px] text-muted-foreground">{hint}</span>
      </span>
      {selected && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </button>
  )
}

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'join' } | { kind: 'space'; id: string }

/** Full management screen: create, join, invite, members, rename, leave. */
export function SpacesPanel({ api, spaces, activeId, defaultName, onClose, initialJoin }: {
  api: SpacesApi
  spaces: Space[]
  activeId: string | null
  /** Suggested display name (device owner's name), editable. */
  defaultName: string
  onClose: () => void
  /** Invite link opened from outside (e.g. snipotter://katil#…). */
  initialJoin?: string
}): JSX.Element {
  const [view, setView] = useState<View>(initialJoin ? { kind: 'join' } : spaces.length ? { kind: 'list' } : { kind: 'create' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [myName, setMyName] = useState(defaultName)
  const [joinInput, setJoinInput] = useState(initialJoin ?? '')

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

  const input = 'h-11 w-full rounded-xl border border-border bg-card px-3 text-[16px] outline-none focus:border-primary'
  const primary = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50'
  const secondary = 'flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium hover:bg-accent disabled:opacity-50'

  const space = view.kind === 'space' ? spaces.find((s) => s.id === view.id) : undefined
  const title = view.kind === 'create' ? 'Yeni ortak alan' : view.kind === 'join' ? 'Davete katıl' : space ? space.name : 'Ortak alanlar'

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
        {view.kind !== 'list' && spaces.length > 0 && (
          <button type="button" className="text-sm text-primary" onClick={() => { setError(null); setView({ kind: 'list' }) }}>Geri</button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Kapat" className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {view.kind === 'list' && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ortak alanda notlarını eşinle, ailenle ya da arkadaşlarınla birlikte yazarsın. Herkes aynı notu aynı anda düzenleyebilir;
              içerik uçtan uca şifreli kalır. Pano geçmişin her zaman yalnızca sende.
            </p>
            <ul className="space-y-2">
              {spaces.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => setView({ kind: 'space', id: s.id })}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left hover:bg-accent">
                    <Users className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                    {s.id === activeId && <span className="text-xs text-primary">Açık</span>}
                    {s.isOwner && <Crown className="h-3.5 w-3.5 text-muted-foreground" aria-label="Kurucu" />}
                  </button>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className={secondary} onClick={() => setView({ kind: 'create' })}><Plus className="h-4 w-4" /> Yeni alan</button>
              <button type="button" className={secondary} onClick={() => setView({ kind: 'join' })}><Link2 className="h-4 w-4" /> Davete katıl</button>
            </div>
          </div>
        )}

        {view.kind === 'create' && (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-muted-foreground">Alanın adı</span>
              <input className={`${input} mt-1`} value={name} maxLength={60} placeholder="ör. Ev, Aile, Tatil planı" onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-sm text-muted-foreground">Diğerleri seni nasıl görsün?</span>
              <input className={`${input} mt-1`} value={myName} maxLength={40} placeholder="Adın" onChange={(e) => setMyName(e.target.value)} />
            </label>
            <button type="button" className={primary} disabled={busy || !name.trim()}
              onClick={() => void run(async () => { const s = await api.create(name, myName); setName(''); setView({ kind: 'space', id: s.id }) })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Oluştur
            </button>
            {spaces.length === 0 && (
              <button type="button" className={secondary} onClick={() => setView({ kind: 'join' })}><Link2 className="h-4 w-4" /> Bir davetim var</button>
            )}
          </div>
        )}

        {view.kind === 'join' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Sana gönderilen davet bağlantısını ya da 12 kelimeyi yapıştır.</p>
            <textarea className="w-full rounded-xl border border-border bg-card p-3 text-[16px] outline-none focus:border-primary" rows={3}
              value={joinInput} autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="https://snipotter.com/katil#…" onChange={(e) => setJoinInput(e.target.value)} />
            <label className="block">
              <span className="text-sm text-muted-foreground">Diğerleri seni nasıl görsün?</span>
              <input className={`${input} mt-1`} value={myName} maxLength={40} placeholder="Adın" onChange={(e) => setMyName(e.target.value)} />
            </label>
            <button type="button" className={primary} disabled={busy || !joinInput.trim()}
              onClick={() => void run(async () => { const s = await api.join(joinInput, myName); setJoinInput(''); setView({ kind: 'space', id: s.id }) })}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Katıl
            </button>
          </div>
        )}

        {view.kind === 'space' && space && (
          <SpaceDetail key={space.id} api={api} space={space} isActive={space.id === activeId}
            onLeft={() => setView({ kind: spaces.length > 1 ? 'list' : 'create' })} onClose={onClose} />
        )}

        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      </div>
    </div>
  )
}

function SpaceDetail({ api, space, isActive, onLeft, onClose }: {
  api: SpacesApi
  space: Space
  isActive: boolean
  onLeft: () => void
  onClose: () => void
}): JSX.Element {
  const [members, setMembers] = useState<SpaceMember[] | null>(null)
  const [invite, setInvite] = useState<SpaceInvite | null>(null)
  const [copied, setCopied] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    api.members(space.id).then(setMembers, (err) => setError(errText(err)))
  }, [api, space.id])
  useEffect(load, [load])

  const run = async (tag: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(tag)
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(errText(err))
    } finally {
      setBusy(null)
    }
  }

  const shareText = invite
    ? `Snipotter'da "${space.name}" ortak alanına katıl:\n${invite.link}\n\nYa da uygulamada Ortak alanlar → Davete katıl ekranına bu 12 kelimeyi yaz:\n${invite.words.join(' ')}`
    : ''
  const days = invite ? Math.max(1, Math.round((invite.expiresAt - Date.now()) / 86_400_000)) : 0

  return (
    <div className="space-y-5">
      {!isActive && (
        <button type="button" onClick={() => void run('open', async () => { await api.open(space.id); onClose() })}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
          {busy === 'open' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Bu alanın notlarını aç
        </button>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kişi davet et</h3>
        {!invite ? (
          <button type="button" disabled={busy !== null} onClick={() => void run('invite', async () => setInvite(await api.invite(space.id)))}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium hover:bg-accent disabled:opacity-50">
            {busy === 'invite' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Davet bağlantısı oluştur
          </button>
        ) : (
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">
              Tek kişilik ve tek kullanımlık; {days} gün geçerli. Bağlantıyı yalnızca davet ettiğin kişiye gönder: bağlantıya sahip olan alana katılır.
            </p>
            <p className="break-all rounded-lg bg-muted px-2 py-1.5 font-mono text-[11px]">{invite.link}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="flex h-10 items-center justify-center gap-1.5 rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                onClick={() => void run('share', async () => {
                  if (api.share) await api.share(shareText)
                  else { await api.copy(shareText); setCopied(true) }
                })}>
                <Share2 className="h-4 w-4" /> {api.share ? 'Gönder' : copied ? 'Kopyalandı' : 'Daveti kopyala'}
              </button>
              <button type="button" className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-border text-sm"
                onClick={() => void run('newinvite', async () => { setCopied(false); setInvite(await api.invite(space.id)) })}>
                <Plus className="h-4 w-4" /> Başka kişi
              </button>
            </div>
            {api.share && (
              <button type="button" className="flex h-9 w-full items-center justify-center gap-1.5 text-xs text-muted-foreground"
                onClick={() => void run('copy', async () => { await api.copy(invite.link); setCopied(true) })}>
                <Copy className="h-3.5 w-3.5" /> {copied ? 'Bağlantı kopyalandı' : 'Yalnızca bağlantıyı kopyala'}
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kişiler</h3>
        {!members ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {members.map((m) => (
              <li key={m.personId} className="flex items-center gap-2 px-3 py-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {m.name.slice(0, 1).toLocaleUpperCase('tr')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{m.name}{m.isMe ? ' (sen)' : ''}</span>
                  {m.isOwner && <span className="block text-[11px] text-muted-foreground">Kurucu</span>}
                </span>
                {space.isOwner && !m.isMe && (
                  <button type="button" aria-label={`${m.name} kişisini çıkar`} disabled={busy !== null}
                    onClick={() => void run(`rm-${m.personId}`, async () => { await api.remove(space.id, m.personId); load() })}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-destructive">
                    {busy === `rm-${m.personId}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        {renaming === null ? (
          <button type="button" onClick={() => setRenaming(space.name)}
            className="flex h-11 w-full items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-accent">
            <Pencil className="h-4 w-4" /> Adını değiştir
          </button>
        ) : (
          <div className="flex gap-2">
            <input className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-[16px] outline-none focus:border-primary"
              value={renaming} maxLength={60} onChange={(e) => setRenaming(e.target.value)} />
            <button type="button" disabled={!renaming.trim() || busy !== null}
              onClick={() => void run('rename', async () => { await api.rename(space.id, renaming); setRenaming(null) })}
              className="h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">Kaydet</button>
          </div>
        )}
        <button type="button" disabled={busy !== null}
          onClick={() => {
            const alone = (members?.length ?? 0) <= 1
            const ok = window.confirm(alone
              ? `"${space.name}" alanından çıkarsan alanda kimse kalmaz ve tüm notları silinir. Emin misin?`
              : `"${space.name}" alanından çıkılsın mı? Notları diğer kişilerde kalır; sen artık göremezsin.`)
            if (ok) void run('leave', async () => { await api.remove(space.id, null); onLeft() })
          }}
          className="flex h-11 w-full items-center gap-2 rounded-xl border border-border px-3 text-sm text-destructive hover:bg-destructive/10">
          {busy === 'leave' ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Alandan çık
        </button>
      </section>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}
