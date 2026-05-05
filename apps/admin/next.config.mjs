/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Static export so we can ship via Cloudflare Workers Static Assets the
  // same way apps/landing and apps/web do. Every page is 'use client'
  // because admin reads from Supabase via the JS client; no server
  // routes, no edge functions on this side.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
}

export default nextConfig
