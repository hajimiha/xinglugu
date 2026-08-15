import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { ImageGenerationAsset, ImageGenerationJob, ImagePromptMode } from '../../sillytavern/image-generation/types'
import type { StructuredImagePrompt } from '../../sillytavern/image-generation/prompt'
import { useTavern } from '../../tavern/TavernContext'
import { GameIcon } from '../icons/GameIcon'

const statusLabels: Record<ImageGenerationJob['status'], string> = {
  draft: '草稿', preparing: '整理提示词', queued: '排队中', generating: '生成中', succeeded: '已完成',
  failed: '失败', cancelled: '已取消', interrupted: '已中断',
}

function AssetPreview({ asset, alt }: { asset: ImageGenerationAsset; alt: string }) {
  const [source, setSource] = useState('')
  useEffect(() => {
    const url = URL.createObjectURL(asset.blob)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [asset.blob])
  return source ? <img src={source} alt={alt} /> : <div className="dialogue-image-loading" role="status">正在读取图片</div>
}

function downloadAsset(asset: ImageGenerationAsset, title: string) {
  const source = URL.createObjectURL(asset.blob)
  const anchor = document.createElement('a')
  anchor.href = source
  anchor.download = `${title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || '性撸谷对话场景'}.${asset.mimeType.split('/')[1] || 'png'}`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(source), 1000)
}

export function DialogueImageGallery({ sessionId, npcId, latestMessageId }: { sessionId: string; npcId: string; latestMessageId?: string }) {
  const tavern = useTavern()
  const [instruction, setInstruction] = useState('')
  const [mode, setMode] = useState<ImagePromptMode>(tavern.settings?.imageGeneration.prompt.mode ?? 'llm')
  const [working, setWorking] = useState(false)
  const [prepared, setPrepared] = useState<StructuredImagePrompt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const jobs = useMemo(() => tavern.imageJobs.filter((job) => job.sessionId === sessionId && job.npcId === npcId), [tavern.imageJobs, sessionId, npcId])
  const assets = useMemo(() => tavern.imageAssets.filter((asset) => asset.sessionId === sessionId && asset.npcId === npcId), [tavern.imageAssets, sessionId, npcId])
  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets])
  const latestAsset = assets[0]
  const latestJob = latestAsset ? jobs.find((job) => job.assetId === latestAsset.id) : undefined

  useEffect(() => {
    if (tavern.settings) setMode(tavern.settings.imageGeneration.prompt.mode)
  }, [tavern.settings?.imageGeneration.prompt.mode])

  const prepare = async () => {
    setWorking(true)
    setError(null)
    try {
      setPrepared(await tavern.prepareDialogueImagePrompt({ sessionId, npcId, messageId: latestMessageId, instruction, mode }))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '整理绘图提示词失败。')
    } finally {
      setWorking(false)
    }
  }

  const generate = async (event: FormEvent) => {
    event.preventDefault()
    setWorking(true)
    setError(null)
    try {
      await tavern.generateDialogueImage({ sessionId, npcId, messageId: latestMessageId, instruction, mode, prepared: prepared ?? undefined })
      setInstruction('')
      setPrepared(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '生成场景图片失败。')
    } finally {
      setWorking(false)
    }
  }

  const loadJobForEdit = (job: (typeof jobs)[number]) => {
    setMode('manual')
    setInstruction(job.positivePrompt)
    setPrepared({ title: job.title, positive: job.positivePrompt, negative: job.negativePrompt, valid: true })
    setError(null)
  }

  if (!tavern.settings?.imageGeneration.enabled) {
    return <div className="dialogue-image-disabled"><GameIcon name="image" size={27} /><strong>对话绘图尚未启用</strong><p>前往酒馆中枢的“绘图”页选择本地或远程生图服务，并保存配置。</p></div>
  }

  return <div className="dialogue-image-gallery" aria-label="对话场景画廊">
    {latestAsset ? <figure className="dialogue-image-hero" title="双击使用原提示词重新生成" onDoubleClick={() => { if (latestJob) void tavern.retryImageJob(latestJob.id) }} style={{ width: `${tavern.settings.imageGeneration.ui.imageSizePercent}%`, marginInline: tavern.settings.imageGeneration.ui.imageAlignment === 'center' ? 'auto' : tavern.settings.imageGeneration.ui.imageAlignment === 'right' ? 'auto 0' : '0 auto' }}><AssetPreview asset={latestAsset} alt="最新生成的对话场景" /><figcaption><span>最新场景</span><strong>{latestJob?.title ?? '对话场景'}</strong>{latestJob && <button id={`dialogue-image-latest-retry-${npcId}`} type="button" aria-label="重新生成最新场景" onClick={() => void tavern.retryImageJob(latestJob.id)}><GameIcon name="retry" size={15} /></button>}<button id={`dialogue-image-latest-download-${npcId}`} type="button" aria-label="下载最新场景" onClick={() => downloadAsset(latestAsset, latestJob?.title ?? '对话场景')}><GameIcon name="download" size={15} /></button></figcaption></figure> : <div className="dialogue-image-empty"><GameIcon name="image" size={32} /><strong>这一段会话还没有场景图</strong><p>让提示词模型根据当前角色、地点、世界书和最近对话整理画面，或直接输入你的构图要求。</p></div>}

    <form className="dialogue-image-generator" onSubmit={generate}>
      <div><label htmlFor={`dialogue-image-mode-${npcId}`}>提示词来源</label><select id={`dialogue-image-mode-${npcId}`} value={mode} onChange={(event) => { setMode(event.target.value as ImagePromptMode); setPrepared(null) }}><option value="llm">AI 智能整理</option><option value="tagged">读取回复标记</option><option value="manual">手动提示词</option></select></div>
      <label htmlFor={`dialogue-image-instruction-${npcId}`}>{mode === 'manual' ? '画面提示词' : '补充画面要求（可选）'}</label>
      <textarea id={`dialogue-image-instruction-${npcId}`} rows={3} maxLength={2000} value={instruction} placeholder={mode === 'manual' ? '描述人物、动作、构图、光线与风格……' : '例如：突出人物半身、黄昏逆光、镜头更靠近……'} onChange={(event) => { setInstruction(event.target.value); setPrepared(null) }} />
      {prepared && <fieldset className="dialogue-image-review"><legend>生成前审阅</legend><label htmlFor={`dialogue-image-title-${npcId}`}>画面标题</label><input id={`dialogue-image-title-${npcId}`} value={prepared.title} onChange={(event) => setPrepared({ ...prepared, title: event.target.value })} /><label htmlFor={`dialogue-image-positive-${npcId}`}>正面提示词</label><textarea id={`dialogue-image-positive-${npcId}`} rows={5} value={prepared.positive} onChange={(event) => setPrepared({ ...prepared, positive: event.target.value })} /><label htmlFor={`dialogue-image-negative-${npcId}`}>负面提示词</label><textarea id={`dialogue-image-negative-${npcId}`} rows={3} value={prepared.negative} onChange={(event) => setPrepared({ ...prepared, negative: event.target.value })} />{!prepared.valid && <small className="is-error">模型未按结构输出，已保留原文；请检查正面提示词后再提交。</small>}</fieldset>}
      <div className="dialogue-image-submit-row"><button id={`dialogue-image-prepare-${npcId}`} className="secondary-button" type="button" disabled={working || (mode === 'manual' && !instruction.trim())} onClick={() => void prepare()}><GameIcon name="wand" size={16} />{working ? '正在整理' : '整理并审阅提示词'}</button><button id={`dialogue-image-generate-${npcId}`} className="primary-button" type="submit" disabled={working || !prepared?.positive.trim()}><GameIcon name="image" size={16} />提交生成</button></div>
    </form>

    {(error || tavern.imageError) && <div className="tavern-dialogue-error" role="alert"><GameIcon name="warning" size={16} /><span>{error ?? tavern.imageError}</span></div>}

    <section className="dialogue-image-jobs" aria-labelledby={`dialogue-image-jobs-title-${npcId}`}>
      <header><div><span>IMAGE HISTORY</span><strong id={`dialogue-image-jobs-title-${npcId}`}>任务与历史</strong></div><small>{assets.length} 张图片 · {jobs.length} 个任务</small></header>
      {jobs.length === 0 && <p className="image-empty-note">任务历史会在首次生成后显示在这里。</p>}
      {jobs.map((job) => {
        const asset = job.assetId ? assetsById.get(job.assetId) : undefined
        const active = ['preparing', 'queued', 'generating'].includes(job.status)
        return <article key={job.id} className={`dialogue-image-job is-${job.status}`}>
          {asset && <div className="dialogue-image-thumb"><AssetPreview asset={asset} alt="历史生成场景" /></div>}
          <div className="dialogue-image-job-copy"><span>{statusLabels[job.status]} · {providerLabels(job.provider)}</span><strong>{job.title}</strong>{active && <progress aria-label={`${job.title}生成进度`} max={1} value={job.progress ?? 0} />} {job.error && <small className="is-error">{job.error}</small>}<details><summary id={`dialogue-image-job-details-${job.id}`}>查看提示词与参数</summary><p>{job.positivePrompt}</p>{job.negativePrompt && <p>负面：{job.negativePrompt}</p>}<code>{JSON.stringify(job.parameters)}</code></details></div>
          <div className="dialogue-image-job-actions">{active && <button id={`dialogue-image-job-cancel-${job.id}`} type="button" aria-label={`取消${job.title}`} onClick={() => void tavern.cancelImageJob(job.id)}><GameIcon name="stop" size={15} /></button>}<button id={`dialogue-image-job-edit-${job.id}`} type="button" aria-label={`编辑并重绘${job.title}`} onClick={() => loadJobForEdit(job)}><GameIcon name="wand" size={15} /></button>{['failed', 'cancelled', 'interrupted'].includes(job.status) && <button id={`dialogue-image-job-retry-${job.id}`} type="button" aria-label={`重试${job.title}`} onClick={() => void tavern.retryImageJob(job.id)}><GameIcon name="retry" size={15} /></button>}{asset && <button id={`dialogue-image-job-download-${job.id}`} type="button" aria-label={`下载${job.title}`} onClick={() => downloadAsset(asset, job.title)}><GameIcon name="download" size={15} /></button>}<button id={`dialogue-image-job-delete-${job.id}`} type="button" aria-label={`删除${job.title}`} onClick={() => void tavern.deleteImageJob(job.id)}><GameIcon name="trash" size={15} /></button></div>
        </article>
      })}
    </section>
  </div>
}

function providerLabels(provider: ImageGenerationJob['provider']): string {
  if (provider === 'stable-diffusion') return 'A1111 / Forge'
  if (provider === 'comfyui') return 'ComfyUI'
  if (provider === 'novelai') return 'NovelAI'
  return 'OpenAI 兼容'
}
