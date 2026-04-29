# Release & Auto-Update

How to ship a new Snipotter version to all platforms in one shot.

## One-time setup

### 1. GitHub repo

```bash
cd /Users/mehmetgulenc/Desktop/snipotter
git init -b main
git add -A
git commit -m "chore: initial commit"
gh repo create mehmetgulenc/snipotter --public --source=. --remote=origin --push
```

(Or create the repo via the GitHub web UI and `git remote add origin …` manually.)

### 2. Repo secrets

Go to **GitHub → Settings → Secrets and variables → Actions → New repository secret** and add:

| Name | Value |
|------|-------|
| `MAIN_VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
| `MAIN_VITE_SUPABASE_ANON_KEY` | Supabase anon JWT |
| `MAIN_VITE_ANTHROPIC_API_KEY` | Claude Haiku key (optional) |
| `MAIN_VITE_GEMINI_API_KEY` | Gemini Flash key (optional) |

`GITHUB_TOKEN` is provided automatically — no need to add it.

### 3. Verify workflow file

`.github/workflows/release.yml` is committed. Push it once before tagging:

```bash
git push origin main
```

## Cutting a release

```bash
# Patch (0.1.0 → 0.1.1) for bug fixes
npm run release:patch

# Minor (0.1.0 → 0.2.0) for features
npm run release:minor

# Major (0.1.0 → 1.0.0) for breaking changes
npm run release:major
```

What happens behind the scenes:

1. `npm version` bumps `package.json` and creates a commit + tag (`v0.1.1`)
2. `git push && git push --tags` sends both to GitHub
3. The tag push triggers `.github/workflows/release.yml`
4. GitHub Actions runs in parallel on macOS, Windows, and Ubuntu runners
5. Each runner builds its own installer(s) and uploads to a draft GitHub Release
6. After all three jobs succeed, the release is published with:
   - `Snipotter-0.1.1-arm64.dmg` + `Snipotter-0.1.1-x64.dmg` + zips (macOS)
   - `Snipotter-Setup-0.1.1.exe` + portable exe (Windows)
   - `Snipotter-0.1.1.AppImage` + `.deb` (Linux)
   - `latest-mac.yml`, `latest.yml`, `latest-linux.yml` (auto-update metadata)

You can monitor progress at **github.com/mehmetgulenc/snipotter/actions**.

## How users get the update

Users on a previous packaged version automatically:

1. App launches → 30 seconds later, `electron-updater` checks GitHub Releases
2. If a newer `version` is found in `latest-*.yml`, the new installer downloads in the background
3. **Settings → Güncellemeler** shows the progress bar
4. When complete, the user sees a "Yeniden başlat & güncelle" button
5. Clicking restarts the app into the new version

The auto-check repeats every 6 hours while the app stays open. There's also a manual **Güncellemeleri kontrol et** button in Settings.

## Local testing (without publishing)

You can dry-run the build locally without uploading anything to GitHub:

```bash
npm run build:mac    # produces dist/Snipotter-*.dmg
npm run build:win    # needs Wine on macOS: brew install --cask wine-stable
npm run build:linux  # needs Docker for cross-build, easier on Ubuntu CI
```

The auto-update flow only kicks in for **packaged builds running outside `npm run dev`**, so you need to install the DMG/exe and run the installed app to test the updater UI.

## Code signing & notarization

### Current state: ad-hoc signed (free, no Apple account)

`electron-builder.json` sets `mac.identity: null` which makes electron-builder run `codesign --sign -` on the bundle. This is **ad-hoc signing**: no certificate, no trusted authority, but the binary is internally consistent. Without this step, Apple Silicon Macs refuse to launch the app at all and show "Snipotter is damaged" because every arm64 binary must carry at least an ad-hoc signature.

What users still see on first launch:

- macOS: "Snipotter cannot be opened because the developer cannot be verified" → **right-click → Open** → "Open" → app runs and the warning never appears again on that Mac
- Windows: SmartScreen "Windows protected your PC" → **More info → Run anyway**

What users will **not** see:

- ❌ "Snipotter is damaged. Move to Bin." (this was the unsigned-binary error, now fixed)

### Upgrade path: full Developer ID signing + notarization ($99/year)

When ready to ship without any first-launch warnings:

1. Buy an Apple Developer membership at developer.apple.com ($99/year)
2. Add to repo secrets:
   - `APPLE_ID` — your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` — generate at appleid.apple.com
   - `APPLE_TEAM_ID` — from developer.apple.com/account
   - `CSC_LINK` — base64-encoded `.p12` certificate
   - `CSC_KEY_PASSWORD` — `.p12` password
3. In `electron-builder.json`:
   - Remove `"identity": null` (let electron-builder auto-discover the cert)
   - Set `"hardenedRuntime": true`
   - Re-add `"entitlements": "build/entitlements.mac.plist"` and `"entitlementsInherit": "build/entitlements.mac.plist"`
   - Add `"notarize": { "teamId": "<TEAM_ID>" }` under the `mac` block
4. In `.github/workflows/release.yml`, remove `CSC_IDENTITY_AUTO_DISCOVERY: false` from the macOS step

For Windows, an Authenticode certificate (~$200/year) avoids SmartScreen warnings. Set `CSC_LINK` + `CSC_KEY_PASSWORD` in repo secrets and electron-builder picks them up automatically.

## Troubleshooting

**"Snipotter is damaged. Move to Bin."** (macOS) — Quarantine attribute on a build that wasn't ad-hoc signed (older v0.1.1 and earlier). Two fixes:

```bash
# Quick fix on the current install
xattr -cr /Applications/Snipotter.app

# Permanent fix: cut a new release with electron-builder.json's mac.identity:null
npm run release:patch
```

**"developer cannot be verified"** (macOS) — Expected on first launch of an ad-hoc signed build. Right-click → Open → Open. The system remembers and won't ask again.

**"electron-updater: Cannot find latest.yml"** — The release exists but the metadata file wasn't uploaded. Re-run the workflow or check the Actions logs for that platform.

**"Update download failed: ENOTFOUND"** — User is offline or behind a strict proxy. Manual install from github.com/mehmetgulenc/snipotter/releases is the fallback.

**Workflow fails with `403 Resource not accessible by integration`** — The `permissions: contents: write` block at the top of `release.yml` is missing or the repo's default workflow permissions are read-only. Check **Settings → Actions → General → Workflow permissions**.
