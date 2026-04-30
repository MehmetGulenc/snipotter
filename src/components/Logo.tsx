import logoUrl from '@/assets/logo.svg'

interface LogoProps {
  size?: number
  className?: string
}

/**
 * Snipotter brand mark. Source of truth is `src/assets/logo.svg` — the
 * mascot character cropped from the master snipotter.svg artwork (wordmark
 * glyphs stripped). Rendered via <img> so Vite fingerprints the asset and
 * the multi-KB SVG isn't duplicated into the JS bundle for every consumer.
 */
export function Logo({ size = 24, className }: LogoProps): JSX.Element {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
    />
  )
}
