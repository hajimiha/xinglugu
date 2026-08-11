import { useEffect, useMemo, useState } from 'react'
import { exportToJson } from '../../../sillytavern/importer'
import { redactRequestInspection, redactSensitiveValue } from '../../../sillytavern/api-adapter'
import type { TavernRequestAudit } from '../../../sillytavern/types'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'

type InspectorView = 'segments' | 'messages' | 'provider' | 'diagnostics'

const sourceLabels: Record<string, string> = {
  preset: '预设', character: '角色卡', lorebook: '世界书', history: '会话历史', variables: '变量', format: '输出契约', regex: '正则', user: '玩家输入',
}

function statusLabel(audit: TavernRequestAudit) {
  return audit.status === 'succeeded' ? '已完成' : '请求失败'
}

export function RequestInspectorPanel() {
  const tavern = useTavern()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<InspectorView>('segments')
  const audits = tavern.requestAudits
  useEffect(() => {
    if (!selectedId || !audits.some((audit) => audit.id === selectedId)) setSelectedId(audits[0]?.id ?? null)
  }, [audits, selectedId])
  const selected = audits.find((audit) => audit.id === selectedId) ?? null
  const redactedProviderRequest = selected ? redactRequestInspection(selected.providerRequest) : null
  const totals = useMemo(() => selected ? {
    tokens: selected.segments.filter((segment) => segment.sent).reduce((total, segment) => total + segment.tokenEstimate, 0),
    sent: selected.segments.filter((segment) => segment.sent).length,
  } : { tokens: 0, sent: 0 }, [selected])

  const exportAudit = () => {
    if (!selected) return
    const exportable = redactSensitiveValue({
      ...selected,
      providerRequest: redactRequestInspection(selected.providerRequest),
    })
    exportToJson(exportable, `酒馆请求审计-${new Date(selected.createdAt).toISOString().replace(/[:.]/g, '-')}.json`)
  }

  return <section className="tavern-panel request-inspector-panel" aria-labelledby="request-inspector-title">
    <header className="tavern-panel-heading"><div><span>OUTBOUND REQUEST AUDIT</span><h3 id="request-inspector-title">请求检查器</h3><p>逐段核对预设、角色卡、世界书、宏和正则最终如何进入模型请求。密钥不会写入档案。</p></div><div className="panel-heading-actions"><button id="request-audit-export" type="button" disabled={!selected} onClick={exportAudit}><GameIcon name="download" size={17} />导出本次</button><button id="request-audit-clear" className="danger-ghost" type="button" disabled={!audits.length} onClick={() => void tavern.clearRequestAudits()}><GameIcon name="trash" size={16} />清空档案</button></div></header>
    <div className="request-privacy-note"><GameIcon name="shield" size={18} /><div><strong>安全审计副本</strong><p>本机保留最近 20 次请求；可单独导出或清空。鉴权请求头固定显示为“已隐藏”，不会保存 API 密钥。</p></div></div>
    <div className="request-inspector-workspace">
      <aside className="request-audit-list" aria-label="请求档案列表">{audits.length ? audits.map((audit) => <button id={`request-audit-select-${audit.id}`} key={audit.id} type="button" className={audit.id === selectedId ? 'is-active' : ''} onClick={() => setSelectedId(audit.id)}><span data-status={audit.status}>{statusLabel(audit)}</span><strong>{audit.characterName} · {audit.presetName}</strong><small>{new Date(audit.createdAt).toLocaleString('zh-CN')} · {audit.model}</small></button>) : <div className="tavern-empty-state"><GameIcon name="shield" size={28} /><strong>还没有出站请求档案</strong><p>与任意角色完成一次模型对话后，这里会显示实际发送的提示词和供应商 JSON。</p></div>}</aside>
      <main className="request-audit-detail">{selected ? <>
        <header className="request-audit-summary"><div><span>{selected.presetBinding === 'pinned' ? '固定预设' : '跟随活动预设'}</span><h4>{selected.presetName}</h4><p>{selected.provider} · {selected.model}</p></div><dl><div><dt>装配片段</dt><dd>{totals.sent}</dd></div><div><dt>估算词符</dt><dd>{totals.tokens}</dd></div><div><dt>世界书命中</dt><dd>{selected.matchedLorebookEntries.length}</dd></div><div><dt>宏操作</dt><dd>{selected.macroOperations.length}</dd></div></dl></header>
        <div className="request-inspector-tabs" role="tablist" aria-label="请求检查视图">{([
          ['segments', '装配来源'], ['messages', '最终消息'], ['provider', '供应商 JSON'], ['diagnostics', '宏与诊断'],
        ] as Array<[InspectorView, string]>).map(([id, label]) => <button id={`request-inspector-view-${id}`} key={id} role="tab" type="button" aria-selected={view === id} onClick={() => setView(id)}>{label}</button>)}</div>
        {view === 'segments' && <ol className="request-segment-list">{selected.segments.map((segment, index) => <li key={segment.id} data-sent={segment.sent}><header><span>{String(index + 1).padStart(2, '0')}</span><strong>{sourceLabels[segment.source] ?? segment.source}{segment.identifier ? ` · ${segment.identifier}` : ''}</strong><small>{segment.role} · 约 {segment.tokenEstimate} 词符 · {segment.sent ? '已发送' : '未发送'}</small></header><details><summary>查看编译后正文</summary><pre>{segment.compiled}</pre></details>{segment.diagnostics.length > 0 && <p>{segment.diagnostics.join('；')}</p>}</li>)}</ol>}
        {view === 'messages' && <ol className="request-message-inspection">{selected.preparedRequest.messages.map((message, index) => <li key={`${message.role}-${index}`}><span>{String(index + 1).padStart(2, '0')} · {message.role}</span><pre>{message.content}</pre></li>)}</ol>}
        {view === 'provider' && redactedProviderRequest && <div className="provider-request-inspection"><dl><div><dt>请求地址</dt><dd>{redactedProviderRequest.url}</dd></div><div><dt>请求方法</dt><dd>{redactedProviderRequest.method}</dd></div></dl><h5>请求头</h5><pre>{JSON.stringify(redactedProviderRequest.headers, null, 2)}</pre><h5>最终请求体</h5><pre>{JSON.stringify(redactedProviderRequest.body, null, 2)}</pre></div>}
        {view === 'diagnostics' && <div className="request-diagnostics"><section><h5>宏操作</h5>{selected.macroOperations.length ? <ol>{selected.macroOperations.map((operation, index) => <li key={`${operation.type}-${index}`}><strong>{operation.type}</strong><code>{operation.macro}</code>{operation.key && <span>{operation.key}</span>}</li>)}</ol> : <p>本次请求没有执行变量宏。</p>}</section><section><h5>编译诊断</h5>{selected.diagnostics.length ? <ul>{selected.diagnostics.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>未发现未知宏或正则错误。</p>}</section>{selected.error && <section className="is-error"><h5>请求错误</h5><p>{selected.error}</p></section>}</div>}
      </> : <div className="tavern-empty-state"><strong>选择一条请求档案</strong></div>}</main>
    </div>
  </section>
}
