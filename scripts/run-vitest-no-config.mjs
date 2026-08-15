import { startVitest } from 'vitest/node'

await startVitest('test', process.argv.slice(2), {
  config: false,
  environment: 'jsdom',
  include: ['src/**/*.test.{ts,tsx}', 'api/**/*.test.{ts,tsx}'],
  exclude: ['node_modules/**', 'node_modules.pre-daylight-backup/**', 'dist/**'],
  run: true,
  root: process.cwd(),
}, {
  configFile: false,
})
