'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, Copy, FileText, X } from 'lucide-react'

type DocumentVersion = {
  documentId: number
  title: string
  status: string
  effectiveDate?: string
  repealDate?: string
  isCurrent: boolean
}

type RelatedDoc = {
  documentId: number
  title: string
  relType: string
}

type DocumentSegment = {
  segmentId: number
  segmentIndex: number
  content: string
  page: number
  anchor: string
  isFocused?: boolean
}

type DocumentData = {
  documentId: number
  title: string
  fileName: string
  fileType: string
  status: string
  effectiveDate?: string
  repealDate?: string
  repealedBy?: string
  versions?: DocumentVersion[]
  relatedDocs?: RelatedDoc[]
  segments: DocumentSegment[]
}

const relTypeLabels: Record<string, string> = {
  reference: '引用',
  supplement: '补充',
  repeal: '废止',
  related: '相关'
}

const statusLabels: Record<string, { label: string; cls: string }> = {
  active: { label: '生效中', cls: 'bg-[#dcfce7] text-[#16a34a]' },
  repealed: { label: '已废止', cls: 'bg-[#fef2f2] text-[#dc2626]' },
  draft: { label: '草案', cls: 'bg-[#fef9c3] text-[#a16207]' }
}

export function DocumentViewer({
  documentId,
  focusSegmentId,
  onClose
}: {
  documentId: number
  focusSegmentId?: number
  onClose: () => void
}) {
  const [doc, setDoc] = useState<DocumentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showVersions, setShowVersions] = useState(false)
  const [showRelated, setShowRelated] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const focusRef = useRef<HTMLDivElement>(null)

  const loadDoc = useCallback(async () => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    try {
      const params = focusSegmentId ? `?focusSegmentId=${focusSegmentId}` : ''
      const res = await fetch(`/api/chatdb/qa/documents/${documentId}/view${params}`, {
        signal: controller.signal,
        credentials: 'include'
      })
      if (!res.ok) throw new Error('加载文档失败')
      const json = await res.json()
      setDoc(json?.data || json)
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError(e instanceof Error ? e.message : '加载失败')
      }
    } finally {
      setLoading(false)
    }
    return () => controller.abort()
  }, [documentId, focusSegmentId])

  useEffect(() => {
    const cleanup = loadDoc()
    return () => { cleanup.then(fn => fn()) }
  }, [loadDoc])

  useEffect(() => {
    if (doc && focusRef.current) {
      setTimeout(() => {
        focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [doc])

  const handleCopy = (segmentId: number, content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedId(segmentId)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="flex h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-[#eee] px-5 py-3">
          <button type="button" onClick={onClose}
            className="flex items-center gap-1 text-[14px] text-[#6b7280] hover:text-[#374151]">
            <ChevronLeft className="h-4 w-4" /> 返回
          </button>
          <FileText className="h-5 w-5 text-[#6b7280]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[16px] font-bold text-[#111827]">
              {doc?.title || '加载中...'}
            </h2>
            {doc?.fileName ? (
              <p className="text-[12px] text-[#9ca3af]">{doc.fileName}</p>
            ) : null}
          </div>
          {doc?.effectiveDate ? (
            <span className="shrink-0 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[11px] font-medium text-[#16a34a]">
              生效 {doc.effectiveDate}
            </span>
          ) : null}
          {doc?.repealedBy ? (
            <span className="shrink-0 rounded-full bg-[#fef2f2] px-2 py-0.5 text-[11px] font-medium text-[#dc2626]">
              已废止
            </span>
          ) : null}
          <button type="button" onClick={onClose} className="ml-2 text-[#9ca3af] hover:text-[#374151]">
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-20 text-center text-[#9ca3af]">加载中...</div>
          ) : error ? (
            <div className="py-20 text-center text-[#dc2626]">{error}</div>
          ) : doc ? (
            <div className="space-y-5">
              {/* Version panel */}
              {doc.versions && doc.versions.length > 1 ? (
                <div>
                  <button type="button" onClick={() => setShowVersions(v => !v)}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#6b7280]">
                    版本历史({doc.versions.length})
                    <ChevronDown className={`h-3.5 w-3.5 transition ${showVersions ? 'rotate-180' : ''}`} />
                  </button>
                  {showVersions ? (
                    <div className="mt-2 space-y-1">
                      {doc.versions.map(v => {
                        const st = statusLabels[v.status] || { label: v.status, cls: 'bg-[#f3f4f6] text-[#6b7280]' }
                        return (
                          <div key={v.documentId}
                            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] ${
                              v.isCurrent ? 'border-[#bfdbfe] bg-[#eff6ff]' : 'border-[#e5e7eb] bg-white'
                            }`}>
                            <span className="min-w-0 flex-1 truncate font-medium text-[#374151]">{v.title}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${st.cls}`}>
                              {st.label}
                            </span>
                            {v.effectiveDate ? (
                              <span className="shrink-0 text-[11px] text-[#9ca3af]">{v.effectiveDate}</span>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Related docs panel */}
              {doc.relatedDocs && doc.relatedDocs.length > 0 ? (
                <div>
                  <button type="button" onClick={() => setShowRelated(v => !v)}
                    className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#6b7280]">
                    关联文档({doc.relatedDocs.length})
                    <ChevronDown className={`h-3.5 w-3.5 transition ${showRelated ? 'rotate-180' : ''}`} />
                  </button>
                  {showRelated ? (
                    <div className="mt-2 space-y-1">
                      {doc.relatedDocs.map(rd => (
                        <div key={`${rd.documentId}-${rd.relType}`}
                          className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-[#fafafa] px-3 py-2 text-[13px]">
                          <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-semibold text-[#6b7280]">
                            {relTypeLabels[rd.relType] || rd.relType}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[#374151]">{rd.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Repealed by note */}
              {doc.repealedBy ? (
                <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#dc2626]">
                  本文档已被「{doc.repealedBy}」废止
                </div>
              ) : null}

              {/* Segments */}
              <div className="space-y-3">
                {doc.segments.map(seg => (
                  <div key={seg.segmentId}
                    ref={seg.isFocused ? focusRef : undefined}
                    id={`seg-${seg.segmentId}`}
                    className={`group relative rounded-xl border px-4 py-3 text-[14px] leading-7 transition ${
                      seg.isFocused
                        ? 'border-[#bfdbfe] bg-[#eff6ff] shadow-sm'
                        : 'border-[#e5e7eb] bg-white hover:border-[#cbd5e1]'
                    }`}>
                    {seg.page ? (
                      <span className="mb-1 block text-[11px] text-[#9ca3af]">第 {seg.page} 页</span>
                    ) : null}
                    <p className="whitespace-pre-wrap text-[#374151]">{seg.content}</p>
                    <button type="button"
                      onClick={() => handleCopy(seg.segmentId, seg.content)}
                      className="absolute right-2 top-2 flex items-center gap-0.5 rounded-md border border-[#e5e7eb] bg-white px-1.5 py-0.5 text-[11px] text-[#9ca3af] opacity-0 transition group-hover:opacity-100 hover:text-[#374151]">
                      {copiedId === seg.segmentId ? '已复制' : (
                        <><Copy className="h-3 w-3" />复制</>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
