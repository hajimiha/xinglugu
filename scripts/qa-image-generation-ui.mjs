import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const outputDir = '.planning/st-chatu8-image-generation/visual-qa'
await mkdir(outputDir, { recursive: true })
const port = 43175
const server = await preview({ root: process.cwd(), configFile: false, base: './', preview: { host: '127.0.0.1', port, strictPort: true } })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '开始游戏' }).click()
  const nameInput = page.getByLabel('玩家姓名')
  if (await nameInput.isVisible().catch(() => false)) {
    await nameInput.fill('绘图验收员')
    await page.getByRole('button', { name: /确认姓名并进入/ }).click()
  }
  await page.getByRole('button', { name: '打开酒馆中枢' }).click()
  await page.getByRole('tab', { name: '绘图' }).click()
  await page.getByRole('heading', { name: '对话绘图中枢' }).waitFor()
  await page.screenshot({ path: `${outputDir}/desktop.png`, fullPage: true })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('heading', { name: '对话绘图中枢' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${outputDir}/mobile.png`, fullPage: true })
} finally {
  await browser.close()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
