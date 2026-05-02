import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.snipotter.app',
  appName: 'Snipotter',
  // Next.js static export. `npm run build` produces this directory.
  webDir: 'out',
  // Bundle the static export into the APK rather than pointing `server.url`
  // at app.snipotter.com — Play Store flags pure-wrapper apps that just
  // load a website, and bundled assets work offline.
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      androidScaleType: 'CENTER_CROP',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0f',
    },
  },
}

export default config
