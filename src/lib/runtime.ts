/**
 * Build flavour flags for the renderer (from the preload bridge).
 *
 * isMas() — Mac App Store (sandboxed) build. AI enrichment (no provider keys
 * are shipped), Finder file capture, synthetic auto-paste and the in-app
 * updater are unavailable there, so their UI is hidden or replaced.
 *
 * Read lazily (not at module load) so the module is importable where `window`
 * does not exist, e.g. the Node-based render tests in scripts/tests.
 */
export function isMas(): boolean {
  return typeof window !== 'undefined' && window.snipotter?.runtime?.isMas === true
}
