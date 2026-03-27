import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.clb.cognitiveloadbalancer',
  appName: 'Cognitive Load Balancer',
  webDir: 'dist',
  server: {
    // During development, point to your machine's IP so the app
    // can reach the Vite dev server. Comment this out for production builds.
    // url: 'http://192.168.1.XXX:5173',
    // cleartext: true,
    androidScheme: 'https',
  },
};

export default config;
