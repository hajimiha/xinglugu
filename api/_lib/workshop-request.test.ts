import { afterEach, describe, expect, it } from 'vitest'
import { getWorkshopConfiguration } from './workshop-request'

const original = { catalog: process.env.XINGLUGU_WORKSHOP_CATALOG_GIST_ID, secret: process.env.XINGLUGU_SESSION_SECRET }
afterEach(() => {
  if (original.catalog === undefined) delete process.env.XINGLUGU_WORKSHOP_CATALOG_GIST_ID
  else process.env.XINGLUGU_WORKSHOP_CATALOG_GIST_ID = original.catalog
  if (original.secret === undefined) delete process.env.XINGLUGU_SESSION_SECRET
  else process.env.XINGLUGU_SESSION_SECRET = original.secret
})

describe('创意工坊部署配置', () => {
  it('未单独配置目录时使用官方公共 Gist', () => {
    delete process.env.XINGLUGU_WORKSHOP_CATALOG_GIST_ID
    process.env.XINGLUGU_SESSION_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    expect(getWorkshopConfiguration()).toMatchObject({ catalogGistId: '27a706cfd0a648fee5f43788b47ec615' })
  })
})
