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
        'brand-reveal': 'brand-reveal 0.45s ease-out both',
        'logo-glow': 'logo-glow 3.5s ease-in-out infinite',
      },
      keyframes: {
        'wave-letter': {
          '0%, 65%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '35%': { transform: 'translate3d(0, -3px, 0)' },
        },
        'otter-breathe': {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
        },
        'brand-reveal': {
          from: { opacity: '0', transform: 'translateX(-6px) scale(0.82)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'logo-glow': {
          '0%, 100%': { opacity: '0.2', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(1.25)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
