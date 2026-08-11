import { describe, expect, it } from 'vitest'
import { CLOUD_GIST_DESCRIPTION, CLOUD_SAVE_FILENAME, findCloudGist, validateSerializedSave } from './github-gist'

describe('GitHub 私有 Gist 云存档', () => {
  it('只识别游戏自己的描述与文件名，优先最新修改项', () => {
    const match = findCloudGist([
      { id: 'wrong', description: CLOUD_GIST_DESCRIPTION, updated_at: '2026-01-03', files: { other: {} } },
      { id: 'older', description: CLOUD_GIST_DESCRIPTION, updated_at: '2026-01-01', files: { [CLOUD_SAVE_FILENAME]: {} } },
      { id: 'newer', description: CLOUD_GIST_DESCRIPTION, updated_at: '2026-01-02', files: { [CLOUD_SAVE_FILENAME]: {} } },
    ])
    expect(match?.id).toBe('newer')
  })

  it('拒绝超限或不是游戏存档信封的内容', () => {
    expect(() => validateSerializedSave('{"hello":true}')).toThrow('游戏存档')
    expect(() => validateSerializedSave('x'.repeat(512 * 1024 + 1))).toThrow('512 KiB')
    expect(validateSerializedSave('{"schemaVersion":2,"savedAt":1,"state":{}}')).toMatchObject({ schemaVersion: 2 })
  })
})
