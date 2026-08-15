import { build } from 'vite'

await build({
  root: process.cwd(),
  configFile: false,
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('@phosphor-icons')) return 'vendor-icons'
          if (id.includes('dexie')) return 'vendor-storage'
          if (id.includes('react')) return 'vendor-react'
          return 'vendor'
        },
      },
    },
  },
})
