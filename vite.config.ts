import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Inject a strict Content-Security-Policy into the *production* HTML only.
 * Vite's dev server needs a looser policy (HMR / eval), so `apply: 'build'`
 * keeps the dev experience intact while hardening the shipped app.
 */
function cspPlugin(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')

  return {
    name: 'auraos-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      )
    },
  }
}

// base './' so the production bundle can be loaded from file:// inside Electron.
export default defineConfig({
  plugins: [react(), cspPlugin()],
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2021',
    chunkSizeWarningLimit: 2000,
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
