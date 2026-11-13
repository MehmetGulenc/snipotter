import { createContext, useContext, useEffect, useState } from 'react'

/** Notes reference Storage images as `snipotter-asset:<workspace>/<note>/<file>`. */
export const ASSET_PREFIX = 'snipotter-asset:'

export interface NoteAssets {
  /** Stores an image and returns its `snipotter-asset:` reference. */
  upload(image: Blob, noteId: string): Promise<string>
  /** Short-lived URL for displaying a reference. */
  signedUrl(path: string): Promise<string>
}

export const NoteAssetsContext = createContext<NoteAssets | null>(null)

const isAsset = (src: string): boolean => src.startsWith(ASSET_PREFIX)
export const assetPath = (src: string): string => src.slice(ASSET_PREFIX.length)

// Signed URLs last an hour; reuse them for 50 minutes.
const TTL_MS = 50 * 60 * 1000
const cache = new Map<string, { url: Promise<string>; at: number }>()

export function resolveAsset(assets: NoteAssets, src: string): Promise<string> {
  if (!isAsset(src)) return Promise.resolve(src)
  const hit = cache.get(src)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url
  const url = assets.signedUrl(assetPath(src))
  cache.set(src, { url, at: Date.now() })
  url.catch(() => cache.delete(src))
  return url
}

/** Displayable `src` for an image node: plain URLs pass through, references are signed. */
export function useAssetSrc(src: string): string | undefined {
  const assets = useContext(NoteAssetsContext)
  const [url, setUrl] = useState<string | undefined>(isAsset(src) ? undefined : src)
  useEffect(() => {
    if (!isAsset(src)) {
      setUrl(src)
      return
    }
    if (!assets) return
    let alive = true
    resolveAsset(assets, src).then((u) => alive && setUrl(u)).catch(() => alive && setUrl(undefined))
    return () => { alive = false }
  }, [src, assets])
  return url
}

/** Scales a photo down to at most `max` px and encodes it as JPEG. */
export function shrinkImageBlob(file: Blob, max = 1600): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Görsel işlenemedi'))
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Görsel işlenemedi'))), 'image/jpeg', 0.85)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Fotoğraf okunamadı'))
    }
    img.src = url
  })
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob()
}
