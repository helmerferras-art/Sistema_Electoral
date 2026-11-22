import type { CapacitorConfig } from '@capacitor/cli';

// La app carga la versión publicada en nemia.lat: cada despliegue de Netlify
// llega solo al teléfono, sin reinstalar el APK. El service worker de la PWA
// guarda la app para abrirla sin señal después de la primera carga.
const config: CapacitorConfig = {
  appId: 'lat.nemia.tlatoani',
  appName: 'Tlatoani',
  webDir: 'dist',
  server: {
    url: 'https://nemia.lat',
    cleartext: false,
    allowNavigation: ['nemia.lat', '*.nemia.lat', '*.supabase.co'],
    errorPath: 'offline.html',
  },
};

export default config;
