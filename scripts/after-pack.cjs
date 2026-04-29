/**
 * electron-builder afterPack hook — ad-hoc sign macOS bundles.
 *
 * Why this exists:
 *   electron-builder's built-in macOS signing path keys off the `identity`
 *   config. With `identity: null` it skips signing entirely, and with
 *   `identity: "-"` it tries to look "-" up in the keychain (which fails on
 *   GitHub Actions runners that have no Developer ID installed). Either way
 *   the resulting .app ships unsigned, and macOS Gatekeeper rejects it on
 *   download with "Snipotter is damaged and can't be opened".
 *
 *   This hook bypasses electron-builder's signing logic and invokes
 *   `codesign --force --deep --sign -` directly on the freshly packed .app
 *   bundle. The `-` argument is a special codesign value that means
 *   "ad-hoc signature" — no certificate needed. The bundle is then re-packed
 *   into the DMG / zip with the signature baked in.
 *
 *   Ad-hoc signed apps still aren't notarized, so macOS still warns
 *   "developer not verified" on first launch (right-click → Open clears it),
 *   but Gatekeeper no longer flags the bundle as damaged.
 *
 *   Replace this with real Developer ID signing + notarization once a paid
 *   Apple Developer account is available.
 */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', '-', '--timestamp=none', appPath],
    { stdio: 'inherit' },
  )

  // Verify the signature was actually applied — if codesign silently no-op'd
  // we want the build to fail loudly here, not at the user's machine.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  })
  console.log('[after-pack] signature verified')
}
