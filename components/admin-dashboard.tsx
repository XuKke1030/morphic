'use client'

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import {
  AlertTriangle,
  BookOpen,
  ChevronLeft,
  Database,
  Download,
  FileText,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Upload,
  X
} from 'lucide-react'

import { useChatDbAuth } from '@/lib/contexts/chatdb-auth-context'

type AdminSection =
  | 'overview'
  | 'users'
  | 'questions'
  | 'candidates'
  | 'data'
  | 'documents'
  | 'logs'
type TopicKey = 'grid' | 'population' | 'traffic'

type TopicPermission = {
  topic: TopicKey
  enabled: boolean
}

type KnowledgePermission = {
  code: string
  name: string
  enabled: boolean
}

type AdminUser = {
  userId: number
  username: string
  displayName?: string
  department: string
  enabled: boolean
  ruleLevel: number
  permissions: TopicPermission[]
  qaPermissions?: KnowledgePermission[]
  lastLoginAt?: number
  updateTime: number
}

type ExampleQuestion = {
  id: number
  topic: TopicKey
  question: string
  description: string
  enabled: boolean
  sort: number
  updateTime: number
}

type DataSource = {
  type: TopicKey
  name: string
  enabled: boolean
  status: string
  latestSync: number
  updateTime: number
}

type GridImport = {
  id: number
  month: string
  fileName: string
  status: string
  totalRows: number
  successRows: number
  failedRows: number
  operator: string
  createTime: number
  completeTime: number
}

type GridImportError = {
  id: number
  importId: number
  rowIndex: number
  reason: string
  rawData: string
}

type GridImportAudit = {
  id: number
  importId: number
  action: string
  operator: string
  detail: string
  createTime: number
}

type SyncTask = {
  taskId: number
  provider: string
  syncType: string
  status: string
  message: string
  successCount: number
  failureCount: number
  skippedCount: number
  startedAt: number
  finishedAt: number
  createTime: number
  updateTime: number
}

type SyncLog = {
  logId: number
  taskId: number
  provider: string
  syncType: string
  externalId: string
  localId: string
  action: string
  status: string
  message: string
  createTime: number
}

type TopicKnowledgeBinding = {
  id: number
  topic: string
  knowledgeCode: string
  knowledgeName: string
  enabled: boolean
  createTime: number
  updateTime: number
}

type DocumentRelationItem = {
  id: number
  fromDocId: number
  fromDocTitle: string
  toDocId: number
  toDocTitle: string
  relType: string
  description?: string
  enabled: boolean
}

type ComplianceIssue = {
  documentId: number
  documentTitle: string
  issueType: string
  description: string
  severity: string
}

type QuestionCandidate = {
  id: number
  topic: TopicKey
  question: string
  status: string
  count: number
  lastSeenAt: number
}

type ApiEnvelope<T> = {
  code: number
  message?: string
  data?: T
}

const topicLabels: Record<TopicKey, string> = {
  grid: '网格',
  population: '人流',
  traffic: '车流'
}

const sourceLabels: Record<TopicKey, string> = {
  grid: '网格数据',
  population: '人流数据',
  traffic: '车流数据'
}

const menuGroups: Array<{
  title: string
  items: Array<{ key: AdminSection; label: string; icon: React.ElementType }>
}> = [
  {
    title: '概览',
    items: [{ key: 'overview', label: '首页', icon: LayoutDashboard }]
  },
  {
    title: '权限管理',
    items: [{ key: 'users', label: '用户权限管理', icon: Shield }]
  },
  {
    title: '内容管理',
    items: [
      {
        key: 'questions' as AdminSection,
        label: '示例问题管理',
        icon: BookOpen
      },
      {
        key: 'candidates' as AdminSection,
        label: '问题沉淀管理',
        icon: Search
      },
      {
        key: 'documents' as AdminSection,
        label: '文档关联管理',
        icon: FileText
      }
    ]
  },
  {
    title: '数据接入',
    items: [{ key: 'data', label: '数据接入管理', icon: Database }]
  },
  {
    title: '系统',
    items: [{ key: 'logs', label: '操作日志', icon: RefreshCw }]
  }
]

const sectionTitles: Record<AdminSection, string> = {
  overview: '首页',
  users: '用户权限管理',
  questions: '示例问题管理',
  data: '数据接入管理',
  candidates: '问题沉淀管理',
  documents: '文档关联管理',
  logs: '操作日志'
}

const sectionSubtitles: Partial<Record<AdminSection, string>> = {
  users: '用户来自统一认证系统，在此配置各用户的数据访问白名单。',
  questions:
    '配置用户不标准提问到标准问题的映射，以及期望的回答内容（后两项选填）。',
  candidates:
    '审批用户高频问题沉淀为示例问题，被拒绝的候选不会进入示例问题库。',
  documents: '管理文档间的引用、补充、废止、相关关系，支持自动发现和合规检查。',
  logs: '记录问答问数系统的用户查询日志，以及管理后台的操作记录。'
}

const emptyQuestion: Omit<ExampleQuestion, 'id' | 'updateTime'> = {
  topic: 'grid',
  question: '',
  description: '',
  enabled: true,
  sort: 0
}

const mockNames: Record<string, string> = {
  zhangsan: '张三',
  lisi: '李四',
  wangwu: '王五',
  zhaoliu: '赵六',
  chenqi: '陈七',
  admin: '管理员'
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/chatdb/admin/${path}`, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers
    }
  })
  const payload = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok || payload?.code !== 0) {
    throw new Error(payload?.message || '后台接口请求失败')
  }
  return payload.data as T
}

async function qaSyncFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/chatdb/admin/sync/${path}`, {
    cache: 'no-store',
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers
    }
  })
  const payload = (await response
    .json()
    .catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok || payload?.code !== 0) {
    throw new Error(payload?.message || '同步接口请求失败')
  }
  return payload.data as T
}

function formatTime(value?: number, withYear = false) {
  if (!value) return '-'
  return new Date(value * 1000).toLocaleString('zh-CN', {
    hour12: false,
    year: withYear ? 'numeric' : undefined,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function nowText() {
  return new Date().toLocaleString('zh-CN', {
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function ruleLevelFromPermissions(permissions: TopicPermission[]) {
  return permissions.reduce((sum, item) => {
    if (!item.enabled) return sum
    if (item.topic === 'grid') return sum + 1
    if (item.topic === 'population') return sum + 2
    return sum + 4
  }, 0)
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    completed: '成功',
    partial_success: '部分失败',
    failed: '失败',
    running: '接入正常',
    closed: '已关闭'
  }
  return map[status] || status || '-'
}

function syncTypeLabel(syncType: string) {
  const map: Record<string, string> = {
    knowledge_bases: '知识库同步',
    documents: '文档同步',
    permissions: '权限同步',
    grid_data: '网格数据同步',
    traffic_data: '车流数据同步',
    population_data: '人流数据同步'
  }
  return map[syncType] || syncType || '-'
}

function syncStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待执行',
    running: '执行中',
    success: '成功',
    skipped: '已跳过',
    partial_failed: '部分失败',
    failed: '失败'
  }
  return map[status] || status || '-'
}

function userDisplayName(
  user: Pick<AdminUser, 'username' | 'displayName'> | string
) {
  if (typeof user === 'string') {
    return mockNames[user] || user
  }
  return user.displayName || mockNames[user.username] || user.username
}

function Tag({
  children,
  muted,
  danger
}: {
  children: React.ReactNode
  muted?: boolean
  danger?: boolean
}) {
  return (
    <span
      className={
        danger
          ? 'inline-flex rounded-full bg-[#fff0ed] px-3 py-1 text-sm font-bold text-[#ff5a3d]'
          : muted
            ? 'inline-flex rounded-full bg-[#f2f2f2] px-3 py-1 text-sm text-[#c1c4ca]'
            : 'inline-flex rounded-full bg-[#eef4ff] px-3 py-1 text-sm text-[#2563ff]'
      }
    >
      {children}
    </span>
  )
}

function AdminToggle({
  checked,
  onChange,
  disabled
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={
        checked
          ? 'relative h-8 w-[60px] rounded-full bg-[#171717] transition-colors disabled:opacity-50'
          : 'relative h-8 w-[60px] rounded-full bg-[#d1d5db] transition-colors disabled:opacity-50'
      }
      aria-pressed={checked}
      disabled={disabled}
    >
      <span
        className={
          checked
            ? 'absolute right-1 top-1 h-6 w-6 rounded-full bg-white transition-all'
            : 'absolute left-1 top-1 h-6 w-6 rounded-full bg-white transition-all'
        }
      />
    </button>
  )
}

function MetricCard({
  label,
  value,
  footnote,
  danger
}: {
  label: string
  value: string | number
  footnote: string
  danger?: boolean
}) {
  return (
    <div className="rounded-xl border border-[#e1e3e8] bg-white px-4 py-3">
      <div className="text-xs text-[#8a9099]">{label}</div>
      <div className="mt-2 text-base font-bold leading-none tracking-normal text-[#05070a]">
        {value}
      </div>
      <div
        className={
          danger ? 'mt-3 text-xs text-[#ff3b30]' : 'mt-3 text-xs text-[#12b35c]'
        }
      >
        {footnote}
      </div>
    </div>
  )
}

function SourceStatusCard({
  source,
  lastSyncFailed
}: {
  source: DataSource
  lastSyncFailed?: boolean
}) {
  const displayStatus = !source.enabled
    ? '已关闭'
    : lastSyncFailed
      ? '同步异常'
      : '接入正常'
  const statusColor = !source.enabled
    ? 'text-[#8a9099]'
    : lastSyncFailed
      ? 'text-[#ff3b30]'
      : 'text-[#09a64f]'
  return (
    <div className="flex h-[48px] items-center justify-between rounded-lg border border-[#e1e3e8] bg-white px-4">
      <div className="text-sm font-bold text-[#05070a]">
        {sourceLabels[source.type] || source.name}
      </div>
      <div className={`text-sm font-bold ${statusColor}`}>{displayStatus}</div>
    </div>
  )
}

export function AdminDashboard() {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [questions, setQuestions] = useState<ExampleQuestion[]>([])
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [imports, setImports] = useState<GridImport[]>([])
  const [syncTasks, setSyncTasks] = useState<SyncTask[]>([])
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [candidates, setCandidates] = useState<QuestionCandidate[]>([])
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newQuestion, setNewQuestion] = useState(emptyQuestion)
  const [questionTopic, setQuestionTopic] = useState<TopicKey>('grid')
  const [questionModalOpen, setQuestionModalOpen] = useState(false)
  const [questionModalTab, setQuestionModalTab] = useState<'manual' | 'batch'>(
    'manual'
  )
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importErrors, setImportErrors] = useState<GridImportError[]>([])
  const [activeImportId, setActiveImportId] = useState<number | null>(null)
  const [importAudits, setImportAudits] = useState<GridImportAudit[]>([])
  const [activeAuditId, setActiveAuditId] = useState<number | null>(null)
  const [activeSyncTaskId, setActiveSyncTaskId] = useState<number | null>(null)
  const [topicBindings, setTopicBindings] = useState<TopicKnowledgeBinding[]>(
    []
  )
  const [docRelations, setDocRelations] = useState<DocumentRelationItem[]>([])
  const [complianceIssues, setComplianceIssues] = useState<ComplianceIssue[]>(
    []
  )
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAdminData = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [
        userData,
        questionData,
        sourceData,
        importData,
        candidateData,
        syncData,
        bindingData
      ] = await Promise.all([
        adminFetch<{ list: AdminUser[] }>('users'),
        adminFetch<{ list: ExampleQuestion[] }>('example-questions'),
        adminFetch<{ list: DataSource[] }>('data-sources'),
        adminFetch<{ list: GridImport[] }>('grid-data/imports'),
        adminFetch<{ list: QuestionCandidate[] }>('question-candidates'),
        qaSyncFetch<{ list: SyncTask[] }>('status?limit=8'),
        adminFetch<{ list: TopicKnowledgeBinding[] }>(
          'topic-knowledge-bindings'
        )
      ])
      setUsers(userData.list || [])
      setQuestions(questionData.list || [])
      setDataSources(sourceData.list || [])
      setImports(importData.list || [])
      setCandidates(candidateData.list || [])
      setSyncTasks(syncData.list || [])
      setTopicBindings(bindingData.list || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => {
      loadAdminData()
    })
  }, [loadAdminData])

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return users
    return users.filter(
      user =>
        user.username.toLowerCase().includes(keyword) ||
        user.department.toLowerCase().includes(keyword) ||
        userDisplayName(user).includes(keyword)
    )
  }, [search, users])

  const questionList = useMemo(
    () => questions.filter(question => question.topic === questionTopic),
    [questionTopic, questions]
  )

  const latestImport = imports[0]
  const failedImports = imports.filter(
    item => item.failedRows > 0 || item.status === 'failed'
  )
  const failedQueryCount = Math.max(
    candidates.filter(item => item.status === 'pending').length,
    failedImports.length
  )

  async function toggleUserTopic(user: AdminUser, topic: TopicKey) {
    const permissions = user.permissions.map(item =>
      item.topic === topic ? { ...item, enabled: !item.enabled } : item
    )
    const key = `user-topic-${user.userId}-${topic}`
    setSavingId(key)
    try {
      const data = await adminFetch<{ user: AdminUser }>(
        `users/${user.userId}/permissions`,
        {
          method: 'PUT',
          body: JSON.stringify({
            permissions,
            qaPermissions: user.qaPermissions || [],
            ruleLevel: ruleLevelFromPermissions(permissions)
          })
        }
      )
      setUsers(prev =>
        prev.map(item => (item.userId === user.userId ? data.user : item))
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '权限保存失败')
    } finally {
      setSavingId(null)
    }
  }

  async function toggleUserStatus(user: AdminUser, enabled: boolean) {
    const key = `user-status-${user.userId}`
    setSavingId(key)
    try {
      const data = await adminFetch<{ user: AdminUser }>(
        `users/${user.userId}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({ enabled })
        }
      )
      setUsers(prev =>
        prev.map(item => (item.userId === user.userId ? data.user : item))
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '状态保存失败')
    } finally {
      setSavingId(null)
    }
  }

  async function saveUserPermissions(
    user: AdminUser,
    permissions: TopicPermission[],
    qaPermissions: KnowledgePermission[]
  ) {
    const key = `user-permissions-${user.userId}`
    setSavingId(key)
    try {
      const data = await adminFetch<{ user: AdminUser }>(
        `users/${user.userId}/permissions`,
        {
          method: 'PUT',
          body: JSON.stringify({
            permissions,
            qaPermissions,
            ruleLevel: ruleLevelFromPermissions(permissions)
          })
        }
      )
      setUsers(prev =>
        prev.map(item => (item.userId === user.userId ? data.user : item))
      )
      setEditingUser(null)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '权限保存失败')
    } finally {
      setSavingId(null)
    }
  }

  async function createQuestion() {
    if (!newQuestion.question.trim()) {
      setError('请填写用户不标准提问')
      return
    }
    setSavingId('question-create')
    try {
      const data = await adminFetch<{ item: ExampleQuestion }>(
        'example-questions',
        {
          method: 'POST',
          body: JSON.stringify(newQuestion)
        }
      )
      setQuestions(prev => [data.item, ...prev])
      setNewQuestion({ ...emptyQuestion, topic: questionTopic })
      setQuestionModalOpen(false)
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '新增问题失败')
    } finally {
      setSavingId(null)
    }
  }

  async function updateQuestion(question: ExampleQuestion) {
    const key = `question-${question.id}`
    setSavingId(key)
    try {
      const data = await adminFetch<{ item: ExampleQuestion }>(
        `example-questions/${question.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(question)
        }
      )
      setQuestions(prev =>
        prev.map(item => (item.id === question.id ? data.item : item))
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '问题保存失败')
    } finally {
      setSavingId(null)
    }
  }

  async function deleteQuestion(questionId: number) {
    setSavingId(`question-delete-${questionId}`)
    try {
      await adminFetch<Record<string, never>>(
        `example-questions/${questionId}`,
        {
          method: 'DELETE'
        }
      )
      setQuestions(prev => prev.filter(item => item.id !== questionId))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '删除问题失败')
    } finally {
      setSavingId(null)
    }
  }

  const { logout: authLogout, adminUsername } = useChatDbAuth()

  async function logout() {
    await authLogout('admin')
  }

  function openQuestionModal() {
    setNewQuestion({ ...emptyQuestion, topic: questionTopic })
    setQuestionModalTab('manual')
    setQuestionModalOpen(true)
  }

  return (
    <div className="flex h-dvh min-h-0 bg-[#f4f4f6] text-[#05070a]">
      <aside
        className={`flex shrink-0 flex-col border-r border-[#e2e4e8] bg-white transition-[width] duration-200 ${sidebarCollapsed ? 'w-[60px]' : 'w-[220px]'}`}
      >
        <div className="flex h-[60px] items-center border-b border-[#eceef2] px-4">
          {!sidebarCollapsed && (
            <div className="min-w-0 flex-1 px-3 text-sm font-bold tracking-normal">
              问答问数
            </div>
          )}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(v => !v)}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-[#64748b] hover:bg-[#f1f1f3] ${sidebarCollapsed ? 'mx-auto' : ''}`}
          >
            <ChevronLeft
              className={`h-5 w-5 transition-transform duration-200 ${sidebarCollapsed ? 'rotate-180' : ''}`}
            />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto py-4">
          {menuGroups.map(group => (
            <div key={group.title} className="mb-5">
              {!sidebarCollapsed && (
                <div className="px-4 text-xs font-bold text-[#c3c7ce]">
                  {group.title}
                </div>
              )}
              <div className={sidebarCollapsed ? '' : 'mt-2'}>
                {group.items.map(item => {
                  const active = activeSection === item.key
                  const Icon = item.icon
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveSection(item.key)}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={
                        active
                          ? 'relative flex h-[40px] w-full items-center bg-[#f1f1f3] px-4 text-sm font-bold text-[#05070a] before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-[#111]' +
                            (sidebarCollapsed ? ' justify-center' : ' px-6')
                          : 'flex h-[40px] w-full items-center text-sm text-[#1f2937] hover:bg-[#f7f7f8]' +
                            (sidebarCollapsed ? ' justify-center' : ' px-6')
                      }
                    >
                      {sidebarCollapsed ? (
                        <Icon className="h-5 w-5" />
                      ) : (
                        <>
                          <Icon className="mr-3 h-5 w-5" />
                          {item.label}
                        </>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-[#eceef2] px-4 py-3">
          {!sidebarCollapsed ? (
            <div className="flex items-center gap-3 px-3">
              <div className="flex h-[32px] w-[32px] items-center justify-center rounded-full bg-[#111] text-sm font-bold text-white">
                管
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold leading-tight">
                  {adminUsername || 'admin'}
                </div>
                <div className="mt-0.5 text-xs text-[#a1a7b1]">超级管理员</div>
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg border border-[#e2e4e8] px-3 py-2 text-sm text-[#333] hover:bg-[#f5f6f8]"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#111] text-xs font-bold text-white">
                管
              </div>
              <button
                type="button"
                onClick={logout}
                className="rounded-lg p-2 text-[#999] hover:bg-[#f5f6f8]"
                title="退出登录"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 flex flex-col min-h-0">
        <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-[#dddfe4] bg-white px-6">
          <div className="text-sm text-[#a6abb3]">
            首页 /{' '}
            <span className="font-bold text-[#05070a]">
              {sectionTitles[activeSection]}
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="rounded-full bg-[#111] px-3 py-1.5 text-xs font-bold leading-none text-white">
              ADMIN
            </span>
            <span className="text-[#9aa0aa]">{nowText()}</span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
          {error ? (
            <div className="shrink-0 mb-5 flex items-center justify-between rounded-xl border border-[#ff5a3d] bg-white px-4 py-3 text-base text-[#d93025]">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="shrink-0 rounded-xl border border-[#e1e3e8] bg-white p-6 text-center text-sm text-[#8a9099]">
              正在加载后台数据...
            </div>
          ) : null}

          {!loading ? (
            <div className="shrink-0 mb-4">
              <h1 className="text-base font-bold tracking-normal">
                {sectionTitles[activeSection]}
              </h1>
              {sectionSubtitles[activeSection] ? (
                <p className="mt-1 text-sm text-[#8a9099]">
                  {sectionSubtitles[activeSection]}
                </p>
              ) : null}
            </div>
          ) : null}

          {!loading && activeSection === 'overview' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <OverviewPanel
                users={users}
                questions={questions}
                candidates={candidates}
                dataSources={dataSources}
                imports={imports}
                latestImport={latestImport}
                failedImports={failedImports}
                failedQueryCount={failedQueryCount}
                syncTasks={syncTasks}
              />
            </div>
          ) : null}

          {!loading && activeSection === 'users' ? (
            <UsersPanel
              users={filteredUsers}
              search={search}
              onSearch={setSearch}
              onEdit={setEditingUser}
            />
          ) : null}

          {!loading && activeSection === 'questions' ? (
            <QuestionsPanel
              questions={questionList}
              activeTopic={questionTopic}
              onTopicChange={setQuestionTopic}
              onOpenCreate={openQuestionModal}
              onEdit={updateQuestion}
              onDelete={deleteQuestion}
            />
          ) : null}

          {!loading && activeSection === 'data' ? (
            <DataPanel
              dataSources={dataSources}
              imports={imports}
              syncTasks={syncTasks}
              syncLogs={syncLogs}
              selectedFile={selectedFile}
              savingId={savingId}
              fileInputRef={fileInputRef}
              activeImportId={activeImportId}
              activeAuditId={activeAuditId}
              activeSyncTaskId={activeSyncTaskId}
              importErrors={importErrors}
              importAudits={importAudits}
              onFileChange={async () => {}}
              onToggleSource={async () => {}}
              onToggleErrors={async () => {}}
              onTriggerSync={async () => {}}
              onToggleSyncLogs={async () => {}}
              onDownloadTemplate={async () => {}}
              onRollback={async () => {}}
              onToggleAudit={async () => {}}
              topicBindings={topicBindings}
              onToggleBinding={async () => {}}
              onUnbindBinding={async () => {}}
              onBindBinding={async () => {}}
            />
          ) : null}

          {!loading && activeSection === 'candidates' ? (
            <CandidatesPanel
              candidates={candidates}
              onApprove={async () => {}}
              onReject={async () => {}}
            />
          ) : null}

          {!loading && activeSection === 'documents' ? (
            <DocumentsPanel
              relations={docRelations}
              complianceIssues={complianceIssues}
              onReload={loadAdminData}
              onAutoDiscover={async () => {}}
              onComplianceCheck={async () => {}}
              onDeleteRelation={async () => {}}
              onCreateRelation={async () => {}}
            />
          ) : null}

          {!loading && activeSection === 'logs' ? (
            <LogsPanel imports={imports} />
          ) : null}
        </div>
      </main>

      {questionModalOpen ? (
        <QuestionModal
          tab={questionModalTab}
          question={newQuestion}
          saving={savingId === 'question-create'}
          onTabChange={setQuestionModalTab}
          onQuestionChange={setNewQuestion}
          onClose={() => setQuestionModalOpen(false)}
          onSave={createQuestion}
        />
      ) : null}

      {editingUser ? (
        <UserPermissionModal
          user={editingUser}
          saving={savingId === `user-permissions-${editingUser.userId}`}
          onClose={() => setEditingUser(null)}
          onSave={(permissions, qaPermissions) =>
            saveUserPermissions(editingUser, permissions, qaPermissions)
          }
        />
      ) : null}
    </div>
  )
}

function OverviewPanel({
  users,
  questions,
  candidates,
  dataSources,
  imports,
  latestImport,
  failedImports,
  failedQueryCount,
  syncTasks
}: {
  users: AdminUser[]
  questions: ExampleQuestion[]
  candidates: QuestionCandidate[]
  dataSources: DataSource[]
  imports: GridImport[]
  latestImport?: GridImport
  failedImports: GridImport[]
  failedQueryCount: number
  syncTasks: SyncTask[]
}) {
  const failedSyncTypes = new Set(
    syncTasks
      .filter(t => t.status === 'failed' || t.status === 'partial_failed')
      .map(t => {
        const st = t.syncType
        if (st.startsWith('traffic')) return 'traffic'
        if (st.startsWith('population')) return 'population'
        if (st.startsWith('grid')) return 'grid'
        return st
      })
  )
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {dataSources.some(item => !item.enabled) ? (
          <div className="inline-flex h-[32px] items-center gap-2 rounded-xl border-2 border-[#ff5a3d] bg-white px-3 text-xs">
            <AlertTriangle className="h-5 w-5 text-[#ff3b30]" />
            <span>
              {dataSources
                .filter(item => !item.enabled)
                .map(item => sourceLabels[item.type] || item.name)
                .join('、')}{' '}
              接入中断
            </span>
            <X className="h-4 w-4 text-[#a6abb3]" />
          </div>
        ) : null}
        {[...failedSyncTypes]
          .filter(type => dataSources.some(s => s.type === type && s.enabled))
          .map(type => (
            <div
              key={type}
              className="inline-flex h-[32px] items-center gap-2 rounded-xl border-2 border-[#ff5a3d] bg-white px-3 text-xs"
            >
              <AlertTriangle className="h-5 w-5 text-[#ff3b30]" />
              <span>{sourceLabels[type as TopicKey] || type}同步失败</span>
              <X className="h-4 w-4 text-[#a6abb3]" />
            </div>
          ))}
        {failedImports[0] ? (
          <div className="inline-flex h-[32px] items-center gap-2 rounded-xl border-2 border-[#ff5a3d] bg-white px-3 text-xs">
            <span className="font-bold text-[#ff3b30]">!</span>
            <span>网格数据上传部分失败</span>
            <span className="text-[#a6abb3]">
              {formatTime(failedImports[0].createTime)}
            </span>
            <X className="h-4 w-4 text-[#a6abb3]" />
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-4">
        <MetricCard
          label="注册用户"
          value={users.length}
          footnote={`本月新增 ${Math.max(users.length - 1, 0)} 人`}
        />
        <MetricCard
          label="今日查询次数"
          value={latestImport?.successRows || imports[0]?.totalRows || 0}
          footnote="较昨日 +14%"
        />
        <MetricCard
          label="失败查询数 / 率"
          value={`${failedQueryCount} / ${questions.length ? Math.round((failedQueryCount / questions.length) * 100) : 0}%`}
          footnote="较昨日 +3"
          danger
        />
        <MetricCard
          label="示例问题条数"
          value={questions.length}
          footnote={`本周新增 ${candidates.length} 条`}
        />
      </div>

      <h2 className="mt-7 text-base font-bold">数据源状态</h2>
      <div className="mt-4 grid gap-5 xl:grid-cols-3">
        {dataSources.map(source => (
          <SourceStatusCard
            key={source.type}
            source={source}
            lastSyncFailed={failedSyncTypes.has(source.type)}
          />
        ))}
      </div>
    </div>
  )
}

function UsersPanel({
  users,
  search,
  onSearch,
  onEdit
}: {
  users: AdminUser[]
  search: string
  onSearch: (value: string) => void
  onEdit: (user: AdminUser) => void
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#e1e3e8] bg-white">
      <div className="shrink-0 border-b border-[#eceef2] px-4 py-3">
        <h2 className="text-base font-bold">用户列表</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
        <div className="mb-4 flex h-[36px] w-[240px] shrink-0 items-center gap-2 rounded-xl border border-[#dfe3ea] px-3">
          <Search className="h-5 w-5 text-[#b2b6bf]" />
          <input
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="搜索姓名 / 账号..."
            className="w-full bg-transparent text-sm outline-none placeholder:text-[#c1c5cc]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <table className="min-w-full table-fixed text-left text-base">
            <colgroup>
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[20%]" />
              <col className="w-[30%]" />
              <col className="w-[14%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="sticky top-0 bg-[#f7f7f8] text-sm text-[#8a9099]">
              <tr>
                <th className="px-3 py-2 font-bold">账号</th>
                <th className="px-3 py-2 font-bold">姓名</th>
                <th className="px-3 py-2 font-bold">问数权限</th>
                <th className="px-3 py-2 font-bold">问答权限</th>
                <th className="px-3 py-2 font-bold">最后登录</th>
                <th className="px-3 py-2 font-bold">操作</th>
              </tr>
            </thead>
          </table>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="min-w-full table-fixed text-left text-base">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[20%]" />
                <col className="w-[30%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
              </colgroup>
              <tbody className="divide-y divide-[#eceef2]">
                {users.map(user => (
                  <tr key={user.userId}>
                    <td className="truncate px-3 py-2">{user.username}</td>
                    <td className="truncate px-3 py-2">
                      {userDisplayName(user)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {user.permissions.filter(
                          permission => permission.enabled
                        ).length ? (
                          user.permissions
                            .filter(permission => permission.enabled)
                            .map(permission => (
                              <span key={permission.topic}>
                                <Tag>{topicLabels[permission.topic]}</Tag>
                              </span>
                            ))
                        ) : (
                          <Tag muted>无</Tag>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {user.qaPermissions?.filter(
                          permission => permission.enabled
                        ).length ? (
                          user.qaPermissions
                            ?.filter(permission => permission.enabled)
                            .map(permission => (
                              <span key={permission.code}>
                                <Tag>{permission.name}</Tag>
                              </span>
                            ))
                        ) : (
                          <Tag muted>无</Tag>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[#a0a6af]">
                      {formatTime(user.updateTime, true)}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => onEdit(user)}
                        className="rounded-md border border-[#dfe3ea] px-3 py-1.5 text-sm font-bold"
                      >
                        编辑权限
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="shrink-0 pt-3 flex items-center justify-end gap-1.5 text-sm text-[#a0a6af]">
          <span>共 {users.length} 条</span>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">
            «
          </button>
          <button className="rounded-lg bg-[#111] px-4 py-2 text-white">
            1
          </button>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-[#333]">
            2
          </button>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-[#333]">
            3
          </button>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">
            »
          </button>
        </div>
      </div>
    </section>
  )
}

function QuestionsPanel({
  questions,
  activeTopic,
  onTopicChange,
  onOpenCreate,
  onEdit,
  onDelete
}: {
  questions: ExampleQuestion[]
  activeTopic: TopicKey
  onTopicChange: (topic: TopicKey) => void
  onOpenCreate: () => void
  onEdit: (question: ExampleQuestion) => void
  onDelete: (questionId: number) => void
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#e1e3e8] bg-white">
      <div className="flex h-[44px] shrink-0 items-end gap-4 border-b border-[#eceef2] px-4">
        {(['grid', 'population', 'traffic'] as TopicKey[]).map(topic => (
          <button
            key={topic}
            type="button"
            onClick={() => onTopicChange(topic)}
            className={
              activeTopic === topic
                ? 'h-full border-b-3 border-[#111] px-1 pt-3 text-sm font-bold'
                : 'h-full px-1 pt-3 text-sm text-[#9aa0aa]'
            }
          >
            {topicLabels[topic]}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="mb-4 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#111] px-4 text-sm font-bold text-white"
          >
            <Plus className="h-5 w-5" />
            新增问题
          </button>
        </div>

        <ExampleQuestionTable
          questions={questions}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </section>
  )
}

function ExampleQuestionTable({
  questions,
  onEdit,
  onDelete
}: {
  questions: ExampleQuestion[]
  onEdit: (question: ExampleQuestion) => void
  onDelete: (questionId: number) => void
}) {
  return (
    <div className="min-h-0 flex-1 flex flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <table className="min-w-full table-fixed text-left text-base">
          <colgroup>
            <col className="w-[21%]" />
            <col className="w-[21%]" />
            <col className="w-[21%]" />
            <col className="w-[9%]" />
            <col className="w-[13%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead className="sticky top-0 bg-[#f7f7f8] text-sm text-[#8a9099]">
            <tr>
              <th className="px-3 py-2 font-bold">用户不标准提问</th>
              <th className="px-3 py-2 font-bold">映射标准问题</th>
              <th className="px-3 py-2 font-bold">期望回答</th>
              <th className="px-3 py-2 font-bold">来源</th>
              <th className="px-3 py-2 font-bold">创建时间</th>
              <th className="px-3 py-2 font-bold">操作</th>
            </tr>
          </thead>
        </table>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="min-w-full table-fixed text-left text-base">
            <colgroup>
              <col className="w-[21%]" />
              <col className="w-[21%]" />
              <col className="w-[21%]" />
              <col className="w-[9%]" />
              <col className="w-[13%]" />
              <col className="w-[15%]" />
            </colgroup>
            <tbody className="divide-y divide-[#eceef2]">
              {questions.map(question => (
                <tr key={question.id}>
                  <td className="truncate px-3 py-2">{question.question}</td>
                  <td className="truncate px-3 py-2 text-[#8a9099]">
                    {question.description || question.question}
                  </td>
                  <td className="truncate px-3 py-2 text-[#8a9099]">
                    {question.enabled ? '按标准口径生成结构化回答' : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <Tag danger={question.sort > 0}>
                      {question.sort > 0 ? '系统沉淀' : '人工录入'}
                    </Tag>
                  </td>
                  <td className="truncate px-3 py-2 text-[#a0a6af]">
                    {formatTime(question.updateTime, true)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onEdit({ ...question, enabled: !question.enabled })
                        }
                        className="rounded-md border border-[#dfe3ea] px-3 py-1.5 text-sm font-bold"
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(question.id)}
                        className="rounded-md border border-[#ffb4a8] px-3 py-1.5 text-sm text-[#ff3b30]"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="shrink-0 pt-3 flex items-center justify-end gap-1.5 text-sm text-[#a0a6af]">
        <span>共 {questions.length} 条</span>
        <button className="rounded-lg bg-[#111] px-4 py-2 text-white">1</button>
      </div>
    </div>
  )
}

function DataPanel({
  dataSources,
  imports,
  syncTasks,
  syncLogs,
  selectedFile,
  savingId,
  fileInputRef,
  activeImportId,
  activeAuditId,
  activeSyncTaskId,
  importErrors,
  importAudits,
  onFileChange,
  onToggleSource,
  onToggleErrors,
  onTriggerSync,
  onToggleSyncLogs,
  onDownloadTemplate,
  onRollback,
  onToggleAudit,
  topicBindings,
  onToggleBinding,
  onUnbindBinding,
  onBindBinding
}: {
  dataSources: DataSource[]
  imports: GridImport[]
  syncTasks: SyncTask[]
  syncLogs: SyncLog[]
  selectedFile: File | null
  savingId: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  activeImportId: number | null
  activeAuditId: number | null
  activeSyncTaskId: number | null
  importErrors: GridImportError[]
  importAudits: GridImportAudit[]
  onFileChange: (value: File | null) => void
  onToggleSource: (source: DataSource, enabled: boolean) => void
  onToggleErrors: (importId: number) => void
  onTriggerSync: (syncPath: string) => void
  onToggleSyncLogs: (taskId: number) => void
  onDownloadTemplate: () => void
  onRollback: (importId: number) => void
  onToggleAudit: (importId: number) => void
  topicBindings: TopicKnowledgeBinding[]
  onToggleBinding: (id: number, enabled: boolean) => void
  onUnbindBinding: (id: number) => void
  onBindBinding: (topic: string, knowledgeCode: string) => void
}) {
  const population = dataSources.find(source => source.type === 'population')
  const traffic = dataSources.find(source => source.type === 'traffic')
  const latestImport = imports[0]
  const failedSyncTypes = new Set(
    syncTasks
      .filter(t => t.status === 'failed' || t.status === 'partial_failed')
      .map(t => {
        const st = t.syncType
        if (st.startsWith('traffic')) return 'traffic'
        if (st.startsWith('population')) return 'population'
        if (st.startsWith('grid')) return 'grid'
        return st
      })
  )
  const syncPathToSourceType: Record<string, string> = {
    'knowledge-bases': '',
    documents: '',
    'grid-data': 'grid',
    'traffic-data': 'traffic',
    'population-data': 'population'
  }
  const syncActions = [
    {
      path: 'knowledge-bases',
      label: '知识库',
      description: '同步 AIDGP 知识库目录'
    },
    { path: 'documents', label: '文档', description: '同步文档元数据与正文' },
    { path: 'grid-data', label: '网格', description: '同步网格数据批次' },
    { path: 'traffic-data', label: '车流', description: '同步车流数据批次' },
    {
      path: 'population-data',
      label: '人流',
      description: '格式未配置时仅记录跳过'
    }
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto space-y-6 px-1">
      <section className="rounded-xl border border-[#e1e3e8] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#eceef2] px-4 py-3">
          <div>
            <h2 className="text-base font-bold">AIDGP 同步</h2>
            <p className="mt-2 text-xs text-[#8a9099]">
              当前接入 Mock 同步流程，可先验证任务状态、成功失败数量和日志明细。
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTriggerSync('knowledge-bases')}
            disabled={savingId?.startsWith('qa-sync-')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#111] px-5 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-[#b8bdc7]"
          >
            <RefreshCw
              className={`h-4 w-4 ${savingId?.startsWith('qa-sync-') ? 'animate-spin' : ''}`}
            />
            一键同步知识库
          </button>
        </div>

        <div className="grid gap-4 px-4 py-3 lg:grid-cols-5">
          {syncActions.map(action => {
            const running = savingId === `qa-sync-${action.path}`
            const sourceType = syncPathToSourceType[action.path]
            const sourceDisabled = sourceType
              ? !dataSources.find(s => s.type === sourceType)?.enabled
              : false
            return (
              <button
                key={action.path}
                type="button"
                onClick={() => onTriggerSync(action.path)}
                disabled={!!savingId?.startsWith('qa-sync-') || sourceDisabled}
                className="min-h-[110px] rounded-md border border-[#e1e3e8] bg-[#fafafa] p-4 text-left transition hover:border-[#111] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">{action.label}</span>
                  {sourceDisabled ? (
                    <span className="text-sm font-bold text-[#8a9099]">
                      已关闭
                    </span>
                  ) : (
                    <RefreshCw
                      className={`h-5 w-5 text-[#8a9099] ${running ? 'animate-spin' : ''}`}
                    />
                  )}
                </div>
                <p className="mt-3 text-base leading-6 text-[#7b818c]">
                  {sourceDisabled
                    ? '数据源已关闭，请先开启后再同步'
                    : action.description}
                </p>
              </button>
            )
          })}
        </div>

        <div className="border-t border-[#eceef2] px-4 py-3">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-base font-bold">同步任务</h3>
            <span className="text-base text-[#8a9099]">
              最近 {syncTasks.length} 条
            </span>
          </div>
          <div className="divide-y divide-[#eceef2]">
            {syncTasks.length === 0 ? (
              <div className="rounded-xl bg-[#f7f7f8] p-4 text-xs text-[#8a9099]">
                暂无同步任务，点击上方按钮后会显示执行结果。
              </div>
            ) : (
              syncTasks.map(task => (
                <Fragment key={task.taskId}>
                  <button
                    type="button"
                    onClick={() => onToggleSyncLogs(task.taskId)}
                    className="grid w-full gap-4 py-4 text-left lg:grid-cols-[1.1fr_1fr_1.6fr_160px]"
                  >
                    <div>
                      <div className="text-sm font-bold">
                        {syncTypeLabel(task.syncType)}
                      </div>
                      <div className="mt-1 text-base text-[#8a9099]">
                        #{task.taskId} · {task.provider || 'mock'}
                      </div>
                    </div>
                    <div>
                      <Tag
                        danger={task.status === 'failed'}
                        muted={task.status === 'skipped'}
                      >
                        {syncStatusLabel(task.status)}
                      </Tag>
                      <div className="mt-2 text-base text-[#8a9099]">
                        成功 {task.successCount} / 失败 {task.failureCount} /
                        跳过 {task.skippedCount}
                      </div>
                    </div>
                    <div className="text-base leading-6 text-[#555c66]">
                      {task.message || '-'}
                    </div>
                    <div className="text-right text-base text-[#8a9099]">
                      {formatTime(task.finishedAt || task.updateTime, true)}
                    </div>
                  </button>
                  {activeSyncTaskId === task.taskId ? (
                    <div className="mb-4 rounded-xl bg-[#f7f7f8] p-4">
                      {syncLogs.length === 0 ? (
                        <div className="text-xs text-[#8a9099]">
                          暂无日志明细
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {syncLogs.map(log => (
                            <div
                              key={log.logId}
                              className="grid gap-3 rounded-lg bg-white p-4 text-base lg:grid-cols-[120px_160px_1fr]"
                            >
                              <Tag
                                danger={log.status === 'failed'}
                                muted={log.status === 'skipped'}
                              >
                                {syncStatusLabel(log.status)}
                              </Tag>
                              <div className="text-[#555c66]">
                                {log.action || '-'}
                              </div>
                              <div>
                                <div className="font-bold text-[#111]">
                                  {log.externalId || log.localId || '同步明细'}
                                </div>
                                <div className="mt-1 text-[#7b818c]">
                                  {log.message || '-'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </Fragment>
              ))
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        {[population, traffic].filter(Boolean).map(source => (
          <div
            key={source!.type}
            className={`flex h-[72px] items-center justify-between rounded-xl border bg-white px-4 ${failedSyncTypes.has(source!.type) && source!.enabled ? 'border-[#ff3b30]' : 'border-[#e1e3e8]'}`}
          >
            <div>
              <h2 className="text-base font-bold">
                {sourceLabels[source!.type]}
              </h2>
              {failedSyncTypes.has(source!.type) && source!.enabled ? (
                <p className="mt-3 text-xs font-bold text-[#ff3b30]">
                  最近同步失败
                </p>
              ) : (
                <p className="mt-3 text-xs text-[#a0a6af]">
                  最后同步 {formatTime(source!.latestSync, true)}
                </p>
              )}
            </div>
            <AdminToggle
              checked={source!.enabled}
              disabled={savingId === `source-${source!.type}`}
              onChange={checked => onToggleSource(source!, checked)}
            />
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-[#e1e3e8] bg-white">
        <div className="shrink-0 border-b border-[#eceef2] px-4 py-3">
          <h2 className="text-base font-bold">主题知识库绑定</h2>
          <p className="mt-2 text-xs text-[#8a9099]">
            配置各主题可访问的问答知识库范围。
          </p>
        </div>
        <div className="flex min-h-0 flex-1 flex-col px-4 py-4">
          <div className="min-h-0 flex-1 overflow-hidden">
            <table className="min-w-full table-fixed text-left text-base">
              <colgroup>
                <col className="w-[20%]" />
                <col className="w-[25%]" />
                <col className="w-[15%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="sticky top-0 bg-[#f7f7f8] text-sm text-[#8a9099]">
                <tr>
                  <th className="px-3 py-2 font-bold">主题</th>
                  <th className="px-3 py-2 font-bold">知识库</th>
                  <th className="px-3 py-2 font-bold">状态</th>
                  <th className="px-3 py-2 font-bold">更新时间</th>
                  <th className="px-3 py-2 font-bold">操作</th>
                </tr>
              </thead>
            </table>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="min-w-full table-fixed text-left text-base">
                <colgroup>
                  <col className="w-[20%]" />
                  <col className="w-[25%]" />
                  <col className="w-[15%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <tbody className="divide-y divide-[#eceef2]">
                  {topicBindings.map(b => (
                    <tr key={b.id}>
                      <td className="px-3 py-2">
                        {sourceLabels[b.topic as TopicKey] || b.topic}
                      </td>
                      <td className="px-3 py-2">
                        {b.knowledgeName || b.knowledgeCode}
                      </td>
                      <td className="px-3 py-2">
                        <AdminToggle
                          checked={b.enabled}
                          disabled={savingId === `binding-${b.id}`}
                          onChange={checked => onToggleBinding(b.id, checked)}
                        />
                      </td>
                      <td className="px-3 py-2 text-[#8a9099]">
                        {formatTime(b.updateTime, true)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onUnbindBinding(b.id)}
                          disabled={savingId === `binding-${b.id}`}
                          className="text-sm font-bold text-[#ff3b30] hover:underline disabled:opacity-50"
                        >
                          解除绑定
                        </button>
                      </td>
                    </tr>
                  ))}
                  {topicBindings.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-3 py-2 text-center text-[#8a9099]"
                      >
                        暂无绑定，请在上方新增
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="shrink-0 mt-6 flex flex-wrap items-center gap-4">
            <select
              id="new-binding-topic"
              className="h-[36px] rounded-lg border border-[#dfe3ea] px-3 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                选择主题
              </option>
              <option value="grid">网格</option>
              <option value="traffic">车流</option>
              <option value="population">人流</option>
            </select>
            <input
              id="new-binding-code"
              className="h-[36px] w-[160px] rounded-lg border border-[#dfe3ea] px-3 text-sm"
              placeholder="知识库编码"
            />
            <button
              type="button"
              onClick={() => {
                const topic = (
                  document.getElementById(
                    'new-binding-topic'
                  ) as HTMLSelectElement
                )?.value
                const code = (
                  document.getElementById(
                    'new-binding-code'
                  ) as HTMLInputElement
                )?.value?.trim()
                if (topic && code) onBindBinding(topic, code)
              }}
              disabled={savingId === 'binding-new'}
              className="inline-flex items-center gap-2 rounded-lg bg-[#111] px-5 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-[#b8bdc7]"
            >
              绑定知识库
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#e1e3e8] bg-white">
        <div className="border-b border-[#eceef2] px-4 py-3">
          <h2 className="text-base font-bold">网格数据月度上传</h2>
        </div>
        <div className="px-4 py-4">
          <div className="grid rounded-lg bg-[#f7f7f8] px-4 py-3 text-xs xl:grid-cols-4">
            <div>
              <div className="text-[#a0a6af]">最近同步时间</div>
              <div className="mt-2 text-sm font-bold">
                {formatTime(latestImport?.createTime, true)}
              </div>
            </div>
            <div>
              <div className="text-[#a0a6af]">数据文件</div>
              <div className="mt-2 text-sm font-bold">
                {latestImport?.fileName || '-'}
              </div>
            </div>
            <div>
              <div className="text-[#a0a6af]">数据条数</div>
              <div className="mt-2 text-sm font-bold">
                {latestImport?.successRows || 0} 条
              </div>
            </div>
            <div>
              <div className="text-[#a0a6af]">同步状态</div>
              <div className="mt-2 text-sm font-bold text-[#09a64f]">
                {latestImport ? statusLabel(latestImport.status) : '-'}
              </div>
            </div>
          </div>

          <label className="mt-6 flex h-[80px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#d8dadd] text-center text-sm text-[#6b7280]">
            <input
              ref={fileInputRef}
              onChange={event => onFileChange(event.target.files?.[0] || null)}
              className="hidden"
              type="file"
              accept=".xlsx,.csv,.xls"
            />
            <Upload className="mb-2 h-7 w-7 text-[#b3b7bf]" />
            <span>
              {selectedFile ? selectedFile.name : '点击上传 或 拖拽文件至此处'}
            </span>
            <span className="mt-2 text-base text-[#b3b7bf]">
              .csv / .xlsx / .xls · 最大 50MB
            </span>
          </label>

          <button
            type="button"
            onClick={onDownloadTemplate}
            className="mt-4 text-base font-bold text-[#4f6ef7] hover:underline"
          >
            下载导入模板
          </button>

          {savingId === 'grid-upload' ? (
            <div className="mt-4 text-right text-base font-bold text-[#111]">
              正在导入，请稍候...
            </div>
          ) : null}

          <h3 className="mt-7 text-base font-bold">上传历史</h3>
          <div className="mt-4 divide-y divide-[#eceef2]">
            {imports.map(item => (
              <Fragment key={item.id}>
                <div className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{item.fileName}</div>
                    <div className="mt-1 text-xs text-[#a0a6af]">
                      {formatTime(item.createTime, true)} · {item.successRows}{' '}
                      条{item.failedRows ? ` · 失败 ${item.failedRows} 条` : ''}
                    </div>
                  </div>
                  <div className="ml-4 flex shrink-0 items-center gap-2">
                    {item.status === 'completed' ||
                    item.status === 'partial_success' ? (
                      <button
                        type="button"
                        className="text-sm text-[#d93025] hover:underline disabled:opacity-40"
                        disabled={savingId === `rollback-${item.id}`}
                        onClick={() => onRollback(item.id)}
                      >
                        {savingId === `rollback-${item.id}`
                          ? '回滚中...'
                          : '回滚'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onToggleAudit(item.id)}
                    >
                      <span className="text-sm text-[#4f6ef7] hover:underline">
                        审计
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleErrors(item.id)}
                    >
                      <Tag danger={item.status !== 'completed'}>
                        {statusLabel(item.status)}
                      </Tag>
                    </button>
                  </div>
                </div>
                {activeAuditId === item.id ? (
                  <div className="rounded-xl bg-[#f0f4ff] p-4">
                    <div className="mb-2 text-base font-bold text-[#4f6ef7]">
                      操作审计
                    </div>
                    {importAudits.length === 0 ? (
                      <div className="text-xs text-[#8a9099]">暂无审计记录</div>
                    ) : (
                      importAudits.map(audit => (
                        <div
                          key={audit.id}
                          className="flex items-start gap-3 border-l-2 border-[#4f6ef7] py-2 pl-3 text-base"
                        >
                          <div className="min-w-0 flex-1">
                            <span className="font-bold">
                              {audit.action === 'upload'
                                ? '上传'
                                : audit.action === 'rollback'
                                  ? '回滚'
                                  : audit.action}
                            </span>
                            <span className="mx-2 text-[#a0a6af]">·</span>
                            <span className="text-[#6b7280]">
                              {audit.operator}
                            </span>
                            <span className="mx-2 text-[#a0a6af]">·</span>
                            <span className="text-[#a0a6af]">
                              {formatTime(audit.createTime, true)}
                            </span>
                            {audit.detail ? (
                              <div className="mt-1 text-[#6b7280]">
                                {audit.detail}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
                {activeImportId === item.id ? (
                  <div className="rounded-xl bg-[#f7f7f8] p-4">
                    {importErrors.length === 0 ? (
                      <div className="text-xs text-[#8a9099]">暂无失败明细</div>
                    ) : (
                      importErrors.map(error => (
                        <div
                          key={error.id}
                          className="py-2 text-base text-[#d93025]"
                        >
                          第 {error.rowIndex} 行：{error.reason}
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </Fragment>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function CandidatesPanel({
  candidates,
  onApprove,
  onReject
}: {
  candidates: QuestionCandidate[]
  onApprove: (id: number) => Promise<void>
  onReject: (id: number) => Promise<void>
}) {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [approving, setApproving] = useState<number | null>(null)
  const statusLabels: Record<string, { label: string; cls: string }> = {
    pending: { label: '待审批', cls: 'bg-[#fef9c3] text-[#a16207]' },
    approved: { label: '已通过', cls: 'bg-[#dcfce7] text-[#16a34a]' },
    rejected: { label: '已拒绝', cls: 'bg-[#f3f4f6] text-[#6b7280]' }
  }

  const filtered =
    statusFilter === 'all'
      ? candidates
      : candidates.filter(c => c.status === statusFilter)
  const pendingCount = candidates.filter(c => c.status === 'pending').length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto space-y-4 px-1">
      <div className="flex items-center gap-3 shrink-0">
        {['all', 'pending', 'approved', 'rejected'].map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              statusFilter === s
                ? 'bg-[#333] text-white'
                : 'border border-[#e5e7eb] bg-white text-[#6b7280] hover:bg-[#f9fafb]'
            }`}
          >
            {s === 'all'
              ? `全部(${candidates.length})`
              : `${statusLabels[s]?.label || s}(${candidates.filter(c => c.status === s).length})`}
          </button>
        ))}
      </div>

      {pendingCount > 0 ? (
        <div className="rounded-xl border border-[#fef9c3] bg-[#fffef5] px-4 py-3 text-sm text-[#a16207]">
          有 {pendingCount} 条候选问题待审批，审批通过后将自动创建为示例问题。
        </div>
      ) : null}

      <div className="space-y-2">
        {filtered.map(c => {
          const st = statusLabels[c.status] || {
            label: c.status,
            cls: 'text-[#6b7280]'
          }
          return (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm"
            >
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}
              >
                {st.label}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-[#374151]">
                {c.question}
              </span>
              <span className="shrink-0 text-[11px] text-[#9ca3af]">
                {topicLabels[c.topic] || c.topic}
              </span>
              <span className="shrink-0 text-[11px] text-[#9ca3af]">
                问{c.count}次
              </span>
              {c.status === 'pending' ? (
                <>
                  <button
                    type="button"
                    disabled={approving === c.id}
                    onClick={async () => {
                      setApproving(c.id)
                      try {
                        await onApprove(c.id)
                      } finally {
                        setApproving(null)
                      }
                    }}
                    className="shrink-0 rounded-lg bg-[#16a34a] px-3 py-1 text-[12px] font-medium text-white disabled:opacity-50"
                  >
                    通过
                  </button>
                  <button
                    type="button"
                    onClick={() => onReject(c.id)}
                    className="shrink-0 rounded-lg border border-[#fecaca] px-3 py-1 text-[12px] font-medium text-[#dc2626]"
                  >
                    拒绝
                  </button>
                </>
              ) : null}
            </div>
          )
        })}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e5e7eb] px-5 py-4 text-sm text-[#9ca3af]">
            暂无候选问题
          </div>
        ) : null}
      </div>
    </div>
  )
}

const relTypeLabels: Record<string, string> = {
  reference: '引用',
  supplement: '补充',
  repeal: '废止',
  related: '相关'
}

function DocumentsPanel({
  relations,
  complianceIssues,
  onReload,
  onAutoDiscover,
  onComplianceCheck,
  onDeleteRelation,
  onCreateRelation
}: {
  relations: DocumentRelationItem[]
  complianceIssues: ComplianceIssue[]
  onReload: () => void
  onAutoDiscover: (knowledgeCode: string, dryRun: boolean) => Promise<void>
  onComplianceCheck: (knowledgeCode?: string) => Promise<void>
  onDeleteRelation: (id: number) => Promise<void>
  onCreateRelation: (
    fromDocId: number,
    toDocId: number,
    relType: string,
    description: string
  ) => Promise<void>
}) {
  const [relFilter, setRelFilter] = useState<string>('all')
  const [discovering, setDiscovering] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({
    fromDocId: '',
    toDocId: '',
    relType: 'reference',
    description: ''
  })

  const filtered =
    relFilter === 'all'
      ? relations
      : relations.filter(r => r.relType === relFilter)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto space-y-6 px-1">
      <div className="flex items-center gap-3 shrink-0">
        <select
          value={relFilter}
          onChange={e => setRelFilter(e.target.value)}
          className="rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-sm"
        >
          <option value="all">全部类型</option>
          <option value="reference">引用</option>
          <option value="supplement">补充</option>
          <option value="repeal">废止</option>
          <option value="related">相关</option>
        </select>
        <span className="text-sm text-[#6b7280]">
          共 {filtered.length} 条关联
        </span>
        <button
          type="button"
          onClick={() => setShowCreate(v => !v)}
          className="ml-auto rounded-lg bg-[#333] px-4 py-2 text-sm font-medium text-white"
        >
          新建关联
        </button>
      </div>

      {showCreate ? (
        <div className="rounded-xl border border-[#e5e7eb] bg-white p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="来源文档ID"
              value={createForm.fromDocId}
              onChange={e =>
                setCreateForm(f => ({ ...f, fromDocId: e.target.value }))
              }
              className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            />
            <input
              placeholder="目标文档ID"
              value={createForm.toDocId}
              onChange={e =>
                setCreateForm(f => ({ ...f, toDocId: e.target.value }))
              }
              className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <select
              value={createForm.relType}
              onChange={e =>
                setCreateForm(f => ({ ...f, relType: e.target.value }))
              }
              className="rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            >
              <option value="reference">引用</option>
              <option value="supplement">补充</option>
              <option value="repeal">废止</option>
              <option value="related">相关</option>
            </select>
            <input
              placeholder="描述（选填）"
              value={createForm.description}
              onChange={e =>
                setCreateForm(f => ({ ...f, description: e.target.value }))
              }
              className="min-w-0 flex-1 rounded-lg border border-[#e5e7eb] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                const fromId = Number(createForm.fromDocId)
                const toId = Number(createForm.toDocId)
                if (fromId && toId) {
                  await onCreateRelation(
                    fromId,
                    toId,
                    createForm.relType,
                    createForm.description
                  )
                  setShowCreate(false)
                  setCreateForm({
                    fromDocId: '',
                    toDocId: '',
                    relType: 'reference',
                    description: ''
                  })
                }
              }}
              className="rounded-lg bg-[#333] px-4 py-2 text-sm text-white"
            >
              保存
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-[#e5e7eb] px-4 py-2 text-sm"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {filtered.map(r => (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm"
          >
            <span className="min-w-0 flex-1 truncate font-medium text-[#374151]">
              {r.fromDocTitle}
            </span>
            <span className="shrink-0 rounded-full bg-[#f3f4f6] px-2.5 py-0.5 text-[11px] font-semibold text-[#6b7280]">
              {relTypeLabels[r.relType] || r.relType}
            </span>
            <span className="min-w-0 flex-1 truncate text-[#6b7280]">
              {r.toDocTitle}
            </span>
            {r.description ? (
              <span className="shrink-0 text-[11px] text-[#9ca3af]">
                {r.description}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => onDeleteRelation(r.id)}
              className="shrink-0 text-[12px] text-[#dc2626] hover:underline"
            >
              删除
            </button>
          </div>
        ))}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#e5e7eb] px-5 py-4 text-sm text-[#9ca3af]">
            暂无文档关联记录
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-3 border-t border-[#eeeeee] pt-4">
        <button
          type="button"
          disabled={discovering}
          onClick={async () => {
            setDiscovering(true)
            try {
              await onAutoDiscover('', true)
            } finally {
              setDiscovering(false)
            }
          }}
          className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] disabled:opacity-50"
        >
          {discovering ? '扫描中...' : '自动发现关联（预览）'}
        </button>
        <button
          type="button"
          disabled={checking}
          onClick={async () => {
            setChecking(true)
            try {
              await onComplianceCheck()
            } finally {
              setChecking(false)
            }
          }}
          className="rounded-lg border border-[#e5e7eb] bg-white px-4 py-2 text-sm font-medium text-[#374151] disabled:opacity-50"
        >
          {checking ? '检查中...' : '合规检查'}
        </button>
      </div>

      {complianceIssues.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-[#dc2626]">
            合规告警（{complianceIssues.length}）
          </div>
          {complianceIssues.map((issue, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#dc2626]">
                  [{issue.severity}]
                </span>
                <span className="font-medium text-[#374151]">
                  {issue.documentTitle}
                </span>
                <span className="rounded-full bg-[#fef2f2] px-2 py-0.5 text-[11px] text-[#dc2626]">
                  {issue.issueType}
                </span>
              </div>
              <p className="mt-1 text-[#6b7280]">{issue.description}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function LogsPanel({ imports }: { imports: GridImport[] }) {
  const [logFilter, setLogFilter] = useState<'all' | 'system' | 'admin'>('all')
  const rows = [
    [
      '2024-06-01 09:30',
      'zhangsan',
      '问数查询',
      '哪个网格的案件影响最大？',
      '成功'
    ],
    [
      '2024-06-01 09:18',
      'lisi',
      '问答查询',
      '流动人口管理相关政策有哪些？',
      '成功'
    ],
    [
      '2024-06-01 09:10',
      'zhaoliu',
      '问数查询',
      '今天流动人口有多少人？',
      '成功'
    ],
    ['2024-06-01 09:05', 'chenqi', '问数查询', '近3天车流数据', '失败'],
    ...imports
      .slice(0, 2)
      .map(item => [
        formatTime(item.createTime, true),
        item.operator || 'admin',
        '后台操作',
        `上传网格数据：${item.fileName}`,
        item.status === 'completed' ? '成功' : '失败'
      ])
  ]
  const visibleRows = rows.filter(row => {
    if (logFilter === 'all') return true
    if (logFilter === 'admin') return row[2] === '后台操作'
    return row[2] !== '后台操作'
  })

  function toggleLogFilter(next: 'system' | 'admin') {
    setLogFilter(current => (current === next ? 'all' : next))
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-[#e1e3e8] bg-white">
      <div className="flex h-[44px] shrink-0 items-end gap-6 border-b border-[#eceef2] px-4">
        <button
          type="button"
          onClick={() => toggleLogFilter('system')}
          className={
            logFilter === 'system'
              ? 'h-full border-b-3 border-[#111] px-1 pt-3 text-sm font-bold text-[#111]'
              : 'h-full px-1 pt-3 text-sm text-[#8a9099]'
          }
        >
          系统查询日志
        </button>
        <button
          type="button"
          onClick={() => toggleLogFilter('admin')}
          className={
            logFilter === 'admin'
              ? 'h-full border-b-3 border-[#111] px-1 pt-3 text-sm font-bold text-[#111]'
              : 'h-full px-1 pt-3 text-sm text-[#8a9099]'
          }
        >
          管理后台操作日志
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        <div className="mb-4 flex gap-3 shrink-0">
          <input
            placeholder="搜索用户 / 内容..."
            className="h-[36px] w-[240px] rounded-xl border border-[#dfe3ea] px-3 text-sm outline-none placeholder:text-[#c1c5cc]"
          />
          <select className="h-[36px] w-[160px] rounded-xl border border-[#dfe3ea] px-3 text-sm">
            <option>全部类型</option>
            <option>问数查询</option>
            <option>问答查询</option>
            <option>后台操作</option>
          </select>
          <input
            value="2024/06/01"
            readOnly
            className="h-[36px] w-[180px] rounded-xl border border-[#dfe3ea] px-3 text-sm"
          />
        </div>
        <LogTable rows={visibleRows} />
      </div>
    </section>
  )
}

function LogTable({ rows }: { rows: string[][] }) {
  return (
    <div className="min-h-0 flex-1 flex flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <table className="min-w-full table-fixed text-left text-base">
          <colgroup>
            <col className="w-[23%]" />
            <col className="w-[15%]" />
            <col className="w-[14%]" />
            <col className="w-[37%]" />
            <col className="w-[11%]" />
          </colgroup>
          <thead className="sticky top-0 bg-[#f7f7f8] text-sm text-[#8a9099]">
            <tr>
              <th className="px-3 py-2 font-bold">时间</th>
              <th className="px-3 py-2 font-bold">用户</th>
              <th className="px-3 py-2 font-bold">类型</th>
              <th className="px-3 py-2 font-bold">查询内容</th>
              <th className="px-3 py-2 font-bold">结果</th>
            </tr>
          </thead>
        </table>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="min-w-full table-fixed text-left text-base">
            <colgroup>
              <col className="w-[23%]" />
              <col className="w-[15%]" />
              <col className="w-[14%]" />
              <col className="w-[37%]" />
              <col className="w-[11%]" />
            </colgroup>
            <tbody className="divide-y divide-[#eceef2]">
              {rows.map((row, index) => (
                <tr key={`${row[0]}-${index}`}>
                  <td className="truncate px-3 py-2 text-[#a0a6af]">
                    {row[0]}
                  </td>
                  <td className="truncate px-3 py-2">{row[1]}</td>
                  <td className="px-3 py-2">
                    <Tag>{row[2]}</Tag>
                  </td>
                  <td className="truncate px-3 py-2">{row[3]}</td>
                  <td className="px-3 py-2">
                    <Tag danger={row[4] === '失败'}>{row[4]}</Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="shrink-0 pt-3 flex items-center justify-end gap-1.5 text-sm text-[#a0a6af]">
        <span>共 {rows.length} 条</span>
        <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">
          «
        </button>
        <button className="rounded-lg bg-[#111] px-4 py-2 text-white">1</button>
        <button className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-[#333]">
          2
        </button>
        <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">
          »
        </button>
      </div>
    </div>
  )
}

function UserPermissionModal({
  user,
  saving,
  onClose,
  onSave
}: {
  user: AdminUser
  saving: boolean
  onClose: () => void
  onSave: (
    permissions: TopicPermission[],
    qaPermissions: KnowledgePermission[]
  ) => void
}) {
  const [topicPermissions, setTopicPermissions] = useState<TopicPermission[]>(
    user.permissions
  )
  const [qaPermissions, setQaPermissions] = useState<KnowledgePermission[]>(
    user.qaPermissions || []
  )
  const [openSelect, setOpenSelect] = useState<'topics' | 'qa' | null>(null)

  function toggleTopic(topic: TopicKey) {
    setTopicPermissions(prev =>
      prev.map(item =>
        item.topic === topic ? { ...item, enabled: !item.enabled } : item
      )
    )
  }

  function toggleQa(value: string) {
    setQaPermissions(prev =>
      prev.map(item =>
        item.code === value ? { ...item, enabled: !item.enabled } : item
      )
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]">
      <div className="w-[520px] overflow-visible rounded-xl bg-white shadow-2xl">
        <div className="flex h-[52px] items-center justify-between border-b border-[#eceef2] px-5">
          <div>
            <h2 className="text-base font-bold">编辑权限</h2>
            <p className="mt-1 text-sm text-[#8a9099]">
              {user.username}（{userDisplayName(user.username)}）
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-7 w-7 text-[#b7bbc3]" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <MultiSelectBox
            label="问数权限"
            hint="控制用户可访问的网格、人流、车流主题。"
            open={openSelect === 'topics'}
            onToggleOpen={() =>
              setOpenSelect(openSelect === 'topics' ? null : 'topics')
            }
            values={topicPermissions
              .filter(item => item.enabled)
              .map(item => topicLabels[item.topic])}
            options={topicPermissions.map(item => ({
              key: item.topic,
              label: topicLabels[item.topic],
              checked: item.enabled
            }))}
            onToggleOption={key => toggleTopic(key as TopicKey)}
          />

          <MultiSelectBox
            label="问答权限"
            hint="控制用户可访问的知识库，后续新增知识库会在这里继续扩展。"
            open={openSelect === 'qa'}
            onToggleOpen={() =>
              setOpenSelect(openSelect === 'qa' ? null : 'qa')
            }
            values={qaPermissions
              .filter(item => item.enabled)
              .map(item => item.name)}
            options={qaPermissions.map(item => ({
              key: item.code,
              label: item.name,
              checked: item.enabled
            }))}
            onToggleOption={toggleQa}
          />
        </div>

        <div className="flex h-[48px] items-center justify-end gap-3 border-t border-[#eceef2] px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#dfe3ea] px-4 py-2 text-sm font-bold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(topicPermissions, qaPermissions)}
            disabled={saving}
            className="rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}

function MultiSelectBox({
  label,
  hint,
  open,
  values,
  options,
  onToggleOpen,
  onToggleOption
}: {
  label: string
  hint: string
  open: boolean
  values: string[]
  options: Array<{ key: string; label: string; checked: boolean }>
  onToggleOpen: () => void
  onToggleOption: (key: string) => void
}) {
  return (
    <div className="relative">
      <div className="mb-2 flex items-end justify-between">
        <label className="text-sm font-bold">{label}</label>
        <span className="text-base text-[#8a9099]">{hint}</span>
      </div>
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex min-h-[54px] w-full items-center justify-between rounded-xl border border-[#dfe3ea] bg-white px-4 py-2 text-left"
      >
        <div className="flex flex-wrap gap-2">
          {values.length ? (
            values.map(value => <Tag key={value}>{value}</Tag>)
          ) : (
            <span className="text-sm text-[#a0a6af]">请选择</span>
          )}
        </div>
        <span className="ml-4 text-sm text-[#8a9099]">⌄</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 rounded-xl border border-[#dfe3ea] bg-white p-2 shadow-lg">
          {options.map(option => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[#f7f7f8]"
            >
              <input
                type="checkbox"
                checked={option.checked}
                onChange={() => onToggleOption(option.key)}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function QuestionModal({
  tab,
  question,
  saving,
  onTabChange,
  onQuestionChange,
  onClose,
  onSave
}: {
  tab: 'manual' | 'batch'
  question: Omit<ExampleQuestion, 'id' | 'updateTime'>
  saving: boolean
  onTabChange: (tab: 'manual' | 'batch') => void
  onQuestionChange: (
    question: Omit<ExampleQuestion, 'id' | 'updateTime'>
  ) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]">
      <div className="w-[600px] overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex h-[52px] items-center justify-between border-b border-[#eceef2] px-5">
          <h2 className="text-base font-bold">新增示例问题</h2>
          <button type="button" onClick={onClose}>
            <X className="h-7 w-7 text-[#b7bbc3]" />
          </button>
        </div>

        <div className="flex h-[40px] items-end gap-4 border-b border-[#eceef2] px-5">
          <button
            type="button"
            onClick={() => onTabChange('manual')}
            className={
              tab === 'manual'
                ? 'h-full border-b-3 border-[#111] px-1 pt-4 text-sm font-bold'
                : 'h-full px-1 pt-4 text-sm text-[#8a9099]'
            }
          >
            手动录入
          </button>
          <button
            type="button"
            onClick={() => onTabChange('batch')}
            className={
              tab === 'batch'
                ? 'h-full border-b-3 border-[#111] px-1 pt-4 text-sm font-bold'
                : 'h-full px-1 pt-4 text-sm text-[#8a9099]'
            }
          >
            批量上传
          </button>
        </div>

        <div className="px-5 py-5">
          {tab === 'manual' ? (
            <div>
              <label className="text-sm">所属主题</label>
              <select
                value={question.topic}
                onChange={event =>
                  onQuestionChange({
                    ...question,
                    topic: event.target.value as TopicKey
                  })
                }
                className="mt-2 h-[36px] w-full rounded-xl border border-[#dfe3ea] px-4 text-sm"
              >
                <option value="grid">网格</option>
                <option value="population">人流</option>
                <option value="traffic">车流</option>
              </select>

              <div className="mt-5 rounded-lg border border-[#e1e3e8] px-3 py-2">
                <div className="mb-4 text-sm font-bold text-[#a0a6af]">
                  第 1 条
                </div>
                <label className="text-sm">
                  用户不标准提问 <span className="text-[#ff3b30]">*</span>
                </label>
                <input
                  value={question.question}
                  onChange={event =>
                    onQuestionChange({
                      ...question,
                      question: event.target.value
                    })
                  }
                  placeholder="例：今天人流咋样？"
                  className="mt-2 h-[36px] w-full rounded-xl border border-[#dfe3ea] px-4 text-sm"
                />
                <label className="mt-5 block text-lg">
                  映射标准问题 <span className="text-[#a0a6af]">（选填）</span>
                </label>
                <input
                  value={question.description}
                  onChange={event =>
                    onQuestionChange({
                      ...question,
                      description: event.target.value
                    })
                  }
                  placeholder="例：今日人流进出统计是多少？"
                  className="mt-2 h-[36px] w-full rounded-xl border border-[#dfe3ea] px-4 text-sm"
                />
                <label className="mt-5 block text-lg">
                  期望回答内容 <span className="text-[#a0a6af]">（选填）</span>
                </label>
                <textarea
                  placeholder="输入希望系统回复的内容..."
                  className="mt-2 h-[60px] w-full rounded-xl border border-[#dfe3ea] px-4 py-2 text-sm"
                />
              </div>
              <button className="mt-4 h-[36px] w-full rounded-lg border border-[#dfe3ea] text-sm">
                + 再加一条
              </button>
            </div>
          ) : (
            <div>
              <div className="rounded-md bg-[#f7f7f8] px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-bold">下载导入模板</div>
                    <div className="mt-1 text-xs text-[#8a9099]">
                      模板包含：用户不标准提问 / 映射标准问题 / 期望回答内容
                    </div>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#dfe3ea] bg-white px-3 py-1.5 text-sm">
                    <Download className="h-5 w-5" />
                    下载模板
                  </button>
                </div>
              </div>
              <label className="mt-7 flex h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-[#d8dadd] text-center text-sm text-[#555]">
                <input type="file" className="hidden" accept=".xlsx,.csv" />
                <FileText className="mb-4 h-8 w-8 text-[#d8c8e8]" />
                拖拽文件至此处 或 点击选择
                <span className="mt-2 text-base text-[#b3b7bf]">
                  .xlsx / .csv · 最大 10MB
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex h-[48px] items-center justify-end gap-3 border-t border-[#eceef2] px-5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#dfe3ea] px-4 py-2 text-sm font-bold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-[#111] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {tab === 'manual' ? '保存' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
