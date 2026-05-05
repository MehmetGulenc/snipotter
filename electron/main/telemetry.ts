/**
 * Snipotter — Anonymous heartbeat telemetry
 *
 * Tek görevi var: uygulama her açıldığında api.snipotter.com/heartbeat
 * endpoint'ine bir POST atmak. admin.snipotter.com bu sinyalleri
 * okuyup "kaç aktif kurulum var, DAU/WAU/MAU ne, hangi platformlar
 * hangi sürümleri çalıştırıyor" sorularına yanıt verir.
 *
 * Gönderilen alanlar (tamamı opsiyonel veya kasıtlı anonim):
 *   • appSlug   — sabit "snipotter-desktop"
 *   • deviceId  — Electron userData içinde rastgele üretilmiş bir UUID;
 *                 hiçbir kullanıcı kimliğine bağlı değil. Cihaz başına
 *                 bir kez üretilir, sonra sabit kalır.
 *   • platform  — `${process.platform}-${process.arch}` (e.g. darwin-arm64)
 *   • version   — app.getVersion() (electron-builder package.json'dan)
 *   • language  — app.getLocale() (e.g. tr, en-US)
 *
 * Gönderilmeyen alanlar (kasıtlı):
 *   • IP adresi (Cloudflare worker zaten saklamaz)
 *   • E-posta, hesap kimliği, Supabase user_id
 *   • Workspace bilgisi
 *   • Pano içeriği
 *
 * Kullanıcı Settings → Gizlilik → "Anonim telemetri" kapatırsa bu modül
 * sessizce skip eder; sonraki açılışta yeniden ping atılmaz.
 */
import { app, net } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { settingsStore } from './store'

const HEARTBEAT_URL =
  process.env.SNIPOTTER_HEARTBEAT_URL ?? 'https://api.snipotter.com/heartbeat'
const APP_SLUG = 'snipotter-desktop'

interface DeviceIdSchema {
  // Cihaz kimliği — rastgele UUID. Adı kasıtlı olarak generic; bu store'a
  // başka tek bir alan daha koymuyoruz, gizlilik açısından temiz kalsın.
  deviceId: string
}

const deviceStore = new Store<DeviceIdSchema>({
  name: 'snipotter-device',
  defaults: { deviceId: '' },
})

/** Cihaza özel kalıcı UUID. İlk çağrıda üretilir; sonrasında aynı kalır. */
function ensureDeviceId(): string {
  let id = deviceStore.get('deviceId')
  if (!id) {
    id = randomUUID()
    deviceStore.set('deviceId', id)
  }
  return id
}

/** Public — main process'in app.whenReady() callback'inden çağrılır. */
export async function sendLaunchHeartbeat(): Promise<void> {
  const settings = settingsStore.get()
  if (!settings.telemetryEnabled) return

  const body = {
    appSlug: APP_SLUG,
    deviceId: ensureDeviceId(),
    platform: `${process.platform}-${process.arch}`,
    version: app.getVersion(),
    language: app.getLocale(),
  }

  try {
    // electron.net.fetch kullanıyoruz çünkü Node fetch'in aksine sistem
    // proxy + sertifika ayarlarını otomatik kullanır — kurumsal ağlarda
    // çalışmamayı engeller. 5 saniye sonrası timeout; admin paneli için
    // tek seferlik yapılan bu çağrı uygulama başlatma süresini
    // bloklamamalı.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    await net.fetch(HEARTBEAT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)
  } catch {
    // Hiçbir koşulda kullanıcıya hata göstermiyoruz; offline / proxy
    // arkasında / endpoint geçici 5xx — ne olursa olsun uygulama
    // çalışmaya devam etmeli.
  }
}
