/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Fully static: every page is 'use client', no server logic needed.
  // Netlify serves the `out/` dir directly — no functions, no edge.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
}

export default nextConfig
