import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server proxies the API and live WebSocket to the Node backend (server/index.js)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // reachable from a phone on the same Wi-Fi
    proxy: {
      '/api': 'http://localhost:8080',
      '/live': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
