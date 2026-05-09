'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ArrowLeft,
  Brain,
  ChevronDown,
  Check,
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
}

type PopularQuestion = {
  question: string
  knowledgeCode?: string
  hitCount: number
  lastAskedAt?: number
  source?: string
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  frames?: StreamFrame[]
  citations?: CitationSource[]
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

function pickList<T>(payload: ApiEnvelope<{ list?: T[] }> | { list?: T[] } | null) {
  if (!payload) return []
  if ('data' in payload) return payload.data?.list || []
  return (payload as { list?: T[] }).list || []
}

async function fetchJson<T>(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal })
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
    content: asText(data.content)
  }
}

function sessionIdFromFrame(frame: StreamFrame) {
  if (frame.event !== 'start') return ''
  const data = asRecord(frame.data)
  return asText(data?.sessionId)
}

function ConversationMessage({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const processFrames = (message.frames || []).filter(
    frame => frame.event && frame.event !== 'message' && frame.event !== 'citation'
  )
  const citations = message.citations || []

  if (message.role === 'user') {
    return (
      <div className="ml-auto w-fit max-w-[82%] whitespace-pre-wrap break-words rounded-[22px] bg-[#444] px-5 py-4 text-[17px] font-semibold leading-7 text-white shadow-sm">
        {message.content}
      </div>
    )
  }

  return (
    <div className="mr-auto w-fit max-w-[92%] rounded-[22px] border border-[#ededed] bg-white px-5 py-4 text-[#111827] shadow-sm">
      {processFrames.length ? (
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="mb-4 inline-flex items-center gap-1 text-[15px] font-semibold text-[#ff6b2b]"
        >
          查看思考过程 <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      ) : null}

      {open ? (
        <div className="mb-4 space-y-3 border-t border-[#eeeeee] pt-3">
          {processFrames.map((frame, index) => (
            <div key={index} className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-[#64748b]">
              <div className="mb-1 font-semibold text-[#334155]">{frameTitle(frame)}</div>
              {formatFrame(frame) ? (
                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                  {formatFrame(frame)}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="prose prose-neutral max-w-none text-[16px] leading-8">
        {message.content ? <Streamdown>{message.content}</Streamdown> : '正在查询...'}
      </div>

      {citations.length ? (
        <div className="mt-5 border-t border-[#eeeeee] pt-4">
          <div className="mb-3 text-[14px] font-semibold text-[#6b7280]">引用来源</div>
          <div className="space-y-2">
            {citations.map(citation => (
              <a
                key={citation.citationId}
                href={`/api/chatdb/qa/citations/${citation.citationId}`}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-[#e5e7eb] bg-[#fafafa] px-3 py-3 text-left transition hover:border-[#cbd5e1] hover:bg-white"
              >
                <div className="flex items-center gap-2 text-[14px] font-semibold text-[#374151]">
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    [{citation.index}] {citation.documentTitle || citation.fileName || '引用文档'}
                  </span>
                  {citation.page ? (
                    <span className="shrink-0 text-[12px] text-[#9ca3af]">第 {citation.page} 页</span>
                  ) : null}
                </div>
                <p className="mt-2 line-clamp-2 text-[13px] leading-5 text-[#6b7280]">
                  {citation.content}
                </p>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function PolicyDocumentChat() {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [knowledgeCode, setKnowledgeCode] = useState('')
  const [questions, setQuestions] = useState<PopularQuestion[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState('')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState('')
  const [deepThinking, setDeepThinking] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
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
  const selectedKnowledgeLabel = useMemo(
    () => {
      if (!selectedKnowledgeCodes.length) return '请选择文档库'
      if (selectedKnowledgeCodes.length === knowledgeBases.length) return '全部文档库'
      const selectedNames = knowledgeBases
        .filter(item => selectedKnowledgeSet.has(item.code))
        .map(item => item.name)
      if (selectedNames.length <= 1) return selectedNames[0] || '请选择文档库'
      return `${selectedNames[0]}等${selectedNames.length}个库`
    },
    [knowledgeBases, selectedKnowledgeCodes, selectedKnowledgeSet]
  )
  const currentKnowledge = useMemo(
    () => knowledgeBases.find(item => item.code === selectedKnowledgeCodes[0]),
    [knowledgeBases, selectedKnowledgeCodes]
  )
  const title = selectedKnowledgeCodes.length > 1 ? '多文档库问答' : currentKnowledge?.name || '政策文档问答'
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
        const list = pickList<KnowledgeBase>(payload).filter((item: KnowledgeBase) => item.enabled)
        setKnowledgeBases(list)
        setKnowledgeCode(current => {
          const validCodes = splitKnowledgeCodes(current).filter(code =>
            list.some(item => item.code === code)
          )
          return validCodes.length ? validCodes.join(',') : list[0]?.code || ''
        })
      })
      .catch(fetchError => {
        if ((fetchError as Error).name !== 'AbortError') {
          setError('无法加载问答知识库，请确认后端服务已启动。')
        }
      })
      .finally(() => setLoadingMeta(false))

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
      .then(payload => setQuestions(pickList<PopularQuestion>(payload).slice(0, 3)))
      .catch(() => setQuestions([]))

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
      fetch(`/api/question-chat/session/${encodeURIComponent(activeSessionId)}/reset`, {
        method: 'POST'
      }).catch(() => undefined)
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
      .map(message => ({ role: message.role, content: message.content.slice(0, 1600) }))

    setMessages(prev => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', frames: [] }
    ])

    try {
      const response = await fetch('/api/question-chat', {
        method: 'POST',
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

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const raw = trimmed.slice(5).trim()
          if (!raw || raw === '[DONE]') continue

          let frame: StreamFrame
          try {
            frame = JSON.parse(raw) as StreamFrame
          } catch {
            frame = { event: 'message', content: raw }
          }

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
            next[next.length - 1] = {
              ...last,
              frames: nextFrames,
              citations: citation
                ? [...(last.citations || []), citation]
                : last.citations,
              content:
                frame.event === 'message' && frame.content
                  ? last.content + frame.content
                  : last.content
            }
            return next
          })
        }
      }
    } catch (submitError) {
      if ((submitError as Error).name !== 'AbortError') {
        const message = submitError instanceof Error ? submitError.message : '问答请求失败'
        setError(message)
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            next[next.length - 1] = { role: 'assistant', content: message, frames: [] }
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
    <div className="h-full w-full bg-[#efefef] text-[#111827]">
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col bg-white shadow-sm">

        <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-[#eeeeee] px-5">
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

        <main className="min-h-0 flex-1 overflow-y-auto px-8 pb-44 pt-14">
          {loadingMeta ? (
            <div className="text-center text-[#9ca3af]">正在加载问答权限...</div>
          ) : !knowledgeBases.length ? (
            <div className="rounded-xl border border-[#f0d6d6] bg-[#fff7f7] p-4 text-sm text-[#b91c1c]">
              {error || '暂无可用的问答知识库。'}
            </div>
          ) : (
            <div className="space-y-8">
              {messages.length === 0 ? (
                <section>
                  <div className="text-center">
                    <h2 className="text-[28px] font-extrabold tracking-normal text-[#111827]">
                      你好，我可以帮你查询文档内容
                    </h2>
                    <p className="mt-3 text-[16px] leading-7 text-[#8b8f99]">
                      支持基于已授权文档库进行问答、追问和引用定位
                    </p>
                  </div>
                  <div className="mt-10 text-[20px] text-[#848b96]">常用问题</div>
                  <div className="mt-5 space-y-3">
                    {questions.length ? (
                      questions.map(item => (
                        <button
                          key={`${item.question}-${item.hitCount}-${item.source || 'stat'}`}
                          type="button"
                          onClick={() => submit(item.question)}
                          className="w-full rounded-xl border border-[#eeeeee] bg-white px-5 py-4 text-left text-[18px] leading-7 text-[#374151] shadow-sm"
                        >
                          {item.question}
                        </button>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-[#e5e7eb] px-5 py-4 text-[15px] text-[#9ca3af]">
                        暂无历史热门问题。
                      </div>
                    )}
                  </div>
                </section>
              ) : null}

              {messages.map((message, index) => (
                <ConversationMessage key={index} message={message} />
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <footer className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-[560px] border-t border-[#eeeeee] bg-white">
          <div className="grid grid-cols-[minmax(0,1fr)_112px_112px] gap-2 px-4 pb-2 pt-2 sm:grid-cols-[minmax(0,1fr)_144px_144px]">
            <button
              type="button"
              onClick={() => setLibraryPickerOpen(true)}
              disabled={!knowledgeBases.length || loading}
              className="flex h-12 min-w-0 items-center rounded-xl border border-[#e5e7eb] bg-white px-3 text-left text-[15px] text-[#8c929c] disabled:text-[#9ca3af]"
            >
              <span className="shrink-0">当前文档类型：</span>
              <span className="min-w-0 flex-1 truncate text-[#555]">{selectedKnowledgeLabel}</span>
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
            placeholder="输入您的问题，最多100字"
            disabled={!selectedKnowledgeCodes.length}
            onChange={setInput}
            onSubmit={submit}
            onStop={stop}
          />
        </footer>

        {libraryPickerOpen ? (
          <div className="fixed inset-0 z-30 mx-auto flex max-w-[560px] items-end bg-black/20">
            <div className="w-full rounded-t-2xl bg-white px-5 pb-5 pt-4 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold text-[#111827]">选择文档库</div>
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

              <div className="max-h-[42vh] space-y-3 overflow-y-auto">
                {knowledgeBases.map(item => {
                  const selected = selectedKnowledgeSet.has(item.code)
                  return (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => toggleKnowledgeCode(item.code)}
                      className={
                        selected
                          ? 'flex h-12 w-full items-center justify-between rounded-xl bg-[#333] px-4 text-left text-white'
                          : 'flex h-12 w-full items-center justify-between rounded-xl border border-[#e5e7eb] bg-white px-4 text-left text-[#374151]'
                      }
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                      {selected ? <Check className="ml-3 h-4 w-4 shrink-0" /> : null}
                    </button>
                  )
                })}
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
    </div>
  )
}





