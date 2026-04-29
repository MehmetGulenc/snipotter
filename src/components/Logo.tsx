interface LogoProps {
  size?: number
  className?: string
}

/**
 * Snipotter brand mark — inline SVG so it stays sharp at any size and is
 * styleable via className. Source of truth lives at /gemini-svg.svg.
 */
export function Logo({ size = 24, className }: LogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="10 10 90 90"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="snipotter_logo_grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#7C3AED" />
        </linearGradient>
      </defs>
      <rect x="20" y="30" width="60" height="60" rx="16" fill="url(#snipotter_logo_grad)" />
      <path
        d="M44 48L56 56H44L56 72"
        stroke="white"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M90 15L92 20L97 22L92 24L90 29L88 24L83 22L88 20L90 15Z" fill="#7C3AED" />
    </svg>
  )
}
