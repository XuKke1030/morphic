'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import { DocumentViewer } from './document-viewer'
import { readSSEStream } from '@/lib/chatdb/sse'
import { useVisualViewport } from '@/hooks/use-visual-viewport'

import {
  ArrowLeft,
  Brain,
  ChevronDown,
  Check,
  Copy,
  FileText,
  Globe2,
  X
} from 'lucide-react'
import { Streamdown } from 'streamdown'

import { QuestionInputBar } from './question-input-bar'

type KnowledgeBase = {
  code: string
  name: string
  enabled: boolean
  documentCount?: number
  isDefault?: boolean
  emptyReason?: string
  docType?: string
}

type PopularQuestion = {
  question: string
  knowledgeCode?: string
  hitCount: number
  lastAskedAt?: number
  source?: string
}

type AnswerSectionKind = 'conclusion' | 'evidence' | 'supplement' | 'suggestion'

type AnswerSection = {
  kind: AnswerSectionKind
  title: string
  content: string
}

type ClarifyPayload = {
  question?: string
  options?: string[]
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  frames?: StreamFrame[]
  citations?: CitationSource[]
  sections?: AnswerSection[]
  currentSectionKind?: AnswerSectionKind
  clarification?: ClarifyPayload
}

type StreamFrame = {
  event?: string
  content?: string
  data?: unknown
  traceId?: string
  createTime?: number
}

type CitationSource = {
  citationId: number
  index: number
  documentId: number
  documentTitle: string
  fileName: string
  page: number
  anchor: string
  content: string
  effectiveDate?: string
  repealedBy?: string
}

type ApiEnvelope<T> = {
  code?: number
  data?: T
  message?: string
}

type StoredConversation = {
  messages: Message[]
  sessionId?: string
  updatedAt: string
}

const storagePrefix = 'chatdb:qa-document-session'
const documentQuestionMaxLength = 100

function linkifyCitations(text: string): string {
  return text.replace(
    /\[(\d+)\]/g,
    '<sup><a href="#" class="citation-marker" data-citation="$1">[$1]</a></sup>'
  )
}

function pickList<T>(
  payload: ApiEnvelope<{ list?: T[] }> | { list?: T[] } | null
) {
  if (!payload) return []
  if ('data' in payload) return payload.data?.list || []
  return (payload as { list?: T[] }).list || []
}

async function fetchJson<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal, credentials: 'include' })
  if (!response.ok) {
    throw new Error(await response.text().catch(() => '请求失败'))
  }
  return (await response.json()) as T
}

function splitKnowledgeCodes(value: string) {
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function frameTitle(frame: StreamFrame) {
  if (frame.event === 'start') return '开始处理'
  if (frame.event === 'tool_call') return '工具调用'
  if (frame.event === 'thinking') return '深度思考'
  if (frame.event === 'web_search') return '联网搜索'
  if (frame.event === 'retrieval') return '知识库召回'
  if (frame.event === 'message') return '生成回答'
  return frame.event || '数据帧'
}

const sectionKindFromEvent: Record<string, AnswerSectionKind> = {
  conclusion: 'conclusion',
  evidence: 'evidence',
  supplement: 'supplement',
  suggestion: 'suggestion'
}

const sectionTitleFromKind: Record<AnswerSectionKind, string> = {
  conclusion: '核心结论',
  evidence: '关键依据',
  supplement: '补充说明',
  suggestion: '后续建议'
}

function formatFrame(frame: StreamFrame) {
  if (frame.content) return frame.content
  if (frame.data === undefined || frame.data === null) return ''
  if (typeof frame.data === 'string') return frame.data
  try {
    return JSON.stringify(frame.data, null, 2)
  } catch {
    return String(frame.data)
  }
}

function asRecord(value: unknown) {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function asText(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown) {
  return typeof value === 'number' ? value : Number(value || 0)
}

function citationFromFrame(frame: StreamFrame): CitationSource | null {
  if (frame.event !== 'citation') return null
  const data = asRecord(frame.data)
  if (!data) return null
  const citationId = asNumber(data.citationId)
  const documentId = asNumber(data.documentId)
  if (!citationId || !documentId) return null
  return {
    citationId,
    documentId,
    index: asNumber(data.index) || 1,
    documentTitle: asText(data.documentTitle),
    fileName: asText(data.fileName),
    page: asNumber(data.page),
    anchor: asText(data.anchor),
    content: asText(data.content),
    effectiveDate: asText(data.effectiveDate),
    repealedBy: asText(data.repealedBy)
  }
}

function sessionIdFromFrame(frame: StreamFrame) {
  if (frame.event !== 'start') return ''
  const data = asRecord(frame.data)
  return asText(data?.sessionId)
}

function ConversationMessage({
  message,
  onViewDocument,
  onClarify
}: {
  message: Message
  onViewDocument: (documentId: number, focusSegmentId?: number) => void
  onClarify: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [citationsOpen, setCitationsOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const processFrames = (message.frames || []).filter(
    frame =>
      frame.event &&
      frame.event !== 'message' &&
      frame.event !== 'citation' &&
      frame.event !== 'conclusion' &&
      frame.event !== 'evidence' &&
      frame.event !== 'supplement' &&
      frame.event !== 'suggestion' &&
      frame.event !== 'section_start' &&
      frame.event !== 'clarification'
  )
  const citations = (message.citations || [])
    .slice()
    .sort((a, b) => a.index - b.index)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest(
        'a.citation-marker'
      ) as HTMLAnchorElement | null
      if (!link) return
      e.preventDefault()
      const idx = Number(link.dataset.citation)
      if (idx > 0) setCitationsOpen(true)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  const handleCopy = () => {
    const text =
      message.sections && message.sections.length > 0
        ? message.sections.map(s => `【${s.title}】\n${s.content}`).join('\n\n')
        : message.content
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  if (message.role === 'user') {
    return (
      <div className="ml-auto w-fit max-w-[82%] whitespace-pre-wrap break-words rounded-[22px] bg-[#444] px-5 py-4 text-[17px] font-semibold leading-7 text-white shadow-sm">
        {message.content}
      </div>
    )
  }

  return (
    <div className="mr-auto w-fit max-w-[92%] rounded-[22px] border border-[#ededed] bg-white px-5 py-4 text-[#111827] shadow-sm">
      <style>{`.citation-marker{color:#3b82f6;font-weight:600;text-decoration:none;cursor:pointer;font-size:0.75em}.citation-marker:hover{color:#1d4ed8}`}</style>
      {processFrames.length ? (
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="mb-4 inline-flex items-center gap-1 text-[15px] font-semibold text-[#ff6b2b]"
        >
          查看思考过程{' '}
          <ChevronDown
            className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`}
          />
        </button>
      ) : null}

      {open ? (
        <div className="mb-4 space-y-3 border-t border-[#eeeeee] pt-3">
          {processFrames.map((frame, index) => (
            <div
              key={index}
              className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-[#64748b]"
            >
              <div className="mb-1 font-semibold text-[#334155]">
                {frameTitle(frame)}
              </div>
              {formatFrame(frame) ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                  {formatFrame(frame)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-4">
        {message.sections && message.sections.length > 0 ? (
          message.sections.map((section, i) => (
            <div
              key={i}
              className={
                section.kind === 'conclusion'
                  ? 'rounded-xl border border-[#d4e0f7] bg-[#f5f8ff] px-4 py-3'
                  : section.kind === 'evidence'
                    ? 'rounded-xl border border-[#cfe8b8] bg-[#f8fff2] px-4 py-3'
                    : section.kind === 'suggestion'
                      ? 'rounded-xl border border-[#fde8d0] bg-[#fff9f2] px-4 py-3'
                      : 'rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-4 py-3'
              }
            >
              <div className="mb-2 text-[13px] font-semibold text-[#6b7280]">
                {section.title}
              </div>
              <div className="prose prose-neutral max-w-none text-[15px] leading-7">
                {section.content ? (
                  <Streamdown>{linkifyCitations(section.content)}</Streamdown>
                ) : (
                  '正在生成...'
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="prose prose-neutral max-w-none text-[16px] leading-8">
            {message.content ? (
              <Streamdown>{linkifyCitations(message.content)}</Streamdown>
            ) : (
              '正在查询...'
            )}
          </div>
        )}

        {message.clarification && message.clarification.options?.length ? (
          <div className="my-3 rounded-xl border border-[#ffe0d4] bg-[#fff7f4] p-3">
            <div className="text-sm font-semibold text-[#111827]">
              {message.clarification.question || '请选择更明确的查询口径'}
            </div>
            <div className="mt-3 grid gap-2">
              {message.clarification.options.slice(0, 5).map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onClarify(option)}
                  className="rounded-lg border border-[#ffd0bd] bg-white px-3 py-2 text-left text-sm text-[#1f2937]"
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-[#9ca3af]">
              都不准确重新输入即可
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[#eeeeee] pt-3">
        {citations.length ? (
          <button
            type="button"
            onClick={() => setCitationsOpen(v => !v)}
            className="inline-flex items-center gap-1 text-[14px] font-medium text-[#6b7280] transition hover:text-[#374151]"
          >
            <FileText className="h-4 w-4" />
            参考资料({citations.length})
            <ChevronDown
              className={`h-3.5 w-3.5 transition ${citationsOpen ? 'rotate-180' : ''}`}
            />
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1 text-[14px] text-[#9ca3af] transition hover:text-[#374151]"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>

      {citationsOpen && citations.length ? (
        <div className="mt-3 space-y-2 border-t border-[#eeeeee] pt-3">
          {citations.map(citation => (
            <button
              key={citation.citationId}
              type="button"
              onClick={() =>
                onViewDocument(
                  citation.documentId,
                  citation.anchor?.split('-').pop()
                    ? Number(citation.anchor!.split('-').pop())
                    : undefined
                )
              }
              className="block w-full rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-3 py-3 text-left transition hover:border-[#cbd5e1] hover:bg-white"
            >
              <div className="flex items-center gap-2 text-[14px] font-semibold text-[#374151]">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">
                  [{citation.index}]{' '}
                  {citation.documentTitle || citation.fileName || '引用文档'}
                </span>
                {citation.repealedBy ? (
                  <span className="shrink-0 rounded-full bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#dc2626]">
                    已废止
                  </span>
                ) : citation.effectiveDate ? (
                  <span className="shrink-0 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-medium text-[#16a34a]">
                    生效 {citation.effectiveDate}
                  </span>
                ) : null}
                {citation.page ? (
                  <span className="shrink-0 text-[12px] text-[#9ca3af]">
                    第 {citation.page} 页
                  </span>
                ) : null}
              </div>
              <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#6b7280]">
                {citation.content}
              </p>
              {citation.repealedBy ? (
                <p className="mt-1 text-[11px] text-[#dc2626]">
                  被「{citation.repealedBy}」废止
                </p>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function PolicyDocumentChat() {
  const { height: vvHeight, offsetTop: vvOffsetTop } = useVisualViewport()
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [knowledgeCode, setKnowledgeCode] = useState('')
  const [questions, setQuestions] = useState<PopularQuestion[]>([])
  const [exampleQuestions, setExampleQuestions] = useState<string[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState('')
  const [deepThinking, setDeepThinking] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [viewerDoc, setViewerDoc] = useState<{
    documentId: number
    focusSegmentId?: number
  } | null>(null)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const selectedKnowledgeCodes = useMemo(
    () => splitKnowledgeCodes(knowledgeCode),
    [knowledgeCode]
  )
  const selectedKnowledgeSet = useMemo(
    () => new Set(selectedKnowledgeCodes),
    [selectedKnowledgeCodes]
  )
  const selectedKnowledgeLabel = useMemo(() => {
    if (!selectedKnowledgeCodes.length) return '请选择文档库'
    if (selectedKnowledgeCodes.length === knowledgeBases.length)
      return '全部文档库'
    const selectedNames = knowledgeBases
      .filter(item => selectedKnowledgeSet.has(item.code))
      .map(item => item.name)
    if (selectedNames.length <= 1) return selectedNames[0] || '请选择文档库'
    return `${selectedNames[0]}等${selectedNames.length}个库`
  }, [knowledgeBases, selectedKnowledgeCodes, selectedKnowledgeSet])
  const currentKnowledge = useMemo(
    () => knowledgeBases.find(item => item.code === selectedKnowledgeCodes[0]),
    [knowledgeBases, selectedKnowledgeCodes]
  )
  const title =
    selectedKnowledgeCodes.length > 1
      ? '多文档库问答'
      : currentKnowledge?.name || '政策文档问答'
  const storageKey = `${storagePrefix}:${knowledgeCode || 'none'}`

  useEffect(() => {
    const controller = new AbortController()
    setLoadingMeta(true)
    setError('')

    fetchJson<ApiEnvelope<{ list: KnowledgeBase[] }>>(
      '/api/chatdb/knowledge-bases',
      controller.signal
    )
      .then(payload => {
        const list = pickList<KnowledgeBase>(payload).filter(
          (item: KnowledgeBase) => item.enabled
        )
        setKnowledgeBases(list)
        setKnowledgeCode(current => {
          if (current) {
            const validCodes = splitKnowledgeCodes(current).filter(code =>
              list.some(item => item.code === code)
            )
            if (validCodes.length) return validCodes.join(',')
          }
          const defaults = list.filter(item => item.isDefault)
          if (defaults.length) return defaults.map(d => d.code).join(',')
          return list[0]?.code || ''
        })
      })
      .catch(fetchError => {
        if ((fetchError as Error).name !== 'AbortError') {
          setError('无法加载问答知识库，请确认后端服务已启动。')
        }
      })
      .finally(() => setLoadingMeta(false))

    fetchJson<
      ApiEnvelope<{ welcomeMessage?: string; welcomeSubtext?: string }>
    >('/api/chatdb/user/bootstrap', controller.signal)
      .then(payload => {
        const d =
          payload?.data ||
          (payload as unknown as {
            welcomeMessage?: string
            welcomeSubtext?: string
          })
        if (d?.welcomeMessage) setWelcomeMessage(d.welcomeMessage)
      })
      .catch(() => {})

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!knowledgeCode) {
      setQuestions([])
      return
    }

    const controller = new AbortController()
    fetchJson<ApiEnvelope<{ list: PopularQuestion[] }>>(
      `/api/chatdb/popular-questions?knowledgeCode=${encodeURIComponent(knowledgeCode)}`,
      controller.signal
    )
      .then(payload =>
        setQuestions(pickList<PopularQuestion>(payload).slice(0, 3))
      )
      .catch(() => setQuestions([]))

    fetchJson<
      ApiEnvelope<{ list: { id: number; question: string; topic: string }[] }>
    >(`/api/chatdb/example-questions`, controller.signal)
      .then(payload => {
        const list = pickList<{ id: number; question: string; topic: string }>(
          payload
        )
        setExampleQuestions(list.map(q => q.question).slice(0, 6))
      })
      .catch(() => setExampleQuestions([]))

    return () => controller.abort()
  }, [knowledgeCode])

  useEffect(() => {
    if (!knowledgeCode || typeof window === 'undefined') {
      setMessages([])
      return
    }

    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      setMessages([])
      setSessionId('')
      return
    }

    try {
      const stored = JSON.parse(raw) as StoredConversation
      setMessages(Array.isArray(stored.messages) ? stored.messages : [])
      setSessionId(typeof stored.sessionId === 'string' ? stored.sessionId : '')
    } catch {
      setMessages([])
      setSessionId('')
    }
  }, [knowledgeCode, storageKey])

  useEffect(() => {
    if (!knowledgeCode || typeof window === 'undefined') return
    const stored: StoredConversation = {
      messages,
      sessionId,
      updatedAt: new Date().toISOString()
    }
    window.localStorage.setItem(storageKey, JSON.stringify(stored))
  }, [messages, sessionId, knowledgeCode, storageKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function stop() {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }

  function toggleKnowledgeCode(code: string) {
    const next = new Set(selectedKnowledgeCodes)
    if (next.has(code)) {
      next.delete(code)
    } else {
      next.add(code)
    }
    setKnowledgeCode(Array.from(next).join(','))
  }

  function selectAllKnowledgeBases() {
    setKnowledgeCode(knowledgeBases.map(item => item.code).join(','))
  }

  function confirmKnowledgePicker() {
    if (!selectedKnowledgeCodes.length && knowledgeBases[0]) {
      setKnowledgeCode(knowledgeBases[0].code)
    }
    setLibraryPickerOpen(false)
  }

  function resetConversation() {
    stop()
    const activeSessionId = sessionId
    setMessages([])
    setSessionId('')
    setInput('')
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey)
    }
    if (activeSessionId) {
      fetch(
        `/api/chatdb/qa/sessions/${encodeURIComponent(activeSessionId)}/reset`,
        {
          method: 'POST',
          credentials: 'include'
        }
      ).catch(() => undefined)
    }
  }

  async function submit(question?: string) {
    const text = (question || input).trim().slice(0, documentQuestionMaxLength)
    if (!text || loading || !knowledgeCode) return

    const controller = new AbortController()
    abortRef.current = controller
    setInput('')
    setLoading(true)
    setError('')

    const context = messages
      .filter(message => message.content.trim())
      .slice(-10)
      .map(message => ({
        role: message.role,
        content: message.content.slice(0, 1600)
      }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', frames: [] }
    ])

    try {
      const response = await fetch('/api/chatdb/qa-chats', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knowledgeCode,
          message: text,
          sessionId,
          context,
          topK: 5,
          deepThinking,
          webSearch
        }),
        signal: controller.signal
      })

      if (!response.ok || !response.body) {
        throw new Error(await response.text().catch(() => '问答请求失败'))
      }

      await readSSEStream(response.body, frame => {
        const nextSessionId = sessionIdFromFrame(frame)
        if (nextSessionId) {
          setSessionId(nextSessionId)
        }

        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role !== 'assistant') return prev
          const nextFrames = [...(last.frames || []), frame]
          const citation = citationFromFrame(frame)
          const nextCitations = citation
            ? [...(last.citations || []), citation]
            : last.citations
          const sections = [...(last.sections || [])]
          let currentSectionKind = last.currentSectionKind
          let content = last.content

          if (frame.event === 'section_start') {
            const data = asRecord(frame.data)
            const kind = asText(data?.sectionKind) || asText(data?.kind) || ''
            if (sectionKindFromEvent[kind]) {
              currentSectionKind = sectionKindFromEvent[kind]
              const existing = sections.findIndex(
                s => s.kind === currentSectionKind
              )
              if (existing >= 0) {
                sections[existing] = { ...sections[existing], content: '' }
              } else {
                sections.push({
                  kind: currentSectionKind,
                  title: sectionTitleFromKind[currentSectionKind],
                  content: ''
                })
              }
            }
          } else if (
            currentSectionKind &&
            frame.event === 'message' &&
            frame.content
          ) {
            const idx = sections.findIndex(s => s.kind === currentSectionKind)
            if (idx >= 0) {
              sections[idx] = {
                ...sections[idx],
                content: sections[idx].content + frame.content
              }
            } else {
              content = content + frame.content
            }
          } else if (frame.event === 'message' && frame.content) {
            content = content + frame.content
          } else if (sectionKindFromEvent[frame.event || ''] && frame.content) {
            const kind = sectionKindFromEvent[frame.event!]
            currentSectionKind = kind
            const existing = sections.findIndex(s => s.kind === kind)
            if (existing >= 0) {
              sections[existing] = {
                ...sections[existing],
                content: sections[existing].content + frame.content
              }
            } else {
              sections.push({
                kind,
                title: sectionTitleFromKind[kind],
                content: frame.content
              })
            }
          }

          let clarification = last.clarification
          if (frame.event === 'clarification') {
            const d = asRecord(frame.data)
            clarification = {
              question: asText(d?.question) || '',
              options: (Array.isArray(d?.options) ? d.options : []).map(String)
            }
          }

          next[next.length - 1] = {
            ...last,
            frames: nextFrames,
            citations: nextCitations,
            content,
            sections,
            currentSectionKind,
            clarification
          }
          return next
        })
      })
    } catch (submitError) {
      if ((submitError as Error).name !== 'AbortError') {
        const message =
          submitError instanceof Error ? submitError.message : '问答请求失败'
        setError(message)
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            next[next.length - 1] = {
              role: 'assistant',
              content: message,
              frames: []
            }
          }
          return next
        })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setLoading(false)
    }
  }

  return (
    <div
      className="w-full bg-[#efefef] text-[#111827]"
      style={{ marginTop: vvOffsetTop ? `${vvOffsetTop}px` : 0, height: vvHeight ? `${vvHeight}px` : '100%' }}
    >
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col bg-white shadow-sm">
        <header className="flex h-auto min-h-[48px] shrink-0 items-center gap-3 border-b border-[#eeeeee] px-4 py-2.5">
          <Link
            href="/"
            aria-label="返回"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e5e5] text-[#555]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold tracking-normal">
            {title}
          </h1>
          <button
            type="button"
            onClick={resetConversation}
            className="h-10 rounded-lg border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#374151] active:bg-[#f5f5f5]"
          >
            新对话
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-8 pt-14">
          {loadingMeta ? (
            <div className="text-center text-[#9ca3af]">
              正在加载问答权限...
            </div>
          ) : !knowledgeBases.length ? (
            <div className="flex items-center gap-2 rounded-xl border border-[#f0d6d6] bg-[#fff7f7] p-4 text-sm text-[#b91c1c]">
              <span className="min-w-0 flex-1">{error || "暂无可用的问答知识库。"}</span>
              <button type="button" onClick={() => setError("")} className="shrink-0 text-[#f87171] hover:text-[#dc2626]" aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-8">
              {messages.length === 0 ? (
                <section>
                  <div className="text-center">
                    <h2 className="text-[28px] font-extrabold tracking-normal text-[#111827]">
                      {welcomeMessage || '你好，我可以帮你查询文档内容'}
                    </h2>
                    <p className="mt-3 text-[16px] leading-7 text-[#8b8f99]">
                      今天想了解什么？可以问我知识库相关的问题
                    </p>
                  </div>
                  {questions.length || exampleQuestions.length ? (
                    <div className="mt-10">
                      <div className="text-[20px] text-[#848b96]">
                        {questions.length ? '常用问题' : '试试这样问'}
                      </div>
                      <div className="mt-5 space-y-3">
                        {questions.length
                          ? questions.map(item => (
                              <button
                                key={`${item.question}-${item.hitCount}-${item.source || 'stat'}`}
                                type="button"
                                onClick={() => submit(item.question)}
                                className="w-full rounded-xl border border-[#eeeeee] bg-white px-5 py-4 text-left text-[18px] leading-7 text-[#374151] shadow-sm"
                              >
                                {item.question}
                              </button>
                            ))
                          : exampleQuestions.map(q => (
                              <button
                                key={q}
                                type="button"
                                onClick={() => submit(q)}
                                className="w-full rounded-xl border border-[#eeeeee] bg-white px-5 py-4 text-left text-[18px] leading-7 text-[#374151] shadow-sm"
                              >
                                {q}
                              </button>
                            ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-10 rounded-xl border border-dashed border-[#e5e7eb] px-5 py-4 text-[15px] text-[#9ca3af]">
                      暂无历史热门问题。
                    </div>
                  )}
                </section>
              ) : null}

              {messages.map((message, index) => (
                <ConversationMessage
                  key={index}
                  message={message}
                  onViewDocument={(docId, segId) =>
                    setViewerDoc({ documentId: docId, focusSegmentId: segId })
                  }
                  onClarify={option => submit(option)}
                />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="shrink-0 border-t border-[#eeeeee] bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_112px_112px] gap-2 px-4 pb-2 pt-2 sm:grid-cols-[minmax(0,1fr)_144px_144px]">
            <button
              type="button"
              onClick={() => setLibraryPickerOpen(true)}
              disabled={!knowledgeBases.length || loading}
              className="flex h-12 min-w-0 items-center rounded-xl border border-[#e5e7eb] bg-white px-3 text-left text-[15px] text-[#8c929c] disabled:text-[#9ca3af]"
            >
              <span className="shrink-0">当前文档类型：</span>
              <span className="min-w-0 flex-1 truncate text-[#555]">
                {selectedKnowledgeLabel}
              </span>
              <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-[#9ca3af]" />
            </button>
            <button
              type="button"
              onClick={() => setDeepThinking(value => !value)}
              className={
                deepThinking
                  ? 'flex h-12 w-[112px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-transparent bg-[#333] px-2 text-[16px] text-white sm:w-[144px]'
                  : 'flex h-12 w-[112px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-[#e5e7eb] bg-white px-2 text-[16px] text-[#6b7280] sm:w-[144px]'
              }
            >
              <Brain className="h-4 w-4" />
              深度思考
            </button>
            <button
              type="button"
              onClick={() => setWebSearch(value => !value)}
              className={
                webSearch
                  ? 'flex h-12 w-[112px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-transparent bg-[#333] px-2 text-[16px] text-white sm:w-[144px]'
                  : 'flex h-12 w-[112px] items-center justify-center gap-1 whitespace-nowrap rounded-xl border border-[#e5e7eb] bg-white px-2 text-[16px] text-[#6b7280] sm:w-[144px]'
              }
            >
              <Globe2 className="h-4 w-4" />
              联网搜索
            </button>
          </div>

          <QuestionInputBar
            value={input}
            maxLength={documentQuestionMaxLength}
            loading={loading}
            placeholder="输入您的问题..."
            disabled={!selectedKnowledgeCodes.length}
            onChange={setInput}
            onSubmit={submit}
            onStop={stop}
            onFocus={() =>
              bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
            }
          />
        </footer>

        {libraryPickerOpen ? (
          <div className="fixed inset-0 z-30 mx-auto flex max-w-[560px] items-end bg-black/20">
            <div className="w-full rounded-t-2xl bg-white px-5 pb-5 pt-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-[#111827]">
                    选择文档库
                  </div>
                  <div className="mt-1 text-sm text-[#8b8f99]">
                    当前问题只会检索选中的文档库
                  </div>
                </div>
                <button
                  type="button"
                  onClick={confirmKnowledgePicker}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[#e5e7eb] text-[#6b7280]"
                  aria-label="关闭"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={selectAllKnowledgeBases}
                className={
                  selectedKnowledgeCodes.length === knowledgeBases.length
                    ? 'mb-3 flex h-12 w-full items-center justify-between rounded-xl bg-[#333] px-4 text-left text-white'
                    : 'mb-3 flex h-12 w-full items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 text-left text-[#374151]'
                }
              >
                <span className="font-semibold">全部文档库</span>
                {selectedKnowledgeCodes.length === knowledgeBases.length ? (
                  <Check className="h-4 w-4" />
                ) : null}
              </button>

              <div className="max-h-[42vh] space-y-4 overflow-y-auto">
                {(() => {
                  const docTypeLabels: Record<string, string> = {
                    policy: '政策制度',
                    manual: '业务手册',
                    form: '表单模板',
                    rule: '规则标准',
                    case: '案例汇编'
                  }
                  const groups: Record<string, KnowledgeBase[]> = {}
                  const ungrouped: KnowledgeBase[] = []
                  for (const item of knowledgeBases) {
                    const key = item.docType || ''
                    if (key && docTypeLabels[key]) {
                      ;(groups[key] ??= []).push(item)
                    } else {
                      ungrouped.push(item)
                    }
                  }
                  const order = ['policy', 'manual', 'form', 'rule', 'case']
                  const sections: { label: string; items: KnowledgeBase[] }[] =
                    []
                  for (const key of order) {
                    if (groups[key])
                      sections.push({
                        label: docTypeLabels[key],
                        items: groups[key]
                      })
                  }
                  if (ungrouped.length)
                    sections.push({ label: '其他', items: ungrouped })
                  return sections.map(section => (
                    <div key={section.label}>
                      <div className="mb-2 text-[13px] font-semibold text-[#9ca3af]">
                        {section.label}
                      </div>
                      <div className="space-y-2">
                        {section.items.map(item => {
                          const selected = selectedKnowledgeSet.has(item.code)
                          const isEmpty = item.documentCount === 0
                          return (
                            <button
                              key={item.code}
                              type="button"
                              onClick={() => toggleKnowledgeCode(item.code)}
                              className={
                                selected
                                  ? 'flex w-full items-center justify-between rounded-xl bg-[#333] px-4 py-3 text-left text-white'
                                  : isEmpty
                                    ? 'flex w-full items-center justify-between rounded-xl border border-dashed border-[#e5e7eb] bg-[#fafafa] px-4 py-3 text-left text-[#9ca3af]'
                                    : 'flex w-full items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-left text-[#374151]'
                              }
                            >
                              <span className="min-w-0 flex-1 truncate font-semibold">
                                {item.name}
                              </span>
                              {isEmpty && item.emptyReason ? (
                                <span className="ml-2 shrink-0 text-[11px] text-[#9ca3af]">
                                  {item.emptyReason}
                                </span>
                              ) : selected ? (
                                <Check className="ml-3 h-4 w-4 shrink-0" />
                              ) : null}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))
                })()}
              </div>

              <button
                type="button"
                onClick={confirmKnowledgePicker}
                className="mt-5 h-12 w-full rounded-xl bg-[#333] text-[16px] font-semibold text-white"
              >
                确定
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {viewerDoc ? (
        <DocumentViewer
          documentId={viewerDoc.documentId}
          focusSegmentId={viewerDoc.focusSegmentId}
          onClose={() => setViewerDoc(null)}
        />
      ) : null}
    </div>
  )
}
