import '../test/setup'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AudioStorage, StoredBgm } from './audio-storage'
import { AudioProvider, useAudio } from './AudioContext'

function Harness() {
  const audio = useAudio()
  return <><input aria-label="测试 BGM" type="file" accept="audio/*" onChange={(event) => { const file = event.target.files?.[0]; if (file) void audio.uploadBgm(file) }} /><output aria-label="BGM 名称">{audio.bgmName}</output></>
}

describe('本机音频上下文', () => {
  it('将上传的 BGM Blob 交给本机存储并更新曲名', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined)
    const user = userEvent.setup()
    let saved: StoredBgm | undefined
    const storage: AudioStorage = {
      load: vi.fn(async () => undefined),
      save: vi.fn(async (asset) => { saved = asset }),
      clear: vi.fn(async () => { saved = undefined }),
    }
    render(<AudioProvider storage={storage}><Harness /></AudioProvider>)
    const file = new File(['mistvale music'], '雾灯夜曲.ogg', { type: 'audio/ogg' })
    await user.upload(screen.getByLabelText('测试 BGM'), file)
    await waitFor(() => expect(screen.getByLabelText('BGM 名称')).toHaveTextContent('雾灯夜曲.ogg'))
    expect(saved).toMatchObject({ id: 'active-bgm', name: '雾灯夜曲.ogg', type: 'audio/ogg' })
    expect(saved?.blob).toBe(file)
  })
})
