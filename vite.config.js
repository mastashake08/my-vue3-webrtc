// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const repoName = 'my-vue3-webrtc';
export default defineConfig({
  base: `/${repoName}/`, // Ensures correct asset paths
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WebRTC QR Signaling Vue 3',
        short_name: 'WebRTCQR',
        description: 'A futuristic Vue 3 PWA for QR-based WebRTC signaling',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        icons: [
          {
            src: `/${repoName}/pwa-logo.svg`,
            sizes: '144x144',
            type: 'image/svg'
          },
          {
            src: `/${repoName}/pwa-logo.svg`,
            sizes: '512x512',
            type: 'image/svg'
          }
        ]
      }
    })
  ]
})
