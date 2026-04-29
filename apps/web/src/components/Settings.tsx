'use client'
import { useEffect, useState } from 'react'
import { Copy, Check, Loader2, LogOut, Smartphone, KeyRound, Trash2 } from 'lucide-react'
import { Button } from './ui/Button'
import { useStore } from '@/lib/store'
import { listMembers, createPairCode, leaveWorkspace, signOut, removeWorkspaceMember } from '@/lib/api'
import { relativeTime } from '@/lib/utils'
import type { WorkspaceMember } from '@/lib/types'

export function Settings(): JSX.Element {
  const workspace = useStore((s) => s.workspace)
  const user = useStore((s) => s.user)
  const setWorkspace = useStore((s) => s.setWorkspace)
  const setUser = useStore((s) => s.setUser)

  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [code, setCode] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)

  useEffect(() => {
    if (!workspace || !user) return
    void listMembers(workspace.id, user.id).then(setMembers).catch((e) => console.warn(e))
  }, [workspace?.id, user?.id])

  const onRemoveDevice = async (m: WorkspaceMember): Promise<void> => {
    if (!workspace || !user) return
    if (!confirm(`"${m.deviceName || 'Bu cihaz'}" eşleşmeden çıkarılsın mı?`)) return
    setRemovingId(m.userId)
    try {
      await removeWorkspaceMember(workspace.id, m.userId)
      setMembers((prev) => prev.filter((x) => x.userId !== m.userId))
    } catch (e) {
      alert('Cihaz çıkarılamadı: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setRemovingId(null)
    }
  }

  const onGenerate = async () => {
    setBusy(true)
    try {
      const c = await createPairCode()
      setCode(c)
    } catch (e) {
      alert('Kod oluşturulamadı: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setBusy(false)
    }
  }

  const onCopy = async () => {
    if (!code) return
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  const onLeave = async () => {
    if (!workspace || !user) return
    if (!confirm('Bu cihazı eşleşmeden çıkar? Pano ve notlara erişim kaybolur.')) return
    await leaveWorkspace(workspace.id, user.id)
    setWorkspace(null)
  }

  const onSignOut = async () => {
    if (!confirm('Tamamen çıkış yap? Yeni cihaz bu tarayıcıda anonim oturum başlatacak.')) return
    await signOut()
    setUser(null)
    setWorkspace(null)
    location.reload()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 pb-24 pt-6 sm:px-6">
      <header>
        <h2 className="text-xl font-semibold">Ayarlar</h2>
        <p className="mt-1 text-sm text-muted-foreground">Cihaz bağlantıları ve hesabın.</p>
      </header>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Aktif alan</h3>
          <p className="text-xs text-muted-foreground">
            {workspace ? (
              <>
                <strong>{workspace.name}</strong> · oluşturuldu {relativeTime(workspace.createdAt)}
                {workspace.isOwner ? ' · sahip' : ''}
              </>
            ) : (
              'Yok'
            )}
          </p>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card/40 p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Yeni cihaz bağla</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          6 haneli kod oluştur ve diğer cihazda <strong>Eşleştir</strong> ekranına yaz. Kod 10 dakika geçerlidir.
        </p>

        {code ? (
          <div className="space-y-2">
            <div className="flex items-center justify-center rounded-lg border border-primary/40 bg-primary/5 py-4 text-3xl font-mono font-bold tracking-[0.4em] text-primary">
              {code.slice(0, 3)}-{code.slice(3, 6)}
            </div>
            <Button onClick={onCopy} variant="outline" className="w-full">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Kopyalandı' : 'Kodu kopyala'}
            </Button>
            <button
              onClick={() => setCode(null)}
              className="block w-full pt-1 text-center text-xs text-muted-foreground hover:text-foreground"
            >
              Yeni kod oluştur
            </button>
          </div>
        ) : (
          <Button onClick={onGenerate} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Kod oluştur
          </Button>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-medium">Bağlı cihazlar ({members.length})</h3>
        </div>
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-lg border border-border bg-card/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {m.deviceName || 'Bilinmeyen cihaz'}
                  {m.isSelf && <span className="ml-2 text-[10px] text-primary">bu cihaz</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {m.role === 'owner' ? 'Sahip · ' : ''}
                  Eklendi {relativeTime(m.joinedAt)}
                </div>
              </div>
              {!m.isSelf && (
                <button
                  onClick={() => void onRemoveDevice(m)}
                  disabled={removingId === m.userId}
                  className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                  title="Cihazı eşleşmeden çıkar"
                >
                  {removingId === m.userId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              )}
            </li>
          ))}
          {members.length === 0 && (
            <li className="text-xs text-muted-foreground">Henüz bağlı cihaz yok.</li>
          )}
        </ul>
      </section>

      <section className="space-y-3 border-t border-border pt-6">
        <Button onClick={onLeave} variant="ghost" className="text-destructive hover:bg-destructive/10">
          <LogOut className="h-4 w-4" />
          Bu cihazı eşleşmeden çıkar
        </Button>
        <button
          onClick={onSignOut}
          className="block text-xs text-muted-foreground hover:text-foreground"
        >
          Tamamen çıkış yap
        </button>
      </section>

      <footer className="pt-8 text-center text-[10px] text-muted-foreground">
        Snipotter Web · v0.1.0
      </footer>
    </div>
  )
}
