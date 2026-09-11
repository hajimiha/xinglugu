import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright-core'
import { preview } from 'vite'

const output = 'work/image-prompt-qa'
await mkdir(output, { recursive: true })
const remoteUrl = process.env.IMAGE_QA_URL
const server = remoteUrl ? null : await preview({ root: process.cwd(), configFile: false, base: './', preview: { host: '127.0.0.1', port: 43176, strictPort: true } })
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true })
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    const page = await context.newPage()
    page.setDefaultTimeout(12000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (event) => { if (event.type() === 'error') errors.push(event.text()) })
    if (!remoteUrl) await page.route('**/api/auth/github/status', (route) => route.fulfill({ json: { authenticated: false, configured: false } }))
    await page.route('https://prompt-qa.test/v1/models', (route) => {
      assert.equal(route.request().headers().authorization, 'Bearer fake-prompt-key')
      return route.fulfill({ json: { data: [{ id: 'prompt-model-a' }, { id: 'prompt-model-b' }] } })
    })
    await page.route('https://image.novelai.net/user/subscription', (route) => {
      assert.equal(route.request().headers().authorization, 'Bearer fake-nai-key')
      return route.fulfill({ json: { tier: 3, active: true } })
    })
    const openHub = async () => {
      await page.getByRole('button', { name: '打开酒馆中枢' }).click()
      await page.getByRole('tab', { name: /绘图/ }).click()
      await page.getByRole('heading', { name: '对话绘图中枢' }).waitFor()
    }
    await page.goto(remoteUrl ?? 'http://127.0.0.1:43176/', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '开始游戏' }).click()
    await page.getByLabel('玩家姓名').fill('绘图验收员')
    await page.getByRole('button', { name: '确认姓名并进入性撸谷' }).click()
    await page.getByRole('button', { name: '跳过剧情' }).click()
    await page.getByRole('button', { name: '确认跳过', exact: true }).click()
    await openHub()
    const styleBefore = await page.locator('#image-prompt-preset').inputValue()
    await page.getByLabel('选择提示词预设 JSON').setInputFiles({
      name: 'upstream-context.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({
        '雨中村庄': { api_key: 'never-import-this-key', entries: [
          { role: 'system', name: '画面规则', content: 'Compose a village illustration.', enabled: true },
          { role: 'user', name: '雨景', content: 'rain, village', enabled: true, triggerMode: 'trigger', triggerWords: '雨', andTriggerWords: '村庄' },
        ] },
      })),
    })
    await page.getByRole('status').filter({ hasText: '已导入 1 个提示词预设' }).waitFor()
    assert.equal(await page.getByLabel('提示词预设名称').inputValue(), '雨中村庄')
    assert.equal(await page.locator('#image-prompt-preset').inputValue(), styleBefore)
    await page.getByRole('checkbox', { name: /启用绘图提示词独立 API/ }).check()
    await page.getByLabel('提示词 API 根地址').fill('https://prompt-qa.test/v1')
    await page.getByLabel('提示词 API 密钥', { exact: true }).fill('fake-prompt-key')
    await page.getByRole('checkbox', { name: '在这台设备记住提示词密钥' }).check()
    await page.getByRole('button', { name: '连接并获取提示词模型' }).click()
    await page.getByLabel('可用提示词模型').selectOption('prompt-model-b')
    assert.equal(await page.getByLabel('提示词模型名称').inputValue(), 'prompt-model-b')
    await page.getByRole('button', { name: '保存绘图配置' }).click()
    try {
      await page.getByRole('status').filter({ hasText: '绘图配置、提示词预设与缓存规则已保存。' }).waitFor()
    } catch (error) {
      process.stdout.write(JSON.stringify(await page.evaluate(() => ({
        notices: [...document.querySelectorAll('[role="status"], [role="alert"]')].map((el) => el.textContent),
        invalid: [...document.querySelectorAll('input:invalid')].map((el) => ({ id: el.id, message: el.validationMessage })),
      }))) + '\n')
      await page.screenshot({ path: `${output}/failure-${width}.png` })
      throw error
    }
    await page.locator('#image-generation-provider').selectOption('novelai')
    await page.locator('#image-nai-model').selectOption('nai-diffusion-4-5-curated')
    await page.getByLabel('供应商密钥（本地服务可留空）').fill('fake-nai-key')
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'NovelAI 密钥验证成功' }).waitFor()
    await page.getByRole('button', { name: '保存绘图配置' }).click()
    await page.getByRole('status').filter({ hasText: '绘图配置、提示词预设与缓存规则已保存。' }).waitFor()
    await page.getByRole('button', { name: '测试连接', exact: true }).click()
    await page.getByRole('status').filter({ hasText: 'NovelAI 密钥验证成功' }).waitFor()
    await page.locator('#image-llm-preset').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/${remoteUrl ? 'deployed' : 'local'}-${width}-presets.png` })
    await page.locator('#image-nai-model').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${output}/${remoteUrl ? 'deployed' : 'local'}-${width}-nai.png` })
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.image-config-card')].some((el) => el.scrollWidth > el.clientWidth + 2))
    assert.equal(overflow, false, `Card overflow at ${width}`)
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('button', { name: '开始游戏' }).click()
    await openHub()
    assert.equal(await page.getByLabel('提示词预设名称').inputValue(), '雨中村庄')
    assert.equal(await page.getByLabel('提示词模型名称').inputValue(), 'prompt-model-b')
    assert.equal(await page.locator('#image-nai-model').inputValue(), 'nai-diffusion-4-5-curated')
    assert.match(await page.getByLabel('提示词 API 密钥', { exact: true }).getAttribute('placeholder'), /已保存/)
    assert.deepEqual(errors, [])
    process.stdout.write(JSON.stringify({ width, target: remoteUrl ?? 'local', imported: true, isolatedApiModels: true, naiSelection: true, savedKeysPreserved: true, reload: true, errors: 0 }) + '\n')
    await context.close()
  }
} finally {
  await browser.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
}
