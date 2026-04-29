/**
 * Snipotter — AI enrichment service
 *
 * Generates a tiny structured summary {summary, tags, language} for a
 * clipboard or note item. Uses Claude Haiku as the primary provider and
 * Gemini Flash as a fallback when Claude fails or is rate-limited.
 *
 * The keys are read from main-process env (MAIN_VITE_*). Hooked into the
 * main process so we never expose API keys to the renderer.
 */
import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type { AISummary } from '@shared/types'

const SYSTEM_PROMPT = `Sen Snipotter adlı uygulamanın AI asistanısın.
Kullanıcının panoya kopyaladığı veya hızlıca yazdığı kısa metni analiz et.
Cevabın MUTLAKA aşağıdaki JSON şemasında olsun, açıklama ekleme:
{
  "summary": "≤120 karakter, içeriği özetleyen tek cümle",
  "tags": ["en fazla 5 küçük harf etiket"],
  "language": "ISO 639-1 dil kodu (örn 'tr', 'en')"
}
Kurallar:
- Eğer içerik kişisel veri / şifre / token içeriyorsa summary alanını "redacted" yap, tags'a "sensitive" ekle.
- Etiketler kısa, tek kelime ya da iki kelime, küçük harf, Türkçe karakter kullanma.
- Yorum ya da ön söz yazma, sadece JSON döndür.`

interface EnrichInput {
  text: string
  /** Optional context: 'clipboard' or 'note' */
  kind?: 'clipboard' | 'note'
}

const PROVIDERS = ['claude-haiku', 'gemini-flash'] as const
type Provider = (typeof PROVIDERS)[number]

interface AIServiceConfig {
  anthropicKey?: string
  geminiKey?: string
  primary: Provider
  /** Per-call timeout in ms. */
  timeoutMs?: number
}

export class AIService {
  private anthropic: Anthropic | null = null
  private gemini: GoogleGenerativeAI | null = null
  private primary: Provider
  private timeoutMs: number
  private available: Record<Provider, boolean>
  /** Circuit breaker: when a provider hits 429/quota, sleep it for N ms so we don't spam logs. */
  private cooldownUntil: Record<Provider, number> = {
    'claude-haiku': 0,
    'gemini-flash': 0,
  }

  constructor(cfg: AIServiceConfig) {
    if (cfg.anthropicKey) {
      this.anthropic = new Anthropic({ apiKey: cfg.anthropicKey })
    }
    if (cfg.geminiKey) {
      this.gemini = new GoogleGenerativeAI(cfg.geminiKey)
    }
    this.primary = cfg.primary
    this.timeoutMs = cfg.timeoutMs ?? 8_000
    this.available = {
      'claude-haiku': !!this.anthropic,
      'gemini-flash': !!this.gemini,
    }
  }

  private isCooling(p: Provider): boolean {
    return this.cooldownUntil[p] > Date.now()
  }

  private cool(p: Provider, retryAfterSec?: number): void {
    // Default 5 min if provider didn't tell us a retry hint.
    const ms = (retryAfterSec ?? 300) * 1000
    this.cooldownUntil[p] = Date.now() + ms
    const mins = Math.round(ms / 60_000)
    console.warn(`[ai] ${p} cooling down for ~${mins}m`)
  }

  isEnabled(): boolean {
    return this.available['claude-haiku'] || this.available['gemini-flash']
  }

  status(): { enabled: boolean; primary: Provider; providers: Record<Provider, boolean> } {
    return { enabled: this.isEnabled(), primary: this.primary, providers: this.available }
  }

  /**
   * Try primary first, fall back to the other provider on any error.
   * Returns null if both providers are unavailable; the UI will simply
   * show the entry without metadata in that case.
   */
  async enrich(input: EnrichInput): Promise<AISummary | null> {
    if (!this.isEnabled()) return null
    const order: Provider[] =
      this.primary === 'claude-haiku'
        ? ['claude-haiku', 'gemini-flash']
        : ['gemini-flash', 'claude-haiku']

    let lastErr: unknown = null
    for (const p of order) {
      if (!this.available[p]) continue
      if (this.isCooling(p)) continue
      try {
        const out = await this.run(p, input)
        if (out) return out
      } catch (err) {
        lastErr = err
        const status = (err as { status?: number }).status
        if (status === 429 || status === 529) {
          // Try to honor RetryInfo if Gemini sent one.
          const details = (err as { errorDetails?: Array<{ '@type': string; retryDelay?: string }> })
            .errorDetails
          const retry = details?.find((d) => d['@type']?.includes('RetryInfo'))?.retryDelay
          const sec = retry ? Math.ceil(parseFloat(retry)) : undefined
          this.cool(p, sec)
        } else {
          console.warn(`[ai] provider ${p} failed:`, (err as Error).message ?? err)
        }
      }
    }

    if (lastErr) {
      const msg = (lastErr as Error).message ?? String(lastErr)
      console.warn('[ai] all providers failed:', msg.slice(0, 200))
    }
    return null
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('AI request timed out')), this.timeoutMs)
      p.then((v) => {
        clearTimeout(t)
        resolve(v)
      }).catch((e) => {
        clearTimeout(t)
        reject(e)
      })
    })
  }

  private async run(provider: Provider, input: EnrichInput): Promise<AISummary | null> {
    const text = input.text.slice(0, 4_000) // hard ceiling
    const userMsg = `İçerik (${input.kind ?? 'metin'}):\n"""${text}"""`

    if (provider === 'claude-haiku' && this.anthropic) {
      const resp = await this.withTimeout(
        this.anthropic.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 256,
          temperature: 0.2,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
        }),
      )
      const block = resp.content?.[0]
      const raw = block && 'text' in block ? block.text : ''
      const parsed = parseJson(raw)
      if (!parsed) return null
      return {
        ...parsed,
        provider: 'claude-haiku',
        tokensIn: resp.usage?.input_tokens,
        tokensOut: resp.usage?.output_tokens,
      }
    }

    if (provider === 'gemini-flash' && this.gemini) {
      const model = this.gemini.getGenerativeModel({
        model: 'gemini-2.0-flash',
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 256,
          responseMimeType: 'application/json',
        },
      })
      const resp = await this.withTimeout(model.generateContent(userMsg))
      const raw = resp.response.text()
      const parsed = parseJson(raw)
      if (!parsed) return null
      return {
        ...parsed,
        provider: 'gemini-flash',
        tokensIn: resp.response.usageMetadata?.promptTokenCount,
        tokensOut: resp.response.usageMetadata?.candidatesTokenCount,
      }
    }

    return null
  }
}

function parseJson(raw: string):
  | (Pick<AISummary, 'summary' | 'tags' | 'language'>)
  | null {
  if (!raw) return null
  // Strip code fences if the model added them.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  try {
    const obj = JSON.parse(cleaned) as Record<string, unknown>
    const summary = typeof obj.summary === 'string' ? obj.summary.slice(0, 200) : ''
    const tags = Array.isArray(obj.tags)
      ? obj.tags.filter((t): t is string => typeof t === 'string').slice(0, 5)
      : []
    const language = typeof obj.language === 'string' ? obj.language.slice(0, 5) : undefined
    if (!summary && tags.length === 0) return null
    return { summary, tags, language }
  } catch {
    return null
  }
}
