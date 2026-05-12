'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import { math } from '@streamdown/math'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Car,
  ChevronDown,
  ChevronUp,
  Copy,
  PieChart,
  RefreshCw,
  Table2
} from 'lucide-react'
import { Streamdown, type StreamdownProps } from 'streamdown'

import { mergeStreamdownSpecRenderer } from '@/lib/render/streamdown-spec'

import { QuestionInputBar } from './question-input-bar'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

type MajorCaseAnalysis = {
  metric?: string
  case?: {
    caseName?: string
    caseNumber?: string
    caseSource?: string
    reportTime?: string
    pendingStep?: string
    caseType?: string
    region?: string
    responsibilityUnit?: string
    caseLocation?: string
    description?: string
    impactScore?: number
    difficultyScore?: number
    totalScore?: number
  }
  basis?: string[]
}

type StoredConversation = {
  messages: Message[]
  sessionId?: string | null
  updatedAt: string
}

type TrafficDevice = {
  deviceId: string
  deviceName?: string
  region?: string
  address?: string
  enabled?: boolean
}

type TrafficIngestStatus = {
  enabled?: boolean
  connected?: boolean
  topic?: string
  latestReceivedAt?: string
  todayReceived?: number
  latestError?: string
}

type TrafficAggregateSummary = {
  total?: number
  inCount?: number
  outCount?: number
  hkMacauCount?: number
  hkMacauRatio?: number
  mainlandCount?: number
  unknownDirCount?: number
}

type TrafficAggregateSeriesItem = {
  name?: string
  total?: number
  inCount?: number
  outCount?: number
  hkMacauCount?: number
}

type TrafficAggregateResult = {
  summary?: TrafficAggregateSummary
  series?: TrafficAggregateSeriesItem[]
  groupBy?: string
}

type TrafficFilters = {
  deviceId: string
  datePreset: 'today' | '7d' | '30d' | 'custom'
  dateFrom: string
  dateTo: string
  holiday: boolean
}

type ChartSeries = {
  name?: string
  data: number[]
}

type ChartType = 'line' | 'bar' | 'pie' | 'table'

type ChartPayload = {
  type?: ChartType
  title?: string
  x?: string[]
  labels?: string[]
  series?: ChartSeries[]
  table?: {
    columns: string[]
    rows: Array<Array<string | number>>
  }
}

type ClarifyPayload = {
  question?: string
  options?: string[]
}

type RichBlock =
  | { type: 'markdown'; content: string }
  | { type: 'chart'; payload: ChartPayload }
  | { type: 'clarify'; payload: ClarifyPayload }

type AnswerSectionKind = 'conclusion' | 'insight' | 'visualization' | 'analysis'

type AnswerSection = {
  kind: AnswerSectionKind
  title: string
  content: string
}

const topicLabels: Record<string, string> = {
  grid: '网格',
  population: '人流',
  traffic: '车流'
}

const majorCaseKeywords = [
  '重大案件',
  '重点案件',
  '影响最大',
  '影响度最大',
  '影响最高',
  '难度最大',
  '处置难度最大',
  '处置最难',
  '最难处理'
]

const chartColors = [
  '#2563eb',
  '#f97316',
  '#16a34a',
  '#9333ea',
  '#e11d48',
  '#0891b2',
  '#ca8a04',
  '#4f46e5',
  '#db2777',
  '#059669',
  '#7c3aed',
  '#dc2626',
  '#0d9488',
  '#ea580c',
  '#475569',
  '#65a30d'
]
const conversationStoragePrefix = 'chatdb:ask-number:current-session'

const trafficRecommendedQuestions = [
  '今天各卡口车流量是多少？',
  '过去一周车流趋势如何？',
  '港澳车占比是多少？',
  '哪个卡口车流最高？',
  '洪澳岛-出方向今天进出车辆分别多少？',
  '某车牌最近经过哪些卡口？',
  '节假日车流和平日相比有什么变化？'
]

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultTrafficFilters(): TrafficFilters {
  const today = dateKey(new Date())
  return {
    deviceId: '',
    datePreset: 'today',
    dateFrom: today,
    dateTo: today,
    holiday: false
  }
}

function trafficPresetRange(preset: TrafficFilters['datePreset']) {
  const today = new Date()
  const end = dateKey(today)
  const start = new Date(today)
  if (preset === '7d') {
    start.setDate(today.getDate() - 6)
  } else if (preset === '30d') {
    start.setDate(today.getDate() - 29)
  }
  return { dateFrom: dateKey(start), dateTo: end }
}

const chartTypeOptions: Array<{
  type: ChartType
  label: string
  icon: typeof Activity
}> = [
  { type: 'line', label: '折线图', icon: Activity },
  { type: 'bar', label: '柱状图', icon: BarChart3 },
  { type: 'pie', label: '饼图', icon: PieChart },
  { type: 'table', label: '表格', icon: Table2 }
]

function safeParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function parseRichContent(content: string): RichBlock[] {
  const blocks: RichBlock[] = []
  const blockPattern =
    /```(chatdb-chart|chatdb-line-chart|chatdb-clarify)\s*([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = blockPattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: 'markdown',
        content: content.slice(lastIndex, match.index)
      })
    }

    const [, language, rawPayload] = match
    if (language === 'chatdb-clarify') {
      const payload = safeParseJson<ClarifyPayload>(rawPayload.trim())
      if (payload) {
        blocks.push({ type: 'clarify', payload })
      }
    } else {
      const payload = safeParseJson<ChartPayload>(rawPayload.trim())
      if (payload) {
        blocks.push({
          type: 'chart',
          payload: {
            ...payload,
            type:
              language === 'chatdb-line-chart' ? 'line' : payload.type || 'line'
          }
        })
      }
    }

    lastIndex = blockPattern.lastIndex
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'markdown', content: content.slice(lastIndex) })
  }

  return blocks.length ? blocks : [{ type: 'markdown', content }]
}

function parseAnswerSections(content: string): AnswerSection[] {
  const sectionPattern =
    /^##\s*(精准结论|特征洞察|可视化|推导分析|洞察分析|结论|分析|图表)\s*$/gm
  const matches = Array.from(content.matchAll(sectionPattern))
  if (!matches.length) return []

  const sections: AnswerSection[] = []
  const kindMap: Record<string, AnswerSectionKind> = {
    精准结论: 'conclusion',
    结论: 'conclusion',
    特征洞察: 'insight',
    分析: 'insight',
    可视化: 'visualization',
    图表: 'visualization',
    推导分析: 'analysis',
    洞察分析: 'analysis'
  }

  matches.forEach((match, index) => {
    const title = match[1]
    const start = (match.index || 0) + match[0].length
    const end =
      index + 1 < matches.length
        ? matches[index + 1].index || content.length
        : content.length
    const sectionContent = content.slice(start, end).trim()
    if (sectionContent) {
      sections.push({
        kind: kindMap[title] || 'insight',
        title,
        content: sectionContent
      })
    }
  })

  return sections
}

function buildLinePath(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number
) {
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x =
        values.length === 1 ? width / 2 : (index / (values.length - 1)) * width
      const y = height - ((value - min) / span) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function escapeSvgText(value: string | number) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function aggregatePieData(labels: string[], series: ChartSeries[]) {
  const data = series[0]?.data || []
  const groups = new Map<string, number>()

  data.forEach((value, index) => {
    const label = (labels[index] || `项目${index + 1}`).trim()
    groups.set(label, (groups.get(label) || 0) + value)
  })

  return Array.from(groups, ([label, value]) => ({ label, value }))
}

function formatPercent(value: number, total: number) {
  if (!total || value <= 0) return '0.00'
  const percent = (value / total) * 100
  return Math.max(percent, 0.01).toFixed(2)
}

function shouldRotateAxisLabels(labels: string[]) {
  return labels.some(label => label.length > 5) || labels.length > 6
}

function compactChartLabel(label: string, maxLength = 7) {
  const value = label.trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(maxLength - 1, 1))}…`
}

function splitChartLabel(label: string) {
  const value = label.trim()
  if (value.length <= 6) return [value]
  return [value.slice(0, 6), compactChartLabel(value.slice(6), 6)]
}

function svgToDataUrl(svgMarkup: string) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgMarkup)))}`	
}

function buildChartSvgForCopy(payload: ChartPayload) {
  const activeType = payload.type || 'line'
  const labels = payload.x || payload.labels || []
  const series = payload.series?.filter(item => item.data?.length) || []
  const values = series.flatMap(item => item.data)
  const max = values.length ? Math.max(...values) : 0
  const min =
    activeType === 'bar' || activeType === 'line'
      ? 0
      : values.length
        ? Math.min(...values)
        : 0
  const tableColumns = payload.table?.columns || [
    '维度',
    ...series.map((item, index) => item.name || `指标${index + 1}`)
  ]
  const tableRows =
    payload.table?.rows ||
    labels.map((label, labelIndex) => [
      label,
      ...series.map(item => item.data[labelIndex] ?? '-')
    ])

  return buildChartImageSvg({
    payload,
    activeType,
    labels,
    series,
    tableColumns,
    tableRows,
    min,
    max
  })
}

function buildAnswerCopyHtml(content: string) {
  const sections = parseAnswerSections(content)
  const sectionBlocks = sections.length
    ? sections.flatMap(section => [
        { type: 'heading' as const, content: section.title },
        ...parseRichContent(section.content)
      ])
    : parseRichContent(content)

  const body = sectionBlocks
    .map(block => {
      if (block.type === 'heading') {
        return `<h3 style="margin:16px 0 8px;font-size:16px;line-height:1.5;">${escapeHtml(block.content)}</h3>`
      }
      if (block.type === 'chart') {
        const dataUrl = svgToDataUrl(buildChartSvgForCopy(block.payload))
        return `<p style="margin:12px 0;"><img src="${dataUrl}" alt="图表" style="max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:12px;" /></p>`
      }
      if (block.type === 'clarify') {
        return ''
      }
      const text = block.content.trim()
      if (!text) return ''
      return `<div style="white-space:pre-wrap;margin:8px 0;line-height:1.7;">${escapeHtml(text)}</div>`
    })
    .filter(Boolean)
    .join('')

  return `<article>${body}</article>`
}

function buildChartImageSvg({
  payload,
  activeType,
  labels,
  series,
  tableColumns,
  tableRows,
  min,
  max
}: {
  payload: ChartPayload
  activeType: ChartType
  labels: string[]
  series: ChartSeries[]
  tableColumns: string[]
  tableRows: Array<Array<string | number>>
  min: number
  max: number
}) {
  const width = 760
  const titleHeight = payload.title ? 56 : 28
  const chartWidth = 640
  const chartHeight = 260
  const left = 70
  const top = titleHeight + 12
  const rotateAxisLabels = shouldRotateAxisLabels(labels)
  const title = payload.title ? escapeSvgText(payload.title) : '问数图表'
  const fontFamily = 'Arial, Microsoft YaHei, sans-serif'

  if (activeType === 'table') {
    const rowHeight = 38
    const visibleRows = tableRows.slice(0, 18)
    const height = titleHeight + rowHeight * (visibleRows.length + 1) + 48
    const columnWidth = Math.max(
      Math.floor((width - 64) / Math.max(tableColumns.length, 1)),
      120
    )
    const tableWidth = columnWidth * Math.max(tableColumns.length, 1)

    const header = tableColumns
      .map((column, index) => {
        const x = 32 + index * columnWidth
        return `
          <rect x="${x}" y="${titleHeight}" width="${columnWidth}" height="${rowHeight}" fill="#f8fafc" stroke="#e5e7eb"/>
          <text x="${x + 12}" y="${titleHeight + 24}" font-size="15" font-weight="600" fill="#374151">${escapeSvgText(column)}</text>
        `
      })
      .join('')
    const rows = visibleRows
      .map((row, rowIndex) =>
        tableColumns
          .map((_, columnIndex) => {
            const x = 32 + columnIndex * columnWidth
            const y = titleHeight + rowHeight * (rowIndex + 1)
            return `
              <rect x="${x}" y="${y}" width="${columnWidth}" height="${rowHeight}" fill="#ffffff" stroke="#e5e7eb"/>
              <text x="${x + 12}" y="${y + 24}" font-size="14" fill="#374151">${escapeSvgText(row[columnIndex] ?? '-')}</text>
            `
          })
          .join('')
      )
      .join('')

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${Math.max(width, tableWidth + 64)}" height="${height}" viewBox="0 0 ${Math.max(width, tableWidth + 64)} ${height}">
        <rect width="100%" height="100%" rx="18" fill="#ffffff"/>
        <text x="32" y="34" font-family="${fontFamily}" font-size="20" font-weight="700" fill="#111827">${title}</text>
        ${header}
        ${rows}
      </svg>
    `
  }

  if (activeType === 'pie' && series.length) {
    const pieItems = aggregatePieData(labels, series)
    const total = pieItems.reduce((sum, item) => sum + item.value, 0) || 1
    let offset = 0
    const slices = pieItems
      .map((item, index) => {
        const percent = Math.max(item.value / total, 0)
        const dash = `${(percent * 100).toFixed(3)} ${Math.max(100 - percent * 100, 0).toFixed(3)}`
        const slice = `<circle cx="170" cy="180" r="82" pathLength="100" fill="transparent" stroke="${chartColors[index % chartColors.length]}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(3)}" stroke-width="42" transform="rotate(-90 170 180)"/>`
        offset += percent * 100
        return slice
      })
      .join('')
    const legend = pieItems
      .map((item, index) => {
        const y = 110 + index * 34
        const percent = formatPercent(item.value, total)
        return `
          <rect x="340" y="${y - 12}" width="14" height="14" rx="3" fill="${chartColors[index % chartColors.length]}"/>
          <text x="366" y="${y}" font-family="${fontFamily}" font-size="16" fill="#374151">${escapeSvgText(item.label)}</text>
          <text x="590" y="${y}" font-family="${fontFamily}" font-size="16" fill="#6b7280">${escapeSvgText(item.value)} (${percent}%)</text>
        `
      })
      .join('')

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="360" viewBox="0 0 ${width} 360">
        <rect width="100%" height="100%" rx="18" fill="#ffffff"/>
        <text x="32" y="38" font-family="${fontFamily}" font-size="22" font-weight="700" fill="#111827">${title}</text>
        ${slices}
        <circle cx="170" cy="180" r="52" fill="#ffffff"/>
        ${legend}
      </svg>
    `
  }

  const axis = `
    <line x1="${left}" y1="${top}" x2="${left}" y2="${top + chartHeight}" stroke="#d1d5db"/>
    <line x1="${left}" y1="${top + chartHeight}" x2="${left + chartWidth}" y2="${top + chartHeight}" stroke="#d1d5db"/>
  `
  const labelSvg = labels
    .map((label, index) => {
      const x = left + (index / Math.max(labels.length - 1, 1)) * chartWidth
      const displayLabel = escapeSvgText(
        label.slice(0, rotateAxisLabels ? 12 : 8)
      )
      if (rotateAxisLabels) {
        return `<text x="${x}" y="${top + chartHeight + 34}" transform="rotate(45 ${x} ${top + chartHeight + 34})" font-family="${fontFamily}" font-size="13" text-anchor="start" fill="#6b7280">${displayLabel}</text>`
      }
      return `<text x="${x}" y="${top + chartHeight + 30}" font-family="${fontFamily}" font-size="13" text-anchor="middle" fill="#6b7280">${displayLabel}</text>`
    })
    .join('')
  const seriesSvg = series
    .map((item, seriesIndex) => {
      const color = chartColors[seriesIndex % chartColors.length]
      if (activeType === 'bar') {
        const groupWidth = chartWidth / Math.max(item.data.length, 1)
        const barWidth = Math.max(
          (groupWidth * 0.72) / Math.max(series.length, 1),
          12
        )
        return item.data
          .map((value, index) => {
            const height = ((value - min) / (max - min || 1)) * chartHeight
            const x =
              left +
              index * groupWidth +
              (groupWidth - barWidth * series.length) / 2 +
              seriesIndex * barWidth
            const labelY = Math.max(top + 18, top + chartHeight - height - 10)
            return `
              <rect x="${x}" y="${top + chartHeight - height}" width="${barWidth}" height="${height}" rx="6" fill="${color}" opacity="0.88"/>
              <text x="${x + barWidth / 2}" y="${labelY}" font-family="${fontFamily}" font-size="13" text-anchor="middle" fill="#374151">${escapeSvgText(value)}</text>
            `
          })
          .join('')
      }

      const path = buildLinePath(item.data, chartWidth, chartHeight, min, max)
      const points = item.data
        .map((value, index) => {
          const span = max - min || 1
          const x =
            item.data.length === 1
              ? chartWidth / 2
              : (index / (item.data.length - 1)) * chartWidth
          const y = chartHeight - ((value - min) / span) * chartHeight
          const labelY = Math.max(top + 16, top + y - 12)
          return `
            <circle cx="${left + x}" cy="${top + y}" r="5" fill="${color}"/>
            <text x="${left + x}" y="${labelY}" font-family="${fontFamily}" font-size="13" text-anchor="middle" fill="#374151">${escapeSvgText(value)}</text>
          `
        })
        .join('')
      return `<path d="${path}" transform="translate(${left} ${top})" fill="none" stroke="${color}" stroke-width="4"/>${points}`
    })
    .join('')
  const legends = series
    .map((item, index) => {
      const x = left + index * 150
      const y = top + chartHeight + 62
      return `
        <rect x="${x}" y="${y - 12}" width="12" height="12" rx="2" fill="${chartColors[index % chartColors.length]}"/>
        <text x="${x + 18}" y="${y}" font-family="${fontFamily}" font-size="13" fill="#6b7280">${escapeSvgText(item.name || `指标${index + 1}`)}</text>
      `
    })
    .join('')

  const height = rotateAxisLabels ? 470 : 420

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="100%" height="100%" rx="18" fill="#ffffff"/>
      <text x="32" y="38" font-family="${fontFamily}" font-size="22" font-weight="700" fill="#111827">${title}</text>
      ${axis}
      ${seriesSvg}
      ${labelSvg}
      ${legends}
    </svg>
  `
}

async function renderSvgToPngBlob(svgMarkup: string) {
  const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = url
    await image.decode()

    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext('2d')
    if (!context) return false

    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0)

    const pngBlob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/png')
    })
    return pngBlob
  } catch {
    return null
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function copySvgAsPng(svgMarkup: string) {
  if (typeof window === 'undefined') return false

  const pngBlobPromise = renderSvgToPngBlob(svgMarkup)

  if (
    typeof ClipboardItem !== 'undefined' &&
    navigator.clipboard?.write &&
    (!ClipboardItem.supports || ClipboardItem.supports('image/png'))
  ) {
    try {
      const htmlBlobPromise = pngBlobPromise.then(async blob => {
        if (!blob) throw new Error('图表图片生成失败')
        const dataUrl = await blobToDataUrl(blob)
        return new Blob([`<img src="${dataUrl}" />`], { type: 'text/html' })
      })
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': pngBlobPromise.then(blob => {
            if (!blob) throw new Error('图表图片生成失败')
            return blob
          }),
          'text/html': htmlBlobPromise
        })
      ])
      return true
    } catch {
      return false
    }
  }

  return false
}

function ChatDbChart({ payload }: { payload: ChartPayload }) {
  const [activeType, setActiveType] = useState<ChartType>(
    payload.type || 'line'
  )
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  )
  const labels = payload.x || payload.labels || []
  const series = payload.series?.filter(item => item.data?.length) || []

  if (!series.length && !payload.table?.rows?.length) return null

  const values = series.flatMap(item => item.data)
  const max = values.length ? Math.max(...values) : 0
  const min =
    activeType === 'bar' || activeType === 'line'
      ? 0
      : values.length
        ? Math.min(...values)
        : 0
  const chartWidth = 320
  const chartHeight = 150
  const axisLeft = 42
  const axisTop = 10
  const axisLabelHeight = shouldRotateAxisLabels(labels) ? 58 : 36
  const pieItems = activeType === 'pie' ? aggregatePieData(labels, series) : []
  const tableColumns = payload.table?.columns || [
    '维度',
    ...series.map((item, index) => item.name || `指标${index + 1}`)
  ]
  const tableRows =
    payload.table?.rows ||
    labels.map((label, labelIndex) => [
      label,
      ...series.map(item => item.data[labelIndex] ?? '-')
    ])
  const copyChart = async () => {
    const svgMarkup = buildChartImageSvg({
      payload,
      activeType,
      labels,
      series,
      tableColumns,
      tableRows,
      min,
      max
    })
    const copied = await copySvgAsPng(svgMarkup)
    setCopyStatus(copied ? 'copied' : 'failed')
    window.setTimeout(() => setCopyStatus('idle'), 1500)
  }

  return (
    <div className="my-3 rounded-xl border border-[#e8eef8] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {payload.title ? (
            <div className="truncate text-sm font-semibold text-[#111827]">
              {payload.title}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-[#edf0f5] bg-[#f9fafb] p-1">
          {chartTypeOptions.map(option => {
            const Icon = option.icon
            const selected = activeType === option.type
            return (
              <button
                key={option.type}
                type="button"
                onClick={() => setActiveType(option.type)}
                className={
                  selected
                    ? 'flex h-8 w-8 items-center justify-center rounded-md bg-[#4f83ff] text-white'
                    : 'flex h-8 w-8 items-center justify-center rounded-md text-[#9ca3af]'
                }
                aria-label={option.label}
                title={option.label}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      </div>

      {activeType === 'table' ? (
        <div className="overflow-x-auto rounded-lg border border-[#eef2f7]">
          <table className="min-w-full border-collapse text-left text-xs">
            <thead className="bg-[#f8fafc] text-[#6b7280]">
              <tr>
                {tableColumns.map(column => (
                  <th
                    key={column}
                    className="whitespace-nowrap px-3 py-2 font-medium"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f7]">
              {tableRows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="whitespace-nowrap px-3 py-2 text-[#374151]"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : activeType === 'pie' && pieItems.length ? (
        <div className="grid gap-4 sm:grid-cols-[170px_minmax(0,1fr)]">
          <svg
            viewBox="0 0 120 120"
            className="mx-auto h-[170px] w-[170px]"
            role="img"
          >
            {
              pieItems.reduce(
                (items, value, index) => {
                  const total =
                    pieItems.reduce((sum, item) => sum + item.value, 0) || 1
                  const percent = Math.max(value.value / total, 0)
                  const dash = `${(percent * 100).toFixed(3)} ${Math.max(100 - percent * 100, 0).toFixed(3)}`
                  const circle = (
                    <circle
                      key={index}
                      cx="60"
                      cy="60"
                      r="42"
                      pathLength="100"
                      fill="transparent"
                      stroke={chartColors[index % chartColors.length]}
                      strokeDasharray={dash}
                      strokeDashoffset={String(-items.offset)}
                      strokeWidth="22"
                      transform="rotate(-90 60 60)"
                    />
                  )
                  items.offset += percent * 100
                  items.nodes.push(circle)
                  return items
                },
                { offset: 0, nodes: [] as React.ReactNode[] }
              ).nodes
            }
            <circle cx="60" cy="60" r="28" fill="white" />
          </svg>
          <div className="grid min-w-0 content-center gap-3 text-sm">
            {pieItems.map((item, index) => {
              const total =
                pieItems.reduce((sum, pieItem) => sum + pieItem.value, 0) || 1
              return (
                <div
                  key={item.label}
                  className="grid min-w-0 grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-3"
                  title={`${item.label}：${item.value} (${formatPercent(item.value, total)}%)`}
                >
                  <span
                    className="h-3.5 w-3.5 rounded"
                    style={{
                      backgroundColor: chartColors[index % chartColors.length]
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[#374151]">
                    {item.label}
                  </span>
                  <span className="whitespace-nowrap tabular-nums text-[#6b7280]">
                    {item.value} ({formatPercent(item.value, total)}%)
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ) : series.length ? (
        <div className="overflow-x-auto">
          <svg
            className="min-w-[360px]"
            viewBox={`0 0 ${chartWidth + axisLeft + 12} ${chartHeight + axisTop + axisLabelHeight}`}
            role="img"
            aria-label={payload.title || '问数图表'}
          >
            <line
              x1={axisLeft}
              y1={axisTop}
              x2={axisLeft}
              y2={chartHeight + axisTop}
              stroke="#e5e7eb"
            />
            <line
              x1={axisLeft}
              y1={chartHeight + axisTop}
              x2={chartWidth + axisLeft}
              y2={chartHeight + axisTop}
              stroke="#e5e7eb"
            />
            <text
              x={axisLeft - 8}
              y={chartHeight + axisTop + 3}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              0
            </text>
            <text
              x={axisLeft - 8}
              y={axisTop + 4}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              {max}
            </text>
            {series.map((item, seriesIndex) => {
              const color = chartColors[seriesIndex % chartColors.length]
              if (activeType === 'bar') {
                const groupWidth = chartWidth / Math.max(item.data.length, 1)
                const barWidth = Math.max(
                  (groupWidth * 0.72) / Math.max(series.length, 1),
                  8
                )
                return item.data.map((value, index) => {
                  const height =
                    ((value - min) / (max - min || 1)) * chartHeight
                  const x =
                    axisLeft +
                    index * groupWidth +
                    (groupWidth - barWidth * series.length) / 2 +
                    seriesIndex * barWidth
                  const y = axisTop + chartHeight - height
                  return (
                    <g key={`${seriesIndex}-${index}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barWidth}
                        height={height}
                        rx="4"
                        fill={color}
                        opacity={0.86}
                      />
                      <text
                        x={x + barWidth / 2}
                        y={Math.max(12, y - 7)}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="600"
                        fill="#374151"
                      >
                        {value}
                      </text>
                    </g>
                  )
                })
              }

              const path = buildLinePath(
                item.data,
                chartWidth,
                chartHeight,
                min,
                max
              )
              return (
                <g key={seriesIndex} transform={`translate(${axisLeft} ${axisTop})`}>
                  <path d={path} fill="none" stroke={color} strokeWidth="3" />
                  {item.data.map((value, index) => {
                    const span = max - min || 1
                    const x =
                      item.data.length === 1
                        ? chartWidth / 2
                        : (index / (item.data.length - 1)) * chartWidth
                    const y = chartHeight - ((value - min) / span) * chartHeight
                    return (
                      <g key={index}>
                        <circle cx={x} cy={y} r="3.5" fill={color} />
                        <text
                          x={x}
                          y={Math.max(10, y - 8)}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="600"
                          fill="#374151"
                        >
                          {value}
                        </text>
                      </g>
                    )
                  })}
                </g>
              )
            })}
            {labels.map((label, index) => {
              const x =
                axisLeft + (index / Math.max(labels.length - 1, 1)) * chartWidth
              const y = chartHeight + axisTop + 22
              const lines = splitChartLabel(label)
              return (
                <text
                  key={label}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#6b7280"
                >
                  <title>{label}</title>
                  {lines.map((line, lineIndex) => (
                    <tspan
                      key={lineIndex}
                      x={x}
                      dy={lineIndex === 0 ? 0 : 13}
                    >
                      {line}
                    </tspan>
                  ))}
                </text>
              )
            })}
          </svg>
        </div>
      ) : null}
      {series.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#6b7280]">
          {series.map((item, index) => (
            <span key={index} className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{
                  backgroundColor: chartColors[index % chartColors.length]
                }}
              />
              {item.name || `指标${index + 1}`}
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={copyChart}
        className="mt-3 flex w-fit items-center gap-1 rounded-lg border border-[#dbe7ff] bg-[#f8fbff] px-2.5 py-1.5 text-xs text-[#2563eb]"
      >
        <Copy className="h-3.5 w-3.5" />
        {copyStatus === 'copied'
          ? '图表已复制'
          : copyStatus === 'failed'
            ? '复制失败'
            : '复制图表'}
      </button>
    </div>
  )
}

function TrafficDatePresetControl({
  value,
  onChange
}: {
  value: TrafficFilters['datePreset']
  onChange: (preset: TrafficFilters['datePreset']) => void
}) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-1">
      {[
        ['today', '当天'],
        ['7d', '近七天'],
        ['30d', '近三十天']
      ].map(([preset, label]) => (
        <button
          key={preset}
          type="button"
          onClick={() => onChange(preset as TrafficFilters['datePreset'])}
          className={
            value === preset
              ? 'h-7 rounded-md bg-[#2563eb] px-2 text-xs font-medium text-white'
              : 'h-7 rounded-md px-2 text-xs text-[#4b5563]'
          }
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ClarifyOptions({
  payload,
  onSelect
}: {
  payload: ClarifyPayload
  onSelect: (value: string) => void
}) {
  const options = payload.options?.slice(0, 5) || []
  if (!options.length) return null

  return (
    <div className="my-3 rounded-xl border border-[#ffe0d4] bg-[#fff7f4] p-3">
      <div className="text-sm font-semibold text-[#111827]">
        {payload.question || '请选择更明确的查询口径'}
      </div>
      <div className="mt-3 grid gap-2">
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => onSelect(option)}
            className="rounded-lg border border-[#ffd0bd] bg-white px-3 py-2 text-left text-sm text-[#1f2937]"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-2 text-xs text-[#9ca3af]">都不准确重新输入即可</div>
    </div>
  )
}

function AnalysisDetails({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = expanded ? ChevronUp : ChevronDown

  return (
    <section className="rounded-xl border border-[#cfe8b8] bg-[#f8fff2]">
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-[#2f7d32]">
          {expanded ? `收起${title}` : `展开${title}`}
        </span>
        <Icon className="h-4 w-4 shrink-0 text-[#2f7d32]" />
      </button>
      {expanded ? (
        <div className="border-t border-[#dff2d4] px-3 py-3">
          <div className="prose-sm prose-neutral max-w-none">{children}</div>
        </div>
      ) : null}
    </section>
  )
}

function AssistantContent({
  content,
  onClarify,
  trafficFilters,
  onTrafficPresetChange
}: {
  content: string
  onClarify: (value: string) => void
  trafficFilters?: TrafficFilters
  onTrafficPresetChange?: (preset: TrafficFilters['datePreset']) => void
}) {
  const streamdownProps = useMemo<Partial<StreamdownProps>>(
    () => ({
      mode: 'streaming' as const,
      plugins: mergeStreamdownSpecRenderer({ math })
    }),
    []
  )
  const blocks = useMemo(() => parseRichContent(content), [content])
  const sections = useMemo(() => parseAnswerSections(content), [content])

  const renderBlocks = (sectionContent: string) =>
    parseRichContent(sectionContent).map((block, index) => {
      if (block.type === 'chart') {
        return <ChatDbChart key={index} payload={block.payload} />
      }
      if (block.type === 'clarify') {
        return (
          <ClarifyOptions
            key={index}
            payload={block.payload}
            onSelect={onClarify}
          />
        )
      }
      return (
        <Streamdown key={index} {...streamdownProps}>
          {block.content}
        </Streamdown>
      )
    })

  if (sections.length) {
    const visibleSections = sections.filter(
      section =>
        section.kind !== 'visualization' ||
        parseRichContent(section.content).some(block => block.type === 'chart')
    )

    return (
      <div className="space-y-3">
        {visibleSections.map((section, index) => {
          if (section.kind === 'analysis') {
            return (
              <AnalysisDetails
                key={`${section.kind}-${index}`}
                title={section.title}
              >
                {renderBlocks(section.content)}
              </AnalysisDetails>
            )
          }

          const sectionClass =
            section.kind === 'conclusion'
              ? 'border-[#b9dcff] bg-[#eff8ff] text-left'
              : section.kind === 'insight'
                ? 'border-[#e5e7eb] bg-white'
                : 'border-[#e8eef8] bg-white'

          return (
            <section
              key={`${section.kind}-${index}`}
              className={`rounded-xl border p-3 ${sectionClass}`}
            >
              <div
                className={
                  section.kind === 'conclusion'
                    ? 'mb-2 text-sm font-semibold text-[#2f80ed]'
                    : section.kind === 'visualization'
                      ? 'mb-3 flex min-h-8 items-center justify-between gap-3 text-sm font-semibold text-[#111827]'
                      : 'mb-2 text-sm font-semibold text-[#111827]'
                }
              >
                <span>{section.title}</span>
                {section.kind === 'visualization' &&
                trafficFilters &&
                onTrafficPresetChange ? (
                  <TrafficDatePresetControl
                    value={trafficFilters.datePreset}
                    onChange={onTrafficPresetChange}
                  />
                ) : null}
              </div>
              <div
                className={
                  section.kind === 'conclusion'
                    ? 'prose prose-neutral max-w-none text-[17px] font-semibold leading-8 text-[#111827]'
                    : 'prose-sm prose-neutral max-w-none'
                }
              >
                {renderBlocks(section.content)}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <div className="prose-sm prose-neutral max-w-none">
      {blocks.map((block, index) => {
        if (block.type === 'chart') {
          return <ChatDbChart key={index} payload={block.payload} />
        }
        if (block.type === 'clarify') {
          return (
            <ClarifyOptions
              key={index}
              payload={block.payload}
              onSelect={onClarify}
            />
          )
        }
        return (
          <Streamdown key={index} {...streamdownProps}>
            {block.content}
          </Streamdown>
        )
      })}
    </div>
  )
}

function isMajorCaseQuestion(question: string) {
  return majorCaseKeywords.some(keyword => question.includes(keyword))
}

function majorCaseMetric(question: string) {
  if (
    question.includes('影响最大') ||
    question.includes('影响度最大') ||
    question.includes('影响最高')
  ) {
    return 'impact'
  }
  if (
    question.includes('难度最大') ||
    question.includes('处置难度最大') ||
    question.includes('处置最难') ||
    question.includes('最难处理')
  ) {
    return 'difficulty'
  }
  return 'combined'
}

function unwrapChatDbData<T>(payload: unknown): T | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as Record<string, unknown>
  if (record.data && typeof record.data === 'object') {
    return record.data as T
  }
  return payload as T
}

function formatMajorCaseAnalysis(payload: MajorCaseAnalysis) {
  const item = payload.case
  if (!item) return '暂无可分析的网格案件。'

  const lines = [
    `重大案件：${item.caseName || '未命名网格案件'}`,
    '',
    `案件编号：${item.caseNumber || '暂无'}`,
    `所属区域：${item.region || '暂无'}`,
    `案件类型：${item.caseType || '暂无'}`,
    `当前环节：${item.pendingStep || '暂无'}`,
    `综合评分：${item.totalScore ?? 0}（影响度${item.impactScore ?? 0}，处置难度${item.difficultyScore ?? 0}）`,
    ''
  ]

  if (payload.basis?.length) {
    lines.push('判断依据：')
    payload.basis.forEach(reason => {
      lines.push(`- ${reason}`)
    })
  }

  if (item.description) {
    lines.push('', `问题描述：${item.description}`)
  }

  return lines.join('\n')
}

function formatTrafficStatusTime(value?: string) {
  if (!value) return '暂无'
  return value
}

function trafficDeviceLabel(device: TrafficDevice) {
  return device.deviceName || device.deviceId
}

function buildTrafficFilterContext(
  question: string,
  filters: TrafficFilters,
  devices: TrafficDevice[]
) {
  const device = devices.find(item => item.deviceId === filters.deviceId)
  const parts = [
    `用户问题：${question}`,
    `当前筛选条件：时间=${filters.dateFrom} 至 ${filters.dateTo}`,
    '统计口径：只统计抓拍时间'
  ]
  if (device) {
    parts.push(
      `卡口=${trafficDeviceLabel(device)}，设备编码=${device.deviceId}`
    )
  }
  if (filters.holiday) {
    parts.push('节假日口径：按节假日对比或节假日范围优先分析')
  }
  return parts.join('；')
}

function trafficAggregateGroupBy(question: string, filters: TrafficFilters) {
  if (
    question.includes('趋势') ||
    question.includes('过去') ||
    question.includes('近7') ||
    question.includes('近七') ||
    filters.datePreset === '7d' ||
    filters.datePreset === '30d'
  ) {
    return 'day'
  }
  if (question.includes('港澳') || question.includes('占比')) {
    return 'plateRegion'
  }
  if (question.includes('进出') || question.includes('方向')) {
    return 'inDir'
  }
  return 'gate'
}

function formatTrafficAggregateAnswer(
  question: string,
  filters: TrafficFilters,
  devices: TrafficDevice[],
  result: TrafficAggregateResult
) {
  const summary = result.summary || {}
  const series = result.series || []
  const device = devices.find(item => item.deviceId === filters.deviceId)
  const range =
    filters.dateFrom === filters.dateTo
      ? filters.dateFrom
      : `${filters.dateFrom} 至 ${filters.dateTo}`
  const target = device ? trafficDeviceLabel(device) : '全部卡口'
  const total = summary.total || 0
  const inCount = summary.inCount || 0
  const outCount = summary.outCount || 0
  const hkMacauCount = summary.hkMacauCount || 0
  const mainlandCount = summary.mainlandCount || Math.max(total - hkMacauCount, 0)
  const hkMacauRatio =
    typeof summary.hkMacauRatio === 'number'
      ? (summary.hkMacauRatio * 100).toFixed(2)
      : total
        ? ((hkMacauCount / total) * 100).toFixed(2)
        : '0.00'

  if (!total) {
    return `## 精准结论\n\n${range}，${target}暂无车流记录。\n\n## 特征洞察\n\n当前筛选条件下未查询到卡口过车数据，可以确认测试数据是否已导入，或调整日期和卡口筛选。`
  }

  const top = [...series].sort((a, b) => (b.total || 0) - (a.total || 0))[0]
  const labels = series.map(item => item.name || '未知')
  const totals = series.map(item => item.total || 0)
  const ins = series.map(item => item.inCount || 0)
  const outs = series.map(item => item.outCount || 0)
  const chartType = result.groupBy === 'day' ? 'line' : 'bar'

  const tableColumns =
    result.groupBy === 'plateRegion'
      ? ['车牌来源', '车流量', '港澳车']
      : ['维度', '车流量', '进方向', '出方向']
  const tableRows =
    result.groupBy === 'plateRegion'
      ? series.map(item => [
          item.name || '未知',
          item.total || 0,
          item.hkMacauCount || 0
        ])
      : series.map(item => [
          item.name || '未知',
          item.total || 0,
          item.inCount || 0,
          item.outCount || 0
        ])

  const chartPayload = {
    type: chartType,
    title:
      result.groupBy === 'day'
        ? '车流趋势'
        : result.groupBy === 'plateRegion'
          ? '车牌来源分布'
          : '各卡口车流量',
    x: labels,
    series:
      result.groupBy === 'plateRegion'
        ? [{ name: '车流量', data: totals }]
        : [
            { name: '车流量', data: totals },
            { name: '进方向', data: ins },
            { name: '出方向', data: outs }
          ],
    table: {
      columns: tableColumns,
      rows: tableRows
    }
  }

  return [
    '## 精准结论',
    '',
    `${range}，${target}车流量共 ${total} 辆，其中进方向 ${inCount} 辆、出方向 ${outCount} 辆，港澳车辆 ${hkMacauCount} 辆，占比 ${hkMacauRatio}%。`,
    top ? `车流最高维度为「${top.name || '未知'}」，共 ${top.total || 0} 辆。` : '',
    '',
    '## 特征洞察',
    '',
    `大陆车辆 ${mainlandCount} 辆，港澳车辆 ${hkMacauCount} 辆；${question.includes('港澳') ? '港澳车占比是本次问题的核心指标。' : '可继续按卡口、日期或港澳车维度下钻。'}`,
    '',
    '## 可视化',
    '',
    '```chatdb-chart',
    JSON.stringify(chartPayload),
    '```',
    '',
    '## 洞察分析',
    '',
    '以上结果来自车流聚合接口，统计时间字段为抓拍时间 snapshot_time，并应用了页面顶部的日期与卡口筛选条件。'
  ]
    .filter(Boolean)
    .join('\n')
}

async function answerTrafficAggregateQuestion(
  question: string,
  filters: TrafficFilters,
  devices: TrafficDevice[]
) {
  if (question.includes('车牌') && !question.includes('港澳')) {
    return ''
  }
  const params = new URLSearchParams({
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    groupBy: trafficAggregateGroupBy(question, filters)
  })
  if (filters.deviceId) {
    params.set('deviceId', filters.deviceId)
  }
  if (filters.holiday) {
    params.set('holiday', 'true')
  }

  const response = await fetch(`/api/chatdb/traffic/aggregate?${params}`)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.message || '车流统计查询失败')
  }
  const result = unwrapChatDbData<TrafficAggregateResult>(payload)
  if (!result) return ''
  return formatTrafficAggregateAnswer(question, filters, devices, result)
}

function TrafficStatusBar({
  status,
  loading,
  onRefresh
}: {
  status: TrafficIngestStatus | null
  loading: boolean
  onRefresh: () => void
}) {
  const connected = Boolean(status?.connected)
  return (
    <div className="border-b border-[#eef2f7] bg-[#fbfdff] px-5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[#4b5563]">
        <span
          className={
            connected
              ? 'rounded-full bg-[#e8f7ee] px-2 py-1 font-medium text-[#16803a]'
              : 'rounded-full bg-[#fff5e8] px-2 py-1 font-medium text-[#b45309]'
          }
        >
          MQTT：{connected ? '已连接' : status?.enabled ? '未连接' : '未启用'}
        </span>
        <span>主题：{status?.topic || '暂无'}</span>
        <span>
          最新接收：{formatTrafficStatusTime(status?.latestReceivedAt)}
        </span>
        <span>今日入库：{status?.todayReceived ?? 0}</span>
        {status?.latestError ? (
          <span className="text-[#dc2626]">最近错误：{status.latestError}</span>
        ) : null}
        <button
          type="button"
          onClick={onRefresh}
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-[#dbe7ff] bg-white px-2 text-[#2563eb]"
        >
          <RefreshCw
            className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
          />
          刷新
        </button>
      </div>
    </div>
  )
}

function TrafficFilterPanel({
  filters,
  devices,
  onChange,
  onAsk
}: {
  filters: TrafficFilters
  devices: TrafficDevice[]
  onChange: (next: TrafficFilters) => void
  onAsk: (question: string) => void
}) {
  const applyPreset = (preset: TrafficFilters['datePreset']) => {
    if (preset === 'custom') {
      onChange({ ...filters, datePreset: preset })
      return
    }
    onChange({ ...filters, datePreset: preset, ...trafficPresetRange(preset) })
  }

  return (
    <div className="border-b border-[#eef2f7] bg-white px-5 py-3">
      <div className="grid gap-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
          <label className="grid gap-1 text-xs font-medium text-[#4b5563]">
            卡口
            <select
              value={filters.deviceId}
              onChange={event =>
                onChange({ ...filters, deviceId: event.target.value })
              }
              className="h-9 rounded-lg border border-[#e5e7eb] bg-white px-2 text-sm text-[#111827]"
            >
              <option value="">全部卡口</option>
              {devices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {trafficDeviceLabel(device)}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-1 text-xs font-medium text-[#4b5563]">
            时间
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[#e5e7eb] bg-[#f9fafb] p-1">
              {[
                ['today', '今天'],
                ['7d', '近7天'],
                ['30d', '近30天']
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    applyPreset(value as TrafficFilters['datePreset'])
                  }
                  className={
                    filters.datePreset === value
                      ? 'h-7 rounded-md bg-[#2563eb] text-xs font-medium text-white'
                      : 'h-7 rounded-md text-xs text-[#4b5563]'
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={event =>
              onChange({
                ...filters,
                datePreset: 'custom',
                dateFrom: event.target.value
              })
            }
            className="h-9 rounded-lg border border-[#e5e7eb] px-2 text-sm"
          />
          <input
            type="date"
            value={filters.dateTo}
            onChange={event =>
              onChange({
                ...filters,
                datePreset: 'custom',
                dateTo: event.target.value
              })
            }
            className="h-9 rounded-lg border border-[#e5e7eb] px-2 text-sm"
          />
          <label className="flex h-9 items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 text-sm text-[#374151]">
            <input
              type="checkbox"
              checked={filters.holiday}
              onChange={event =>
                onChange({ ...filters, holiday: event.target.checked })
              }
            />
            节假日
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {trafficRecommendedQuestions.slice(0, 5).map(question => (
            <button
              key={question}
              type="button"
              onClick={() => onAsk(question)}
              className="rounded-full border border-[#dbe7ff] bg-[#f8fbff] px-3 py-1.5 text-xs text-[#2563eb]"
            >
              {question}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function AskNumberChat({ initialTopic }: { initialTopic: string }) {
  const [topic] = useState(initialTopic)
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return ''
    return (
      new URLSearchParams(window.location.search).get('q')?.slice(0, 100) || ''
    )
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [storageReady, setStorageReady] = useState(false)
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(
    null
  )
  const [trafficStatus, setTrafficStatus] =
    useState<TrafficIngestStatus | null>(null)
  const [trafficStatusLoading, setTrafficStatusLoading] = useState(false)
  const [trafficDevices, setTrafficDevices] = useState<TrafficDevice[]>([])
  const [trafficFilters, setTrafficFilters] = useState<TrafficFilters>(() =>
    defaultTrafficFilters()
  )
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  const topicLabel = useMemo(() => topicLabels[topic] || '问数', [topic])
  const storageKey = useMemo(
    () => `${conversationStoragePrefix}:${topic}`,
    [topic]
  )

  useEffect(() => {
    const id = window.setTimeout(() => {
      setStorageReady(false)

      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setMessages([])
        setStorageReady(true)
        return
      }

      try {
        const stored = JSON.parse(raw) as StoredConversation
        const restoredMessages = Array.isArray(stored.messages)
          ? stored.messages.filter(
              item =>
                (item.role === 'user' || item.role === 'assistant') &&
                typeof item.content === 'string'
            )
          : []
        setMessages(restoredMessages)
        setSessionId(
          typeof stored.sessionId === 'string' ? stored.sessionId : null
        )
      } catch {
        setMessages([])
        setSessionId(null)
      } finally {
        setStorageReady(true)
      }
    }, 0)

    return () => window.clearTimeout(id)
  }, [storageKey])

  useEffect(() => {
    if (!storageReady || typeof window === 'undefined') return

    const conversation: StoredConversation = {
      messages,
      sessionId,
      updatedAt: new Date().toISOString()
    }

    window.localStorage.setItem(storageKey, JSON.stringify(conversation))
  }, [messages, sessionId, storageKey, storageReady])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const refreshTrafficStatus = useCallback(async () => {
    if (topic !== 'traffic') return
    setTrafficStatusLoading(true)
    try {
      const response = await fetch('/api/chatdb/traffic/ingest/status')
      const payload = await response.json().catch(() => null)
      const data = unwrapChatDbData<TrafficIngestStatus>(payload)
      if (response.ok && data) {
        setTrafficStatus(data)
      }
    } finally {
      setTrafficStatusLoading(false)
    }
  }, [topic])

  useEffect(() => {
    if (topic !== 'traffic') return
    const timer = window.setTimeout(() => {
      refreshTrafficStatus()
      fetch('/api/chatdb/traffic/devices')
        .then(response => response.json())
        .then(payload => {
          const data = unwrapChatDbData<{ list?: TrafficDevice[] }>(payload)
          setTrafficDevices(Array.isArray(data?.list) ? data.list : [])
        })
        .catch(() => setTrafficDevices([]))
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refreshTrafficStatus, topic])

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
  }

  const submit = async (
    forcedQuestion?: string,
    trafficFiltersOverride?: TrafficFilters
  ) => {
    const question = (forcedQuestion || input).trim().slice(0, 100)
    if (!question) return
    const activeTrafficFilters = trafficFiltersOverride || trafficFilters
    const outboundQuestion =
      topic === 'traffic'
        ? buildTrafficFilterContext(
            question,
            activeTrafficFilters,
            trafficDevices
          )
        : question

    if (loading) {
      stop()
      return
    }

    const controller = new AbortController()
    const contextMessages = messages
      .filter(message => message.content.trim())
      .slice(-10)
      .map(message => ({
        role: message.role,
        content: message.content.slice(0, 1600)
      }))

    abortRef.current = controller
    setInput('')
    setLoading(true)
    setMessages(prev => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '' }
    ])

    try {
      if (topic === 'grid' && isMajorCaseQuestion(question)) {
        const params = new URLSearchParams({
          metric: majorCaseMetric(question)
        })
        const response = await fetch(
          `/api/chatdb/grid/major-case-analysis?${params.toString()}`,
          { signal: controller.signal }
        )
        const payload = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(payload?.message || '重大案件分析失败')
        }
        const analysis = unwrapChatDbData<MajorCaseAnalysis>(payload)
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = {
              role: 'assistant',
              content: formatMajorCaseAnalysis(analysis || {})
            }
          }
          return next
        })
        return
      }

      const response = await fetch('/api/question-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          message: outboundQuestion,
          context: contextMessages,
          sessionId
        }),
        signal: controller.signal
      })

      if (!response.ok || !response.body) {
        throw new Error(await response.text())
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
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue

          try {
            const event = JSON.parse(raw)
            if (
              event.event === 'start' &&
              typeof event.data?.sessionId === 'string'
            ) {
              setSessionId(event.data.sessionId)
            }
            if (event.event === 'message' && event.content) {
              setMessages(prev => {
                const next = [...prev]
                const last = next[next.length - 1]
                if (last?.role === 'assistant') {
                  next[next.length - 1] = {
                    ...last,
                    content: last.content + event.content
                  }
                }
                return next
              })
            }
          } catch {
            // Ignore non-JSON SSE fragments from upstream.
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            next[next.length - 1] = {
              role: 'assistant',
              content:
                '问数服务暂时不可用，请确认 Go 后端已启动，并已配置 CHATDB_API_BASE 与 CHATDB_JWT_TOKEN。'
            }
          }
          return next
        })
      }
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null
      }
      setLoading(false)
    }
  }

  const resetConversation = async () => {
    const currentSessionId = sessionId
    stop()
    setMessages([])
    setInput('')
    setSessionId(null)
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey)
    }
    if (currentSessionId) {
      await fetch(
        `/api/question-chat/session/${encodeURIComponent(currentSessionId)}/reset`,
        {
          method: 'POST'
        }
      ).catch(() => undefined)
    }
  }

  const changeTrafficPreset = async (preset: TrafficFilters['datePreset']) => {
    if (preset === 'custom') return
    const nextFilters = {
      ...trafficFilters,
      datePreset: preset,
      ...trafficPresetRange(preset)
    }
    setTrafficFilters(nextFilters)

    {
      if (loading) return

      const presetUserIndex = [...messages]
        .map((message, index) => ({ message, index }))
        .reverse()
        .find(item => item.message.role === 'user')?.index
      if (presetUserIndex === undefined) return

      const presetAssistantIndex = messages.findIndex(
        (message, index) =>
          index > presetUserIndex && message.role === 'assistant'
      )
      if (presetAssistantIndex < 0) return

      const presetQuestion = messages[presetUserIndex].content
      const outboundQuestion = buildTrafficFilterContext(
        presetQuestion,
        nextFilters,
        trafficDevices
      )
      const contextMessages = messages
        .filter((message, index) =>
          index !== presetAssistantIndex && message.content.trim()
        )
        .slice(-10)
        .map(message => ({
          role: message.role,
          content: message.content.slice(0, 1600)
        }))
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)
      setMessages(prev =>
        prev.map((message, index) =>
          index === presetAssistantIndex ? { ...message, content: '' } : message
        )
      )

      try {
        const response = await fetch('/api/question-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            message: outboundQuestion,
            context: contextMessages,
            sessionId
          }),
          signal: controller.signal
        })

        if (!response.ok || !response.body) {
          throw new Error(await response.text())
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
            if (!line.startsWith('data: ')) continue
            const raw = line.slice(6).trim()
            if (!raw || raw === '[DONE]') continue

            try {
              const event = JSON.parse(raw)
              if (
                event.event === 'start' &&
                typeof event.data?.sessionId === 'string'
              ) {
                setSessionId(event.data.sessionId)
              }
              if (event.event === 'message' && event.content) {
                setMessages(prev =>
                  prev.map((message, index) =>
                    index === presetAssistantIndex
                      ? { ...message, content: message.content + event.content }
                      : message
                  )
                )
              }
            } catch {
              // Ignore non-JSON SSE fragments from upstream.
            }
          }
        }
      } catch (error) {
        if ((error as Error).name !== 'AbortError') {
          setMessages(prev =>
            prev.map((message, index) =>
              index === presetAssistantIndex
                ? { ...message, content: '问数服务暂时不可用，请稍后重试。' }
                : message
            )
          )
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        setLoading(false)
      }

      return
    }

    /*
    if (loading) return

    const userIndex = [...messages]
      .map((message, index) => ({ message, index }))
      .reverse()
      .find(item => item.message.role === 'user')?.index
    if (userIndex === undefined) return

    const assistantIndex = messages.findIndex(
      (message, index) => index > userIndex && message.role === 'assistant'
    )
    if (assistantIndex < 0) return

    const question = messages[userIndex].content
    setLoading(true)
    setMessages(prev =>
      prev.map((message, index) =>
        index === assistantIndex
          ? { ...message, content: '正在按新的时间范围查询...' }
          : message
      )
    )

    try {
      const answer = await answerTrafficAggregateQuestion(
        question,
        nextFilters,
        trafficDevices
      )
      setMessages(prev =>
        prev.map((message, index) =>
          index === assistantIndex
            ? {
                ...message,
                content: answer || '当前时间范围暂无可展示的车流统计结果。'
              }
            : message
        )
      )
    } catch {
      setMessages(prev =>
        prev.map((message, index) =>
          index === assistantIndex
            ? { ...message, content: '车流统计刷新失败，请稍后重试。' }
            : message
        )
      )
    } finally {
      setLoading(false)
    }
    */
  }

  const copyAnswer = async (content: string) => {
    if (!content || typeof window === 'undefined') return false

    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        const html = buildAnswerCopyHtml(content)
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([content], { type: 'text/plain' })
          })
        ])
        return true
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
        return true
      }
    } catch {
      // Fall back to plain text when rich clipboard permission is denied.
    }

    const textarea = document.createElement('textarea')
    textarea.value = content
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()

    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      document.body.removeChild(textarea)
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-[#f7f7f7] text-[#111827]">
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col bg-white">
        <header className="flex h-[72px] shrink-0 items-center gap-4 border-b border-[#eeeeee] px-5">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e5e5e5]"
            aria-label="返回首页"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {topic === 'traffic' ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eff6ff] text-[#2563eb]">
              <Car className="h-5 w-5" />
            </div>
          ) : null}
          <div>
            <h1 className="text-xl font-bold tracking-normal">
              {topicLabel}问数
            </h1>
            <p className="text-sm text-[#8b8f99]">当前只连接问数后端</p>
          </div>
          <button
            type="button"
            onClick={resetConversation}
            className="ml-auto h-10 rounded-lg border border-[#e5e5e5] bg-white px-4 text-sm font-medium text-[#374151] active:bg-[#f5f5f5]"
          >
            新对话
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-scroll px-5 py-6 [scrollbar-gutter:stable]">
          {messages.length === 0 ? (
            <div className="mt-20 text-center">
              <h2 className="text-3xl font-extrabold tracking-normal">
                请输入想了解的{topicLabel}问题
              </h2>
              <p className="mt-4 text-[#8b8f99]">
                {topic === 'traffic'
                  ? '例如：今天各卡口车流量、过去一周车流趋势、港澳车占比'
                  : '例如：过去一周人流对比、网格内影响最大的案件、粤C是哪里的车牌'}
              </p>
              {topic === 'traffic' ? (
                <div className="mx-auto mt-6 flex max-w-[420px] flex-wrap justify-center gap-2">
                  {trafficRecommendedQuestions.map(question => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => submit(question)}
                      className="rounded-full border border-[#dbe7ff] bg-[#f8fbff] px-3 py-1.5 text-xs text-[#2563eb]"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={
                    message.role === 'user'
                      ? 'ml-auto w-fit max-w-[82%] whitespace-pre-wrap break-words rounded-2xl bg-[#484848] px-4 py-3 text-white'
                      : 'group mr-auto w-full max-w-[92%] rounded-2xl border border-[#eeeeee] bg-[#fafafa] px-4 py-3 text-[#222]'
                  }
                >
                  {message.role === 'assistant' ? (
                    <>
                      {message.content ? (
                        <AssistantContent
                          content={message.content}
                          onClarify={option => submit(option)}
                          trafficFilters={
                            topic === 'traffic' ? trafficFilters : undefined
                          }
                          onTrafficPresetChange={
                            topic === 'traffic'
                              ? changeTrafficPreset
                              : undefined
                          }
                        />
                      ) : loading ? (
                        '正在查询...'
                      ) : null}
                      {message.content ? (
                        <button
                          type="button"
                          onClick={async () => {
                            const copied = await copyAnswer(message.content)
                            if (copied) {
                              setCopiedMessageIndex(index)
                              window.setTimeout(
                                () => setCopiedMessageIndex(null),
                                1500
                              )
                            }
                          }}
                          className="mt-3 flex w-fit items-center gap-1 rounded-lg border border-[#e5e7eb] bg-white px-2 py-1 text-xs text-[#6b7280]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedMessageIndex === index ? '已复制' : '复制'}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    message.content
                  )}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </main>

        <QuestionInputBar
          value={input}
          loading={loading}
          topic={topic}
          placeholder={`输入${topicLabel}问题，最多100字`}
          onChange={setInput}
          onSubmit={submit}
          onStop={stop}
        />
      </div>
    </div>
  )
}
