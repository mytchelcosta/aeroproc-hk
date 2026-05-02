import { defineConfig } from 'vite'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

// Resolve the absolute path to this config file's directory (the project root).
// We need this so the middleware below can build correct absolute file paths
// regardless of where the 'vite' command is run from.
const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/aeroproc-hk/' : '/',
  server: {
    port: 3000,
    open: true
  }
}))
