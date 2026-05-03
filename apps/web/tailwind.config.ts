import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(240 10% 4%)',
        foreground: 'hsl(0 0% 98%)',
        card: 'hsl(240 6% 10%)',
        border: 'hsl(240 6% 18%)',
        muted: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(240 5% 65%)' },
        accent: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(0 0% 98%)' },
        primary: { DEFAULT: 'hsl(252 83% 65%)', foreground: 'hsl(0 0% 98%)' },
        destructive: { DEFAULT: 'hsl(0 72% 51%)', foreground: 'hsl(0 0% 98%)' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'wave-letter': 'wave-letter 1.4s ease-in-out',
        'otter-breathe': 'otter-breathe 4s ease-in-out infinite',
      },
      keyframes: {
        // Per-letter wordmark wave; replays on hover via group-hover.
        'wave-letter': {
          '0%, 70%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '40%': { transform: 'translate3d(0, -3px, 0)' },
        },
        // Slow breathing on the "O" of "SnipOtter" — keeps the brand
        // mark alive without distracting from product chrome. Mirrors
        // the same animation in apps/landing/tailwind.config.ts so the
        // mark behaves identically on both surfaces.
        'otter-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.08)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
