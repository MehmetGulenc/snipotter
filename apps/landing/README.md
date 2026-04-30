# Snipotter Landing Page

Marketing landing page for `snipotter.com`. The desktop / web app workspace
lives in `apps/web` and is deployed under `app.snipotter.com`.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS (same theme palette as the PWA / desktop app)
- Lucide icons
- ~50KB total payload, no external trackers

## Local development

```bash
cd apps/landing
npm install
npm run dev
```

Default port: `5173`.

## Build

```bash
npm run build      # outputs dist/
npm run preview    # serve dist/ locally
```

## Netlify deploy (free tier)

You'll create **a second** Netlify site separate from the existing PWA site.

1. Netlify dashboard → **Add new site → Import an existing project**.
2. Pick the same `MehmetGulenc/snipotter` repo on GitHub.
3. Set the **base directory** to `apps/landing`.
4. Build command: `npm run build` · Publish directory: `apps/landing/dist`.
   (Netlify reads the `netlify.toml` in this folder, so these are pre-filled.)
5. Deploy.

Netlify will assign a random `*.netlify.app` URL — verify the build is green.

## Connect snipotter.com (GoDaddy)

We want:

- `snipotter.com` → this landing site
- `app.snipotter.com` → the existing `apps/web` PWA site

### In Netlify (landing site)

1. Site settings → **Domain management → Add custom domain**.
2. Type `snipotter.com` and confirm.
3. Netlify shows DNS records you must add at GoDaddy.

### In Netlify (existing PWA site)

1. Open the existing PWA site's settings → **Domain management → Add custom domain**.
2. Type `app.snipotter.com` and confirm.

### In GoDaddy DNS

Open `snipotter.com` → **DNS Management** and add these records:

| Type   | Name | Value                              | TTL    |
| ------ | ---- | ---------------------------------- | ------ |
| A      | @    | `75.2.60.5`                        | 1 hour |
| CNAME  | www  | `<your-landing-site>.netlify.app`  | 1 hour |
| CNAME  | app  | `<your-pwa-site>.netlify.app`      | 1 hour |

> The `A` record IP `75.2.60.5` is Netlify's load balancer. If Netlify shows a
> different value in your dashboard, prefer that one.

DNS propagation usually takes 5-30 minutes. Netlify will auto-issue Let's
Encrypt SSL certificates for both `snipotter.com` and `app.snipotter.com` once
the records resolve.

### Optional: redirect `www` to apex

In Netlify → landing site → Domain settings, set the **primary domain** to
`snipotter.com` and Netlify will 301-redirect `www.snipotter.com` automatically.
