import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.lunacycle.app',
  appName: 'LunaCycle',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#6B1D2F',
    },
  },
};

export default config;
