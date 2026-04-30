import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(240 10% 4%)',
        foreground: 'hsl(0 0% 98%)',
        card: 'hsl(240 6% 10%)',
        border: 'hsl(240 6% 18%)',
        muted: { DEFAULT: 'hsl(240 4% 16%)', foreground: 'hsl(240 5% 65%)' },
        primary: { DEFAULT: 'hsl(252 83% 65%)', foreground: 'hsl(0 0% 98%)' },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fade-in 0.6s ease-out',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
      },
    },
  },
  plugins: [],
}

export default config
