/// <reference types="electron-vite/node" />

interface ImportMetaEnv {
  readonly MAIN_VITE_SUPABASE_URL?: string
  readonly MAIN_VITE_SUPABASE_ANON_KEY?: string
  readonly MAIN_VITE_ANTHROPIC_API_KEY?: string
  readonly MAIN_VITE_GEMINI_API_KEY?: string
  readonly MAIN_VITE_APP_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
