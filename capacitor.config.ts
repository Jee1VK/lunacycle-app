import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lunacycle.app',
  appName: 'LunaCycle',
  webDir: 'dist',
  server: {
    // PWA-style Over-The-Air (OTA) live updates: loads the HTTPS GitHub Pages PWA
    // backed by our offline Service Worker so every push updates the APK seamlessly
    // without reinstalling, while continuing to work 100% offline.
    url: 'https://jee1vk.github.io/lunacycle-app/',
    cleartext: false,
    errorPath: 'offline.html',
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#6B1D2F',
    },
  },
};

export default config;
