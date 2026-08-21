import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'it.ilsamm.gestore',
  appName: 'GestOre Lavoro',
  webDir: 'www',
  backgroundColor: '#030711',
  loggingBehavior: 'none',
  ios: {
    backgroundColor: '#030711',
    contentInset: 'never',
    preferredContentMode: 'mobile',
    allowsLinkPreview: false,
    scrollEnabled: true,
    webContentsDebuggingEnabled: false
  },
  server: {
    hostname: 'localhost',
    iosScheme: 'capacitor',
    cleartext: false
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    CapacitorCookies: { enabled: true },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 700,
      backgroundColor: '#030711',
      showSpinner: false
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'LIGHT',
      backgroundColor: '#030711'
    },
    Keyboard: {
      resize: 'native',
      style: 'dark',
      resizeOnFullScreen: true
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_gestore',
      iconColor: '#5F7CFF'
    }
  }
};

export default config;
