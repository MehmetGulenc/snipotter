import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', '../../shared/**/*.tsx'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(240 10% 4%)',
        foreground: 'hsl(0 0% 98%)',
        card: 'hsl(240 6% 10%)',
        popover: 'hsl(240 6% 12%)',
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
        'fade-in': 'fade-in 0.15s ease-out both',
        'pop-in': 'pop-in 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2) both',
        'drop-in': 'drop-in 0.25s cubic-bezier(0.2, 0.9, 0.3, 1.1) both',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'scale(1.12)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        'drop-in': {
          from: { opacity: '0', transform: 'translateY(-12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
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
