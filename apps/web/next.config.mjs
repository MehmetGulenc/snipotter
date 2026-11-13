import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ../../shared/** imports these packages; pin them to this app's copies so the bundle
  // never carries a second React, Tiptap or Yjs. Only these: a blanket resolve.modules
  // override would also steal nested dependencies (e.g. @scure/bip39's own @noble/hashes).
  webpack(config) {
    // React is left to Next.js, which already maps it to its own copy for every file.
    const local = (name) => path.join(here, 'node_modules', name)
    config.resolve.alias = {
      yjs: local('yjs'),
      '@tiptap': local('@tiptap'),
      'lucide-react': local('lucide-react'),
      lowlight: local('lowlight'),
      '@scure/bip39': local('@scure/bip39'),
      '@supabase/supabase-js': local('@supabase/supabase-js'),
      ...config.resolve.alias,
    }
    return config
  },
  reactStrictMode: true,
  // Fully static: every page is 'use client', no server logic needed.
  // Netlify serves the `out/` dir directly — no functions, no edge.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ['lucide-react'],
    externalDir: true,
  },
}

export default nextConfig
