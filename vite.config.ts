import type { Server as HttpServer } from 'node:http'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { attachGameServer } from './server/socket.ts'

function gameServer(): Plugin {
  return {
    name: 'tint-and-tell-game-server',
    configureServer(server) {
      if (server.httpServer) attachGameServer(server.httpServer as HttpServer)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), gameServer()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: ['.trycloudflare.com'],
  },
})
