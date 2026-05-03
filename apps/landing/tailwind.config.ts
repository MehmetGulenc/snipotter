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
        'pulse-ring': 'pulse-ring 2.4s ease-out infinite',
        'sync-flash': 'sync-flash 0.8s ease-out',
        'clip-in': 'clip-in 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
        // Looping demo cycles. We expose a single ~6s "cycle" curve and
        // stagger components by setting `[animation-delay:Xms]` so the
        // entire choreography reads as one fluid story.
        'demo-cycle': 'demo-cycle 6s ease-in-out infinite',
        'key-press': 'key-press 6s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 1.1s step-end infinite',
        'clip-fly': 'clip-fly 6s ease-in-out infinite',
        'popup-open': 'popup-open 6s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'wave-letter': 'wave-letter 1.4s ease-in-out',
        'otter-breathe': 'otter-breathe 4s ease-in-out infinite',
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
        'pulse-ring': {
          '0%': { transform: 'scale(0.6)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'sync-flash': {
          '0%': { backgroundColor: 'hsl(142 76% 50% / 0.25)' },
          '100%': { backgroundColor: 'transparent' },
        },
        'clip-in': {
          '0%': { opacity: '0', transform: 'translateY(-6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        // Generic 6s loop, used to drive multi-step demos. The first 30%
        // is "rest", the middle is "action", the tail returns to rest so
        // the loop is seamless.
        'demo-cycle': {
          '0%, 25%': { opacity: '0.4' },
          '40%, 75%': { opacity: '1' },
          '90%, 100%': { opacity: '0.4' },
        },
        // Single key tap inside a sequence. The shadow + scale signals
        // "pressed", and the animation-delay on each key staggers them.
        'key-press': {
          '0%, 30%': { transform: 'translateY(0)', boxShadow: '0 1px 0 hsl(0 0% 0% / 0.3)' },
          '35%, 45%': {
            transform: 'translateY(2px) scale(0.96)',
            boxShadow: 'inset 0 2px 4px hsl(0 0% 0% / 0.4)',
            backgroundColor: 'hsl(252 83% 65% / 0.5)',
          },
          '60%, 100%': { transform: 'translateY(0)', boxShadow: '0 1px 0 hsl(0 0% 0% / 0.3)' },
        },
        // Editor caret.
        'cursor-blink': {
          '0%, 50%': { opacity: '1' },
          '50.01%, 100%': { opacity: '0' },
        },
        // A clip travels in an arc from the leading device to the trailing
        // one. The keyframes choreograph: rest at left → arc up + right →
        // land on right → fade. translateZ(0) keeps it on a GPU layer.
        'clip-fly': {
          '0%, 30%': { transform: 'translate(0, 0) scale(0.9)', opacity: '0' },
          '38%': { transform: 'translate(20%, -30%) scale(0.95)', opacity: '1' },
          '50%': { transform: 'translate(50%, -45%) scale(1)', opacity: '1' },
          '62%': { transform: 'translate(80%, -30%) scale(0.95)', opacity: '1' },
          '70%, 100%': { transform: 'translate(100%, 0) scale(0.9)', opacity: '0' },
        },
        // Quick Paste / Quick Note popup appearing on cue.
        'popup-open': {
          '0%, 45%': { opacity: '0', transform: 'translateY(8px) scale(0.96)' },
          '55%, 88%': { opacity: '1', transform: 'translateY(0) scale(1)' },
          '95%, 100%': { opacity: '0', transform: 'translateY(8px) scale(0.96)' },
        },
        'pulse-soft': {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.7' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
        // Wordmark stagger — each letter rises 2px and falls back, with
        // delays applied per-letter to produce a left-to-right wave when
        // the page first paints (and again on hover). Uses translate3d
        // so the GPU layer is reused.
        'wave-letter': {
          '0%, 70%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '40%': { transform: 'translate3d(0, -3px, 0)' },
        },
        // The "Otter" half breathes — a slow, gentle scale that draws
        // the eye to the brand mark without ever being distracting.
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
