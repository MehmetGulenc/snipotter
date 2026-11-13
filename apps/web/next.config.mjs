import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // ../../shared/** (e.g. the note editor) imports react/@tiptap/yjs; resolve them
  // from this app first so the bundle never carries a second React or Yjs copy.
  webpack(config) {
    config.resolve.modules = [path.join(here, 'node_modules'), ...(config.resolve.modules ?? ['node_modules'])]
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
