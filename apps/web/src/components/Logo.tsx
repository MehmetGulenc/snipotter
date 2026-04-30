interface LogoProps {
  size?: number
  className?: string
}

/**
 * Snipotter brand mark for the Next.js web app. The mascot SVG is served as
 * a static asset from /public/logo.svg (same artwork as the landing site and
 * desktop app), so it's cached by the browser separately from the JS bundle.
 */
export function Logo({ size = 24, className }: LogoProps): JSX.Element {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG, no need for next/image optimisation
    <img
      src="/logo.svg"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      draggable={false}
      className={className}
    />
  )
}
