/**
 * Snipotter — build/runtime flavour flags.
 *
 * `process.mas` is set by Electron itself in Mac App Store builds (the
 * `mas`/`mas-dev` electron-builder targets ship the MAS Electron binary).
 * Those builds run inside the App Sandbox, so anything that needs AppleEvents,
 * Accessibility, spawning osascript, reading arbitrary user files or replacing
 * the app bundle (self-update) must be switched off or replaced.
 */
export const IS_MAS: boolean = process.platform === 'darwin' && process.mas === true
