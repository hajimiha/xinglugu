import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { CloudAccount } from '../cloud/cloud-save-client'
import { GameIcon } from '../components/icons/GameIcon'
import { useTavern } from '../tavern/TavernContext'
import { buildWorkshopPackage } from './publisher'
import { previewWorkshopInstall, type WorkshopInstallPreview } from './install-package'
import type { WorkshopCatalogItem, WorkshopKind, WorkshopPackage, WorkshopSort } from './types'
import { workshopClient } from './workshop-client'

type Tab = 'discover' | 'mine' | 'publish'
const kindNames: Record<WorkshopKind, string> = { lorebook: '世界书', preset: '预设', 'portrait-pack': '人物立绘组' }
const sortNames: Record<WorkshopSort, string> = { trending: '近期热度', popular: '总收藏量', newest: '最新发布', updated: '最近更新' }

interface WorkshopHubProps {
  account: CloudAccount | null
  onOpenStudio(): void
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function WorkshopItemCard({ item, actionLabel = '查看详情', onAction }: { item: WorkshopCatalogItem; actionLabel?: string; onAction(): void }) {
  return <article className="community-workshop-card" data-kind={item.kind}>
    <header><span>{kindNames[item.kind]}</span><small>v{item.version}</small></header>
    <h3>{item.title}</h3><p>{item.description}</p>
    <div className="community-workshop-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <footer><div><img src={item.author.avatarUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /><span>{item.author.login}<small>{formatDate(item.updatedAt)} · {item.favoriteCount ?? 0} 收藏</small></span></div><button id={`workshop-open-${item.packageId}`} type="button" onClick={onAction}>{actionLabel}</button></footer>
  </article>
}

function WorkshopDetail({ item, preview, busy, onClose, onInstall, onDownload, onFavorite }: { item: WorkshopCatalogItem; preview: WorkshopInstallPreview | null; busy: boolean; onClose(): void; onInstall(): void; onDownload(): void; onFavorite(): void }) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])
  return <aside className="community-workshop-detail" role="dialog" aria-modal="true" aria-label={`${item.title}详情`} data-modal-layer="true">
    <header><div><span>{kindNames[item.kind]} · v{item.version}</span><h3>{item.title}</h3></div><button ref={closeRef} id="workshop-detail-close" data-layer-close="true" className="icon-button" type="button" aria-label="关闭资源详情" onClick={onClose}><GameIcon name="close" size={17} /></button></header>
    <p>{item.description}</p>
    <dl><div><dt>作者</dt><dd>{item.author.login}</dd></div><div><dt>更新时间</dt><dd>{formatDate(item.updatedAt)}</dd></div><div><dt>资源规模</dt><dd>{item.stats.entryCount} 项 · {Math.ceil(item.stats.bytes / 1024)} KB</dd></div><div><dt>收藏</dt><dd>{item.favoriteCount ?? 0}</dd></div></dl>
    <div className="community-workshop-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
    <section className="community-workshop-install-preview" aria-label="安装影响预览"><strong>安装前预览</strong>{preview ? <><p>{preview.label}</p>{preview.kind === 'portrait-pack' && <p>将替换 {preview.matchedCharacters} 位已匹配角色的立绘槽；{preview.skippedCharacters.length ? `跳过未匹配角色：${preview.skippedCharacters.join('、')}` : '没有跳过项。'}</p>}</> : <p>正在检查本地资源与兼容性。</p>}</section>
    <div className="community-workshop-detail-actions"><button id="workshop-install-selected" className="primary-button" type="button" disabled={busy} onClick={onInstall}><GameIcon name="download" size={17} />安装到本机</button><button id="workshop-download-selected" className="secondary-button" type="button" disabled={busy} onClick={onDownload}>下载 JSON</button><button id="workshop-favorite-selected" className="secondary-button" type="button" disabled={busy} onClick={onFavorite}><GameIcon name="health" size={16} />收藏</button></div>
  </aside>
}

export function WorkshopHub({ account, onOpenStudio }: WorkshopHubProps) {
  const tavern = useTavern()
  const [tab, setTab] = useState<Tab>('discover')
  const [items, setItems] = useState<WorkshopCatalogItem[]>([])
  const [mine, setMine] = useState<WorkshopCatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState<WorkshopKind | ''>('')
  const [sort, setSort] = useState<WorkshopSort>('trending')
  const [selected, setSelected] = useState<WorkshopCatalogItem | null>(null)
  const [detailPackage, setDetailPackage] = useState<WorkshopPackage | null>(null)
  const [editing, setEditing] = useState<{ item: WorkshopCatalogItem; pkg: WorkshopPackage } | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const refreshSequence = useRef(0)
  const authenticated = account?.authenticated === true
  const loginUrl = `/api/auth/github/start?returnTo=${encodeURIComponent('/?panel=workshop')}`
  const publishSource = useMemo(() => ({ lorebooks: tavern.lorebooks, presets: tavern.presets, characters: tavern.characters }), [tavern.characters, tavern.lorebooks, tavern.presets])

  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current
    setLoading(true); setError('')
    try { const result = await workshopClient.list({ search, kind, sort }); if (sequence === refreshSequence.current) setItems(result) }
    catch (caught) { if (sequence === refreshSequence.current) setError(caught instanceof Error ? caught.message : '创意工坊暂时无法读取。') }
    finally { if (sequence === refreshSequence.current) setLoading(false) }
  }, [kind, search, sort])

  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 180); return () => window.clearTimeout(timer) }, [refresh])
  useEffect(() => {
    if (tab !== 'mine' || !authenticated) return
    setBusy(true); setError('')
    void workshopClient.mine().then(setMine).catch((caught) => setError(caught instanceof Error ? caught.message : '无法读取你的发布。')).finally(() => setBusy(false))
  }, [authenticated, tab])

  const openDetail = async (item: WorkshopCatalogItem) => {
    setSelected(item); setDetailPackage(null); setBusy(true); setError('')
    try { setDetailPackage((await workshopClient.detail(item.packageId)).package) }
    catch (caught) { setError(caught instanceof Error ? caught.message : '资源详情读取失败。'); setSelected(null) }
    finally { setBusy(false) }
  }
  const install = async () => {
    if (!detailPackage) return
    setBusy(true); setError('')
    try { const result = await tavern.installWorkshopPackage(detailPackage); setNotice(`安装完成：${result.label}`) }
    catch (caught) { setError(caught instanceof Error ? caught.message : '资源安装失败。') }
    finally { setBusy(false) }
  }
  const favorite = async () => {
    if (!selected) return
    if (!authenticated) { window.location.assign(loginUrl); return }
    setBusy(true)
    try { await workshopClient.favorite(selected.packageId, true); setNotice('已收藏到当前 GitHub 账号。'); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : '收藏失败。') }
    finally { setBusy(false) }
  }
  const withdraw = async (item: WorkshopCatalogItem) => {
    if (!window.confirm(`确认撤回“${item.title}”吗？已安装的本地副本不会被删除。`)) return
    setBusy(true)
    try { await workshopClient.withdraw(item.packageId, item.revision); setMine((current) => current.filter((candidate) => candidate.packageId !== item.packageId)); setNotice('资源已从公开目录撤回。'); await refresh() }
    catch (caught) { setError(caught instanceof Error ? caught.message : '撤回失败。') }
    finally { setBusy(false) }
  }
  const editItem = async (item: WorkshopCatalogItem) => {
    setBusy(true)
    try { const result = await workshopClient.detail(item.packageId); setEditing({ item, pkg: result.package }); setTab('publish') }
    catch (caught) { setError(caught instanceof Error ? caught.message : '资源读取失败。') }
    finally { setBusy(false) }
  }

  const installPreview = detailPackage ? previewWorkshopInstall(detailPackage, tavern) : null
  return <section className={`community-workshop ${selected ? 'has-detail' : ''}`} aria-labelledby="start-workshop-title">
    <div className="community-workshop-nav" role="tablist" aria-label="创意工坊页面">
      <button id="workshop-tab-discover" role="tab" aria-selected={tab === 'discover'} type="button" onClick={() => setTab('discover')}><GameIcon name="crosshair" size={18} />发现资源</button>
      <button id="workshop-tab-mine" role="tab" aria-selected={tab === 'mine'} type="button" onClick={() => setTab('mine')}><GameIcon name="profile" size={18} />我的发布</button>
      <button id="workshop-tab-publish" role="tab" aria-selected={tab === 'publish'} type="button" onClick={() => { setEditing(null); setTab('publish') }}><GameIcon name="upload" size={18} />发布资源</button>
      <button id="workshop-open-studio" type="button" onClick={onOpenStudio}><GameIcon name="book" size={18} />本地创作台</button>
      <div className="community-workshop-account">{account === null ? <span>正在确认 GitHub 身份</span> : authenticated ? <><img src={account.user.avatarUrl} alt="" referrerPolicy="no-referrer" /><span>{account.user.login}<small>已连接 GitHub</small></span></> : <a id="workshop-github-login" href={loginUrl}><GameIcon name="connect" size={17} />登录 GitHub</a>}</div>
    </div>
    <div className="community-workshop-main">
      {(notice || error) && <div className={`community-workshop-notice ${error ? 'is-error' : ''}`} role="status">{error || notice}<button type="button" aria-label="关闭提示" onClick={() => { setError(''); setNotice('') }}><GameIcon name="close" size={14} /></button></div>}
      {tab === 'discover' && <>
        <header className="community-workshop-toolbar"><div><span>COMMUNITY ARCHIVE</span><h2>探索玩家创作</h2><p>世界书、叙事预设与人物立绘组均由玩家公开分享。</p></div><div className="community-workshop-filters"><label>搜索<input id="workshop-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="标题、作者或标签" /></label><label>类型<select id="workshop-kind-filter" value={kind} onChange={(event) => setKind(event.target.value as WorkshopKind | '')}><option value="">全部资源</option>{Object.entries(kindNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>排序<select id="workshop-sort" value={sort} onChange={(event) => setSort(event.target.value as WorkshopSort)}>{Object.entries(sortNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></header>
        {loading ? <div className="community-workshop-empty" role="status">正在从 GitHub 读取公开目录…</div> : items.length ? <div className="community-workshop-grid">{items.map((item) => <WorkshopItemCard key={item.packageId} item={item} onAction={() => void openDetail(item)} />)}</div> : <div className="community-workshop-empty"><GameIcon name="book" size={28} /><strong>暂时没有匹配的公开资源</strong><span>可以调整筛选，或登录 GitHub 发布第一份作品。</span></div>}
      </>}
      {tab === 'mine' && <section className="community-workshop-section"><header><span>YOUR PUBLICATIONS</span><h2>我的发布</h2><p>更新或撤回由当前 GitHub 账号拥有的公开资源。</p></header>{!authenticated ? <div className="community-workshop-login"><GameIcon name="connect" size={28} /><h3>登录后管理发布</h3><p>授权仅申请 Gist 权限，不读取仓库代码。</p><a className="primary-button" href={loginUrl}>使用 GitHub 登录</a></div> : mine.length ? <div className="community-workshop-grid">{mine.map((item) => <div key={item.packageId} className="community-workshop-owned"><WorkshopItemCard item={item} actionLabel="查看详情" onAction={() => void openDetail(item)} /><div><button id={`workshop-edit-${item.packageId}`} type="button" onClick={() => void editItem(item)}>更新版本</button><button id={`workshop-withdraw-${item.packageId}`} className="danger-button" type="button" disabled={busy} onClick={() => void withdraw(item)}>撤回</button></div></div>)}</div> : <div className="community-workshop-empty">{busy ? '正在读取你的公开资源…' : '你还没有发布资源。'}</div>}</section>}
      {tab === 'publish' && <WorkshopPublisher account={account} editing={editing} source={publishSource} loginUrl={loginUrl} busy={busy} onBusy={setBusy} onError={setError} onPublished={async (message) => { setNotice(message); setEditing(null); setTab('mine'); await refresh() }} />}
    </div>
    {selected && <WorkshopDetail item={selected} preview={installPreview} busy={busy || !detailPackage} onClose={() => { setSelected(null); setDetailPackage(null) }} onInstall={() => void install()} onDownload={() => detailPackage && workshopClient.download(detailPackage)} onFavorite={() => void favorite()} />}
  </section>
}

interface PublisherProps { account: CloudAccount | null; editing: { item: WorkshopCatalogItem; pkg: WorkshopPackage } | null; source: Parameters<typeof buildWorkshopPackage>[1]; loginUrl: string; busy: boolean; onBusy(value: boolean): void; onError(value: string): void; onPublished(message: string): Promise<void> }

function WorkshopPublisher({ account, editing, source, loginUrl, busy, onBusy, onError, onPublished }: PublisherProps) {
  const [kind, setKind] = useState<WorkshopKind>(editing?.pkg.kind ?? 'lorebook')
  const [title, setTitle] = useState(editing?.pkg.title ?? '')
  const [description, setDescription] = useState(editing?.pkg.description ?? '')
  const [version, setVersion] = useState(editing?.pkg.version ?? '1.0.0')
  const [tags, setTags] = useState(editing?.pkg.tags.join('，') ?? '')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  useEffect(() => { if (!editing) return; setKind(editing.pkg.kind); setTitle(editing.pkg.title); setDescription(editing.pkg.description); setVersion(editing.pkg.version); setTags(editing.pkg.tags.join('，')) }, [editing])
  const resources = useMemo(() => kind === 'lorebook' ? source.lorebooks.map((item) => ({ id: item.id, label: item.name })) : kind === 'preset' ? source.presets.map((item) => ({ id: item.id, label: item.name })) : source.characters.map((item) => ({ id: item.npcId, label: item.name })), [kind, source])
  useEffect(() => {
    const remoteIds = editing?.pkg.kind === 'lorebook' ? [editing.pkg.payload.lorebook.id]
      : editing?.pkg.kind === 'preset' ? [editing.pkg.payload.preset.id]
        : editing?.pkg.kind === 'portrait-pack' ? editing.pkg.payload.characters.map((character) => character.npcId) : []
    const matches = resources.filter((resource) => remoteIds.includes(resource.id)).map((resource) => resource.id)
    setSelectedIds(matches.length ? matches : resources[0] ? [resources[0].id] : [])
  }, [editing, kind, resources])
  const submit = async (event: FormEvent) => {
    event.preventDefault(); onError('')
    if (account?.authenticated !== true) { window.location.assign(loginUrl); return }
    onBusy(true)
    try {
      const meta = { title, description, version, tags: tags.split(/[，,]/).map((value) => value.trim()).filter(Boolean) }
      const pkg = await buildWorkshopPackage({ ...meta, kind, resourceIds: selectedIds, createdAt: editing?.pkg.createdAt }, source)
      if (editing) { await workshopClient.update(editing.item.packageId, editing.item.revision, pkg); await onPublished('本地最新内容已经作为新版本公开。') }
      else { await workshopClient.publish(pkg); await onPublished('资源已经发布到公开目录。') }
    } catch (caught) { onError(caught instanceof Error ? caught.message : '发布失败。') }
    finally { onBusy(false) }
  }
  return <section className="community-workshop-section"><header><span>PUBLISHING DESK</span><h2>{editing ? `更新「${editing.item.title}」` : '发布玩家资源'}</h2><p>发布前会移除会话、存档、密钥和全局变量；公开立绘会被打包为跨设备图片。</p></header>{account?.authenticated !== true && <div className="community-workshop-login is-inline"><span>发布、更新和撤回需要 GitHub 身份。</span><a href={loginUrl}>登录 GitHub</a></div>}<form className="community-workshop-publisher" onSubmit={(event) => void submit(event)}>
    <fieldset><legend>01 · {editing ? '选择本地最新内容' : '资源来源'}</legend><div className="community-workshop-type">{(Object.keys(kindNames) as WorkshopKind[]).map((value) => <button id={`workshop-publish-kind-${value}`} key={value} type="button" disabled={Boolean(editing)} aria-pressed={kind === value} onClick={() => setKind(value)}>{kindNames[value]}</button>)}</div><div className="community-workshop-resource-list">{resources.length ? resources.map((resource) => <label key={resource.id}><input id={`workshop-resource-${resource.id}`} type={kind === 'portrait-pack' ? 'checkbox' : 'radio'} name="workshop-resource" checked={selectedIds.includes(resource.id)} onChange={(event) => setSelectedIds((current) => kind === 'portrait-pack' ? event.target.checked ? [...new Set([...current, resource.id])] : current.filter((id) => id !== resource.id) : [resource.id])} /><span>{resource.label}</span></label>) : <p>本地尚无这类资源，请先进入“本地创作台”创建。</p>}</div>{editing && <small>更新会读取这里选中的本地资源，并替换远端旧版本的正文或立绘。</small>}</fieldset>
    <fieldset><legend>02 · 公开信息</legend><label>标题<input id="workshop-publish-title" required minLength={1} maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>简介<textarea id="workshop-publish-description" required minLength={10} maxLength={600} value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="community-workshop-meta-fields"><label>版本号<input id="workshop-publish-version" required maxLength={24} value={version} onChange={(event) => setVersion(event.target.value)} /></label><label>标签（逗号分隔）<input id="workshop-publish-tags" maxLength={160} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="剧情，像素立绘" /></label></div></fieldset>
    <footer><span>公开发布会创建一个公开 GitHub Gist，并写入性撸谷创意工坊目录。</span><button id="workshop-publish-submit" className="primary-button" type="submit" disabled={busy || (!editing && !selectedIds.length)}><GameIcon name="upload" size={17} />{busy ? '正在提交' : editing ? '公开新版本' : '确认发布'}</button></footer>
  </form></section>
}
