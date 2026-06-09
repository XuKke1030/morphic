'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

import { useVisualViewport } from '@/hooks/use-visual-viewport'

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
import { readSSEStream } from '@/lib/chatdb/sse'

import { QuestionInputBar } from './question-input-bar'

type InsightMeta = {
  keyPoints?: string[]
  impacts?: string[]
  suggestions?: string[]
}

type FastPathFormat = {
  version?: string
  sections?: string[]
  chartRule?: string
  insightCollapsedDefault?: boolean
  naturalLanguageOnly?: boolean
  insightMeta?: InsightMeta
}

type ThinkingFrame = {
  content: string
  timestamp: number
}

type Message = {
  role: 'user' | 'assistant'
  content: string
  metadata?: {
    fastPath?: boolean
    format?: FastPathFormat
    insightMeta?: InsightMeta
    allDates?: boolean
    hybrid?: boolean
    startTime?: number
    elapsedMs?: number
    tables?: string
  }
  thinkingFrames?: ThinkingFrame[]
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
    timeRiskScore?: number
    totalScore?: number
    level?: string
    suggestion?: string[]
  }
  basis?: string[]
  suggestion?: string[]
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

type ChartType =
  | 'line'
  | 'bar'
  | 'bar_compare'
  | 'bar_rank'
  | 'pie'
  | 'table'
  | 'metric_card'

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
              language === 'chatdb-line-chart'
                ? 'line'
                : payload.type === 'bar_compare'
                  ? 'bar_compare'
                  : payload.type === 'bar_rank'
                    ? 'bar_rank'
                    : payload.type || 'line'
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
  max: number,
  offsetX: number = 0,
  groupWidth: number = width
) {
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : offsetX + index * groupWidth + groupWidth / 2
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
    const label = (labels[index] || `项目${index + 1}`)
      .trim()
      .replace(/[（(][\s\S]*?[）)]$/, '')
      .trim()
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

function niceMax(value: number): number {
  if (value <= 0) return 0
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)))
  const residual = value / magnitude
  let nice: number
  if (residual <= 1) nice = 1
  else if (residual <= 2) nice = 2
  else if (residual <= 5) nice = 5
  else nice = 10
  return nice * magnitude
}

function compactChartLabel(label: string, maxLength = 7) {
  const value = label.trim()
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(maxLength - 1, 1))}…`
}

function splitChartLabel(label: string) {
  const value = label.trim()
  if (value.length <= 5) return [value]
  // Prefer breaking at "/" or spaces
  const breakChar = ['/', ' ', '／'].find(c => value.includes(c))
  if (breakChar) {
    const idx = value.indexOf(breakChar)
    const first = value.slice(0, idx)
    const rest = value.slice(idx + 1)
    return [first, ...(rest.length > 5 ? splitChartLabel(rest) : [rest])]
  }
  // No natural break point: break at 4 chars
  const lines: string[] = []
  for (let i = 0; i < value.length; i += 4) {
    lines.push(value.slice(i, i + 4))
  }
  return lines
}

function svgToDataUrl(svgMarkup: string) {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgMarkup)))}`
}

function applyChartTopN(
  labels: string[],
  series: ChartSeries[],
  topN: number | undefined
) {
  if (!topN || topN <= 0 || labels.length <= topN || !series.length)
    return { labels, series }
  const primarySeries = series[0]
  const indexed = labels.map((label, i) => ({
    label,
    value: primarySeries.data[i] ?? 0
  }))
  indexed.sort((a, b) => b.value - a.value)
  const kept = new Set(indexed.slice(0, topN).map(item => item.label))
  const keepIndices = labels
    .map((label, i) => (kept.has(label) ? i : -1))
    .filter(i => i >= 0)
  return {
    labels: keepIndices.map(i => labels[i]),
    series: series.map(item => ({
      ...item,
      data: keepIndices.map(i => item.data[i])
    }))
  }
}

function buildChartSvgForCopy(payload: ChartPayload, topN?: number) {
  const activeType = payload.type || 'line'
  const rawLabels = payload.x || payload.labels || []
  const rawSeries = payload.series?.filter(item => item.data?.length) || []
  const { labels, series } = applyChartTopN(rawLabels, rawSeries, topN)
  const values = series.flatMap(item => item.data)
  const rawDataMax = values.length ? Math.max(...values) : 0
  const max = activeType === 'pie' ? rawDataMax : niceMax(rawDataMax)
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

  if (activeType === 'metric_card' && tableRows.length) {
    const cardWidth = 200
    const cardHeight = 80
    const gap = 16
    const cols = Math.min(tableRows.length, 3)
    const rows = Math.ceil(tableRows.length / cols)
    const contentWidth = cols * cardWidth + (cols - 1) * gap
    const contentHeight = rows * cardHeight + (rows - 1) * gap
    const svgWidth = Math.max(width, contentWidth + 64)
    const svgHeight = titleHeight + contentHeight + 48

    const cards = tableRows
      .map((row, index) => {
        const col = index % cols
        const rowNum = Math.floor(index / cols)
        const x = 32 + col * (cardWidth + gap)
        const y = titleHeight + 16 + rowNum * (cardHeight + gap)
        const label = escapeSvgText(String(row[0] ?? ''))
        const value = escapeSvgText(row[1] != null ? String(row[1]) : '—')
        const isPrimary = index === 0
        const borderColor = isPrimary ? '#4f83ff' : '#e8eef8'
        const bgColor = isPrimary ? '#f0f5ff' : '#ffffff'
        const valueColor = isPrimary ? '#4f83ff' : '#111827'
        const valueSize = isPrimary ? '28' : '22'
        return `
        <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="12" fill="${bgColor}" stroke="${borderColor}" stroke-width="${isPrimary ? 2 : 1}"/>
        <text x="${x + 16}" y="${y + 28}" font-size="12" fill="#6b7280">${label}</text>
        <text x="${x + 16}" y="${y + 58}" font-size="${valueSize}" font-weight="700" fill="${valueColor}">${value}</text>
      `
      })
      .join('')

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
        <rect width="100%" height="100%" rx="18" fill="#ffffff"/>
        <text x="32" y="38" font-family="${fontFamily}" font-size="22" font-weight="700" fill="#111827">${title}</text>
        ${cards}
      </svg>
    `
  }

  const axis = `
    <line x1="${left}" y1="${top}" x2="${left}" y2="${top + chartHeight}" stroke="#d1d5db"/>
    <line x1="${left}" y1="${top + chartHeight}" x2="${left + chartWidth}" y2="${top + chartHeight}" stroke="#d1d5db"/>
    <text x="${left - 8}" y="${top + chartHeight + 3}" font-family="${fontFamily}" font-size="10" text-anchor="end" fill="#9ca3af">0</text>
    <text x="${left - 8}" y="${top + 4}" font-family="${fontFamily}" font-size="10" text-anchor="end" fill="#9ca3af">${max}</text>
    ${[0.25, 0.5, 0.75]
      .map(
        r => `
      <line x1="${left}" y1="${top + chartHeight * (1 - r)}" x2="${left + chartWidth}" y2="${top + chartHeight * (1 - r)}" stroke="#f3f4f6" stroke-dasharray="4 3"/>
      <text x="${left - 8}" y="${top + chartHeight * (1 - r) + 3}" font-family="${fontFamily}" font-size="10" text-anchor="end" fill="#d1d5db">${Math.round(max * r)}</text>
    `
      )
      .join('')}
  `
  const labelSvg = labels
    .map((label, index) => {
      const x = left + (index / Math.max(labels.length - 1, 1)) * chartWidth
      if (rotateAxisLabels) {
        const displayLabel = escapeSvgText(label.slice(0, 12))
        return `<text x="${x}" y="${top + chartHeight + 34}" transform="rotate(45 ${x} ${top + chartHeight + 34})" font-family="${fontFamily}" font-size="13" text-anchor="start" fill="#6b7280">${displayLabel}</text>`
      }
      const splitForCopy = (s: string): string[] => {
        if (s.length <= 5) return [s]
        const breakChar = ['/', ' ', '／'].find(c => s.includes(c))
        if (breakChar) {
          const idx = s.indexOf(breakChar)
          const first = s.slice(0, idx)
          const rest = s.slice(idx + 1)
          return [first, ...splitForCopy(rest)]
        }
        const lines: string[] = []
        for (let i = 0; i < s.length; i += 4) lines.push(s.slice(i, i + 4))
        return lines
      }
      const cleanLabel = label.replace(/[（(][\s\S]*?[）)]$/, '').trim()
      const lines = splitForCopy(cleanLabel).map(l => escapeSvgText(l))
      return lines
        .map(
          (line, li) =>
            `<text x="${x}" y="${top + chartHeight + 22 + li * 14}" font-family="${fontFamily}" font-size="11" text-anchor="middle" fill="#6b7280">${line}</text>`
        )
        .join('')
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
            const barY = top + chartHeight - height
            return `
              <rect x="${x}" y="${barY}" width="${barWidth}" height="${height}" rx="6" fill="${color}" opacity="0.88"/>
              <text x="${x + barWidth / 2}" y="${barY - 5}" font-family="${fontFamily}" font-size="13" text-anchor="middle" fill="#374151">${escapeSvgText(value)}</text>
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

function ChatDbChart({
  payload,
  topN
}: {
  payload: ChartPayload
  topN?: number
}) {
  const [activeType, setActiveType] = useState<ChartType>(
    payload.type || 'line'
  )
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  )
  const rawLabels = payload.x || payload.labels || []
  const rawSeries = payload.series?.filter(item => item.data?.length) || []

  let labels = rawLabels
  let series = rawSeries
  if (topN && topN > 0 && labels.length > topN && series.length) {
    const primarySeries = series[0]
    const indexed = labels.map((label, i) => ({
      label,
      value: primarySeries.data[i] ?? 0
    }))
    indexed.sort((a, b) => b.value - a.value)
    const kept = new Set(indexed.slice(0, topN).map(item => item.label))
    const keepIndices = labels
      .map((label, i) => (kept.has(label) ? i : -1))
      .filter(i => i >= 0)
    labels = keepIndices.map(i => labels[i])
    series = series.map(item => ({
      ...item,
      data: keepIndices.map(i => item.data[i])
    }))
  }

  if (!series.length && !payload.table?.rows?.length) return null

  const values = series.flatMap(item => item.data)
  const rawDataMax = values.length ? Math.max(...values) : 0
  const max = activeType === 'pie' ? rawDataMax : niceMax(rawDataMax)
  const min =
    activeType === 'bar' || activeType === 'line'
      ? 0
      : values.length
        ? Math.min(...values)
        : 0
  const chartWidth = 320
  const chartHeight = 150
  const maxLabelLen = String(max).length
  const axisLeft = maxLabelLen >= 4 ? 52 : 42
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
      ) : activeType === 'bar_rank' && series.length ? (
        <div className="overflow-x-auto">
          <svg
            className="min-w-[360px]"
            viewBox={'0 0 360 ' + (20 + labels.length * 32)}
            role="img"
            aria-label={payload.title || '问数排名图'}
          >
            {labels.map((label, index) => {
              const value = series[0]?.data?.[index] ?? 0
              const barMax = 200
              const barW = (value / (max || 1)) * barMax
              const y = 10 + index * 32
              return (
                <g key={label}>
                  <text
                    x={80}
                    y={y + 14}
                    textAnchor="end"
                    fontSize="10"
                    fill="#374151"
                  >
                    <title>{label}</title>
                    {label.length > 7 ? label.slice(0, 7) + '...' : label}
                  </text>
                  <rect
                    x={90}
                    y={y + 2}
                    width={barW}
                    height={18}
                    rx="4"
                    fill={chartColors[0]}
                    opacity={0.86}
                  />
                  <text
                    x={90 + barW + 6}
                    y={y + 15}
                    fontSize="10"
                    fontWeight="600"
                    fill="#374151"
                  >
                    {value}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
      ) : activeType === 'metric_card' && tableRows.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tableRows.map((row, index) => {
            const label = String(row[0] ?? '')
            const value = row[1] != null ? String(row[1]) : '—'
            const isPrimary = index === 0
            return (
              <div
                key={index}
                className={
                  isPrimary
                    ? 'rounded-lg border-2 border-[#4f83ff] bg-[#f0f5ff] px-4 py-3'
                    : 'rounded-lg border border-[#e8eef8] bg-white px-4 py-3'
                }
              >
                <div className="text-xs text-[#6b7280]">{label}</div>
                <div
                  className={
                    isPrimary
                      ? 'mt-1 text-2xl font-bold tabular-nums text-[#4f83ff]'
                      : 'mt-1 text-xl font-semibold tabular-nums text-[#111827]'
                  }
                >
                  {value}
                </div>
              </div>
            )
          })}
        </div>
      ) : series.length ? (
        <div className="overflow-x-auto">
          {(() => {
            const barLayout =
              activeType === 'bar'
                ? (() => {
                    const rawGroupWidth =
                      chartWidth / Math.max(labels.length, 1)
                    const maxGroupWidth = 80
                    const groupWidth = Math.min(rawGroupWidth, maxGroupWidth)
                    const totalBarsWidth = groupWidth * labels.length
                    const barOffset = (chartWidth - totalBarsWidth) / 2
                    const barWidth = Math.min(
                      Math.max(
                        (groupWidth * 0.72) / Math.max(series.length, 1),
                        8
                      ),
                      48
                    )
                    return { groupWidth, barOffset, barWidth }
                  })()
                : null
            return (
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
                {[0.25, 0.5, 0.75].map(ratio => (
                  <g key={ratio}>
                    <line
                      x1={axisLeft}
                      y1={axisTop + chartHeight * (1 - ratio)}
                      x2={chartWidth + axisLeft}
                      y2={axisTop + chartHeight * (1 - ratio)}
                      stroke="#f3f4f6"
                      strokeDasharray="4 3"
                    />
                    <text
                      x={axisLeft - 8}
                      y={axisTop + chartHeight * (1 - ratio) + 3}
                      textAnchor="end"
                      fontSize="10"
                      fill="#d1d5db"
                    >
                      {Math.round(max * ratio)}
                    </text>
                  </g>
                ))}
                {series.map((item, seriesIndex) => {
                  const color = chartColors[seriesIndex % chartColors.length]
                  if (activeType === 'bar' && barLayout) {
                    const {
                      groupWidth,
                      barOffset,
                      barWidth: clampedBarWidth
                    } = barLayout
                    return item.data.map((value, index) => {
                      const height =
                        ((value - min) / (max - min || 1)) * chartHeight
                      const x =
                        axisLeft +
                        barOffset +
                        index * groupWidth +
                        (groupWidth - clampedBarWidth * series.length) / 2 +
                        seriesIndex * clampedBarWidth
                      const y = axisTop + chartHeight - height
                      return (
                        <g key={`${seriesIndex}-${index}`}>
                          <rect
                            x={x}
                            y={y}
                            width={clampedBarWidth}
                            height={height}
                            rx="6"
                            fill={color}
                            opacity={0.88}
                          />
                          <text
                            x={x + clampedBarWidth / 2}
                            y={y - 5}
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

                  const lineLayout = (() => {
                    const rawGroupWidth =
                      chartWidth / Math.max(item.data.length, 1)
                    const maxGroupWidth = 80
                    const groupWidth = Math.min(rawGroupWidth, maxGroupWidth)
                    const totalWidth = groupWidth * item.data.length
                    const offsetX = (chartWidth - totalWidth) / 2
                    return { groupWidth, offsetX }
                  })()
                  const path = buildLinePath(
                    item.data,
                    chartWidth,
                    chartHeight,
                    min,
                    max,
                    lineLayout.offsetX,
                    lineLayout.groupWidth
                  )
                  return (
                    <g
                      key={seriesIndex}
                      transform={`translate(${axisLeft} ${axisTop})`}
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke={color}
                        strokeWidth="3"
                      />
                      {item.data.map((value, index) => {
                        const span = max - min || 1
                        const x =
                          item.data.length === 1
                            ? chartWidth / 2
                            : lineLayout.offsetX +
                              index * lineLayout.groupWidth +
                              lineLayout.groupWidth / 2
                        const y =
                          chartHeight - ((value - min) / span) * chartHeight
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
                    activeType === 'bar' && barLayout
                      ? axisLeft +
                        barLayout.barOffset +
                        index * barLayout.groupWidth +
                        barLayout.groupWidth / 2
                      : (() => {
                          const rawGW = chartWidth / Math.max(labels.length, 1)
                          const maxGW = 80
                          const gw = Math.min(rawGW, maxGW)
                          const tw = gw * labels.length
                          const ox = (chartWidth - tw) / 2
                          return axisLeft + ox + index * gw + gw / 2
                        })()
                  const y = chartHeight + axisTop + 22
                  const cleanLabel = label
                    .replace(/[（(][\s\S]*?[）)]$/, '')
                    .trim()
                  const lines = splitChartLabel(cleanLabel)
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
            )
          })()}
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
  collapsedDefault,
  items,
  children
}: {
  title: string
  collapsedDefault?: boolean
  items?: string[]
  children: React.ReactNode
}) {
  const [expanded, setExpanded] = useState(
    collapsedDefault !== false ? false : true
  )
  const Icon = expanded ? ChevronUp : ChevronDown
  const displayTitle = title === '特征洞察' ? '数据说明' : title === '洞察分析' ? '洞察建议' : title
  const isInsight = title.includes('洞察')
  const borderColor = isInsight ? 'border-[#d4e0f7]' : 'border-[#cfe8b8]'
  const bgColor = isInsight ? 'bg-[#f5f8ff]' : 'bg-[#f8fff2]'
  const textColor = isInsight ? 'text-[#2563eb]' : 'text-[#2f7d32]'
  const dividerColor = isInsight ? 'border-[#dce6f5]' : 'border-[#dff2d4]'

  return (
    <section className={`rounded-xl border ${borderColor} ${bgColor}`}>
      <button
        type="button"
        onClick={() => setExpanded(value => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left min-h-[40px]"
        aria-expanded={expanded}
      >
        <span className={`text-sm font-semibold ${textColor}`}>
          {expanded ? `收起${displayTitle}` : `展开${displayTitle}`}
        </span>
        <Icon className={`h-4 w-4 shrink-0 ${textColor}`} />
      </button>
      {expanded ? (
        <div className={`border-t ${dividerColor} px-3 py-3`}>
          {items && items.length > 0 ? (
            <ul className="space-y-1.5">
              {items.map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-[#374151]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-40" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="prose-sm prose-neutral max-w-none">{children}</div>
          )}
        </div>
      ) : null}
    </section>
  )
}

function extractTablesFromThinking(frames?: ThinkingFrame[]): string[] {
  if (!frames || frames.length === 0) return []
  const tables = new Set<string>()
  for (const frame of frames) {
    const sql = frame.content
    const fromMatches = sql.match(/\bFROM\s+`?(\w+)`?/gi)
    if (fromMatches) {
      for (const m of fromMatches) {
        const name = m.replace(/\bFROM\s+`?/i, '').replace(/`$/, '')
        if (
          name &&
          !/select|where|and|or|group|order|having|limit|join|on|set|into|values/i.test(
            name
          )
        ) {
          tables.add(name)
        }
      }
    }
    const joinMatches = sql.match(/\bJOIN\s+`?(\w+)`?/gi)
    if (joinMatches) {
      for (const m of joinMatches) {
        const name = m.replace(/\bJOIN\s+`?/i, '').replace(/`$/, '')
        if (name) tables.add(name)
      }
    }
  }
  return [...tables]
}

function ThinkingProcess({ frames }: { frames: ThinkingFrame[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#ff6b2b]"
      >
        查看思考过程{' '}
        <ChevronDown
          className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="mt-2 space-y-2 border-t border-[#eeeeee] pt-2">
          {frames.map((frame, i) => (
            <div
              key={i}
              className="rounded-xl bg-[#f8fafc] px-3 py-2 text-sm text-[#64748b]"
            >
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs leading-5">
                {frame.content}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function AssistantContent({
  content,
  insightMeta,
  insightCollapsedDefault,
  onClarify,
  trafficFilters,
  onTrafficPresetChange,
  allDates,
  userQuestion,
  elapsedMs,
  topic,
  thinkingFrames,
  tables
}: {
  content: string
  insightMeta?: InsightMeta
  insightCollapsedDefault?: boolean
  onClarify: (value: string) => void
  trafficFilters?: TrafficFilters
  onTrafficPresetChange?: (preset: TrafficFilters['datePreset']) => void
  allDates?: boolean
  userQuestion?: string
  elapsedMs?: number
  topic?: string
  thinkingFrames?: ThinkingFrame[]
  tables?: string
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

  const topN = useMemo(() => {
    if (!userQuestion) return undefined
    const m = userQuestion.match(/前\s*(\d+)\s*(名|位|个|名)?/)
    if (m && m[1]) return parseInt(m[1], 10)
    if (/排名|排行|对比|top/i.test(userQuestion)) return 5
    return 5 // 移动端默认最多显示5条
  }, [userQuestion])

  const renderBlocks = (sectionContent: string) =>
    parseRichContent(sectionContent).map((block, index) => {
      if (block.type === 'chart') {
        return <ChatDbChart key={index} payload={block.payload} topN={topN} />
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

    const nonAnalysis = visibleSections.filter(s => s.kind !== 'analysis')
    const analysisSections = visibleSections.filter(s => s.kind === 'analysis')
    const orderedSections = [...nonAnalysis, ...analysisSections]

    return (
      <div className="space-y-3">
        {orderedSections.map((section, index) => {
          if (section.kind === 'analysis' || section.kind === 'insight') {
            const metaItems =
              section.kind === 'insight'
                ? insightMeta?.keyPoints
                : section.title.includes('建议')
                  ? insightMeta?.suggestions
                  : insightMeta?.impacts
            return (
              <AnalysisDetails
                key={`${section.kind}-${index}`}
                title={section.title}
                collapsedDefault={insightCollapsedDefault}
                items={metaItems}
              >
                {renderBlocks(section.content)}
              </AnalysisDetails>
            )
          }

          const sectionClass =
            section.kind === 'conclusion'
              ? 'border-[#b9dcff] bg-[#eff8ff] text-left'
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
                onTrafficPresetChange &&
                !allDates ? (
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
          return <ChatDbChart key={index} payload={block.payload} topN={topN} />
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
    `综合评分：${item.totalScore ?? 0}（影响度${item.impactScore ?? 0}，处置难度${item.difficultyScore ?? 0}，时效风险${item.timeRiskScore ?? 0}），等级：${item.level || '暂无'}`,
    ''
  ]

  if (payload.basis?.length) {
    lines.push('判断依据：')
    payload.basis.forEach(reason => {
      lines.push(`- ${reason}`)
    })
  }

  const suggestions = payload.suggestion?.length
    ? payload.suggestion
    : item.suggestion || []
  if (suggestions.length) {
    lines.push('', '处置建议：')
    suggestions.forEach(suggestion => {
      lines.push(`- ${suggestion}`)
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
  const mainlandCount =
    summary.mainlandCount || Math.max(total - hkMacauCount, 0)
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
    top
      ? `车流最高维度为「${top.name || '未知'}」，共 ${top.total || 0} 辆。`
      : '',
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

  const response = await fetch(`/api/chatdb/traffic/aggregate?${params}`, {
    credentials: 'include'
  })
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

export function AskNumberChat({
  initialAlertId = 0,
  initialAutoAsk = false,
  initialQuestion = '',
  initialTopic
}: {
  initialAlertId?: number
  initialAutoAsk?: boolean
  initialQuestion?: string
  initialTopic: string
}) {
  const { height: vvHeight } = useVisualViewport()
  const [topic] = useState(initialTopic)
  const [input, setInput] = useState(() => {
    if (typeof window === 'undefined') return ''
    return initialQuestion.slice(0, 100)
  })
  const [messages, setMessages] = useState<Message[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([])
  const [inputPlaceholder, setInputPlaceholder] = useState('')
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
  const autoAskRef = useRef(false)
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

  useEffect(() => {
    if (!storageReady || sessionId) return
    let active = true

    async function createSession() {
      try {
        const response = await fetch('/api/chatdb/chats/sessions', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            source: initialAlertId ? 'topic_alert' : 'topic_entry',
            alertId: initialAlertId
          })
        })
        const payload = await response.json().catch(() => null)
        const data = unwrapChatDbData<{
          sessionId?: string
          suggestedQuestions?: string[]
          inputPlaceholder?: string
        }>(payload)
        if (active && response.ok && data?.sessionId) {
          setSessionId(data.sessionId)
          if (data.suggestedQuestions?.length) {
            setSuggestedQuestions(data.suggestedQuestions)
          }
          if (data.inputPlaceholder) {
            setInputPlaceholder(data.inputPlaceholder)
          }
        }
      } catch {
        // Session creation failed — show error so user knows something went wrong.
        // Chat requests can still create a session via the backend's auto-create,
        // but the user should be aware of the initialization failure.
        if (active) {
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: '会话初始化失败，部分功能可能受限。请尝试刷新页面。'
            }
          ])
        }
      }
    }

    createSession()
    return () => {
      active = false
    }
  }, [initialAlertId, sessionId, storageReady, topic])

  const refreshTrafficStatus = useCallback(async () => {
    if (topic !== 'traffic') return
    setTrafficStatusLoading(true)
    try {
      const response = await fetch('/api/chatdb/traffic/ingest/status', {
        credentials: 'include'
      })
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
      fetch('/api/chatdb/traffic/devices', { credentials: 'include' })
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
    trafficFiltersOverride?: TrafficFilters,
    meta?: { alertId?: number; source?: string }
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
    const requestStart = Date.now()
    setMessages(prev => [
      ...prev,
      { role: 'user', content: question },
      { role: 'assistant', content: '', metadata: { startTime: requestStart } }
    ])

    try {
      if (topic === 'grid' && isMajorCaseQuestion(question)) {
        const params = new URLSearchParams({
          metric: majorCaseMetric(question)
        })
        const response = await fetch(
          `/api/chatdb/grid/major-case-analysis?${params.toString()}`,
          { signal: controller.signal, credentials: 'include' }
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

      const response = await fetch('/api/chatdb/chats', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          message: outboundQuestion,
          context: contextMessages,
          sessionId,
          source: meta?.source || '',
          alertId: meta?.alertId || 0
        }),
        signal: controller.signal
      })

      if (!response.ok || !response.body) {
        throw new Error(await response.text())
      }

      await readSSEStream(response.body, event => {
        if (
          event.event === 'start' &&
          typeof (event.data as Record<string, unknown>)?.sessionId === 'string'
        ) {
          setSessionId(
            (event.data as Record<string, unknown>).sessionId as string
          )
        }
        if (event.event === 'fast_path') {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                metadata: {
                  fastPath: (event.fastPath as boolean) ?? true,
                  format: (event.format ??
                    (event.data as Record<string, unknown>)?.format) as
                    | FastPathFormat
                    | undefined,
                  insightMeta: (
                    ((event.data as Record<string, unknown>)?.format ??
                      (event.format as Record<string, unknown>)) as
                      | Record<string, unknown>
                      | undefined
                  )?.insightMeta as Record<string, unknown> | undefined,
                  allDates: ((event.data as Record<string, unknown>)
                    ?.allDates ?? event.allDates) as boolean | undefined,
                  hybrid: ((event.data as Record<string, unknown>)?.hybrid ??
                    event.hybrid) as boolean | undefined
                }
              }
            }
            return next
          })
        }
        if (event.event === 'thinking' && event.content) {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              const frames = [
                ...(last.thinkingFrames || []),
                { content: event.content!, timestamp: Date.now() }
              ]
              next[next.length - 1] = { ...last, thinkingFrames: frames }
            }
            return next
          })
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
        if (event.event === 'tables' && event.content) {
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                metadata: { ...last.metadata, tables: event.content }
              }
            }
            return next
          })
        }
        if (
          event.event === 'error' &&
          ((event.data as Record<string, unknown>)?.message as
            | string
            | undefined)
        ) {
          const msg = (event.data as Record<string, unknown>).message as string
          setMessages(prev => {
            const next = [...prev]
            const last = next[next.length - 1]
            if (last?.role === 'assistant') {
              next[next.length - 1] = {
                ...last,
                content: last.content
                  ? last.content + '\n\n⚠ ' + msg
                  : '⚠ ' + msg
              }
            }
            return next
          })
        }
      })
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        setMessages(prev => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant' && !last.content) {
            next[next.length - 1] = {
              role: 'assistant',
              content: '问数服务暂时不可用，请稍后重试或联系管理员。'
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
      setMessages(prev => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last?.role === 'assistant' && last.metadata?.startTime) {
          next[next.length - 1] = {
            ...last,
            metadata: {
              ...last.metadata,
              elapsedMs: Date.now() - last.metadata.startTime
            }
          }
        }
        return next
      })
    }
  }

  useEffect(() => {
    if (!storageReady || !initialAutoAsk || autoAskRef.current) return
    const question = initialQuestion.trim().slice(0, 100)
    if (!question) return
    autoAskRef.current = true
    const timer = window.setTimeout(() => {
      submit(question, undefined, {
        alertId: initialAlertId,
        source: 'alert_click'
      })
    }, 0)
    return () => window.clearTimeout(timer)
    // submit intentionally stays out of the deps so the alert auto-ask fires once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAlertId, initialAutoAsk, initialQuestion, storageReady])

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
        `/api/chatdb/chats/sessions/${encodeURIComponent(currentSessionId)}/reset`,
        {
          method: 'POST',
          credentials: 'include'
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
        .filter(
          (message, index) =>
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
        const response = await fetch('/api/chatdb/chats', {
          method: 'POST',
          credentials: 'include',
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

        await readSSEStream(response.body, event => {
          if (
            event.event === 'start' &&
            typeof (event.data as Record<string, unknown>)?.sessionId ===
              'string'
          ) {
            setSessionId(
              (event.data as Record<string, unknown>).sessionId as string
            )
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
        })
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
    <div
      className="flex h-dvh w-full flex-col bg-[#f7f7f7] text-[#111827]"
      style={{ height: vvHeight ? `${vvHeight}px` : '100dvh' }}
    >
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col bg-white">
        <header className="flex h-auto min-h-[48px] shrink-0 items-center gap-3 border-b border-[#eeeeee] px-4 py-2.5">
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
              <h2 className="text-2xl font-extrabold tracking-normal">
                请输入想了解的{topicLabel}问题
              </h2>
              <p className="mt-4 text-[#8b8f99]">
                {topic === 'grid'
                  ? '例如：网格内影响最大的案件、各社区结案率排名、本周网格事件趋势'
                  : topic === 'population'
                    ? '例如：今天人流的年龄分布、进站来源地排名、活力指数、流动人口异常'
                    : '例如：今天各卡口车流量、过去一周车流趋势、港澳车占比'}
              </p>
              {topic === 'traffic' || suggestedQuestions.length > 0 ? (
                <div className="mx-auto mt-6 flex max-w-[420px] flex-wrap justify-center gap-2">
                  {(suggestedQuestions.length > 0
                    ? suggestedQuestions
                    : trafficRecommendedQuestions
                  )
                    .slice(0, 5)
                    .map(question => (
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
                      {message.thinkingFrames &&
                      message.thinkingFrames.length > 0 ? (
                        <ThinkingProcess frames={message.thinkingFrames} />
                      ) : null}
                      {message.content ? (
                        <AssistantContent
                          content={message.content}
                          insightMeta={message.metadata?.insightMeta}
                          insightCollapsedDefault={
                            message.metadata?.format?.insightCollapsedDefault
                          }
                          onClarify={option => submit(option)}
                          trafficFilters={
                            topic === 'traffic' ? trafficFilters : undefined
                          }
                          onTrafficPresetChange={
                            topic === 'traffic'
                              ? changeTrafficPreset
                              : undefined
                          }
                          allDates={message.metadata?.allDates}
                          userQuestion={
                            messages
                              .slice(0, index)
                              .reverse()
                              .find(m => m.role === 'user')?.content
                          }
                          elapsedMs={message.metadata?.elapsedMs}
                          topic={topic}
                          thinkingFrames={message.thinkingFrames}
                          tables={message.metadata?.tables}
                        />
                      ) : loading ? (
                        '正在查询...'
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
          placeholder={`输入${topicLabel}问题...`}
          onChange={setInput}
          onSubmit={submit}
          onStop={stop}
          onFocus={() =>
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }
        />
      </div>
    </div>
  )
}
