'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AlertTriangle, Download, FileText, LogOut, Plus, Search, Upload, X } from 'lucide-react'

type AdminSection = 'overview' | 'users' | 'questions' | 'data' | 'logs'
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
  items: Array<{ key: AdminSection; label: string }>
}> = [
  { title: '概览', items: [{ key: 'overview', label: '首页' }] },
  { title: '权限管理', items: [{ key: 'users', label: '用户权限管理' }] },
  { title: '内容管理', items: [{ key: 'questions', label: '示例问题管理' }] },
  { title: '数据接入', items: [{ key: 'data', label: '数据接入管理' }] },
  { title: '系统', items: [{ key: 'logs', label: '操作日志' }] }
]

const sectionTitles: Record<AdminSection, string> = {
  overview: '首页',
  users: '用户权限管理',
  questions: '示例问题管理',
  data: '数据接入管理',
  logs: '操作日志'
}

const sectionSubtitles: Partial<Record<AdminSection, string>> = {
  users: '用户来自统一认证系统，在此配置各用户的数据访问白名单。',
  questions: '配置用户不标准提问到标准问题的映射，以及期望的回答内容（后两项选填）。',
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
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...init?.headers
    }
  })
  const payload = (await response.json().catch(() => null)) as ApiEnvelope<T> | null
  if (!response.ok || payload?.code !== 0) {
    throw new Error(payload?.message || '后台接口请求失败')
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

function userDisplayName(user: Pick<AdminUser, 'username' | 'displayName'> | string) {
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
    <div className="rounded-[18px] border border-[#e1e3e8] bg-white px-8 py-7">
      <div className="text-lg text-[#8a9099]">{label}</div>
      <div className="mt-2 text-[46px] font-bold leading-none tracking-normal text-[#05070a]">
        {value}
      </div>
      <div className={danger ? 'mt-3 text-lg text-[#ff3b30]' : 'mt-3 text-lg text-[#12b35c]'}>
        {footnote}
      </div>
    </div>
  )
}

function SourceStatusCard({ source }: { source: DataSource }) {
  return (
    <div className="flex h-[76px] items-center justify-between rounded-[16px] border border-[#e1e3e8] bg-white px-7">
      <div className="text-xl font-bold text-[#05070a]">
        {sourceLabels[source.type] || source.name}
      </div>
      <div className={source.enabled ? 'text-xl font-bold text-[#09a64f]' : 'text-xl font-bold text-[#8a9099]'}>
        {source.enabled ? '接入正常' : '已关闭'}
      </div>
    </div>
  )
}

export function AdminDashboard() {
  const [activeSection, setActiveSection] = useState<AdminSection>('overview')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [questions, setQuestions] = useState<ExampleQuestion[]>([])
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [imports, setImports] = useState<GridImport[]>([])
  const [candidates, setCandidates] = useState<QuestionCandidate[]>([])
  const [search, setSearch] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newQuestion, setNewQuestion] = useState(emptyQuestion)
  const [questionTopic, setQuestionTopic] = useState<TopicKey>('grid')
  const [questionModalOpen, setQuestionModalOpen] = useState(false)
  const [questionModalTab, setQuestionModalTab] = useState<'manual' | 'batch'>('manual')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importErrors, setImportErrors] = useState<GridImportError[]>([])
  const [activeImportId, setActiveImportId] = useState<number | null>(null)
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAdminData = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [userData, questionData, sourceData, importData, candidateData] =
        await Promise.all([
          adminFetch<{ list: AdminUser[] }>('users'),
          adminFetch<{ list: ExampleQuestion[] }>('example-questions'),
          adminFetch<{ list: DataSource[] }>('data-sources'),
          adminFetch<{ list: GridImport[] }>('grid-data/imports'),
          adminFetch<{ list: QuestionCandidate[] }>('question-candidates')
        ])
      setUsers(userData.list || [])
      setQuestions(questionData.list || [])
      setDataSources(sourceData.list || [])
      setImports(importData.list || [])
      setCandidates(candidateData.list || [])
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
  const failedImports = imports.filter(item => item.failedRows > 0 || item.status === 'failed')
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
      await adminFetch<Record<string, never>>(`example-questions/${questionId}`, {
        method: 'DELETE'
      })
      setQuestions(prev => prev.filter(item => item.id !== questionId))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '删除问题失败')
    } finally {
      setSavingId(null)
    }
  }

  async function toggleDataSource(source: DataSource, enabled: boolean) {
    setSavingId(`source-${source.type}`)
    try {
      const data = await adminFetch<{ item: DataSource }>(
        `data-sources/${source.type}/status`,
        {
          method: 'PUT',
          body: JSON.stringify({
            enabled,
            status: enabled ? 'running' : 'closed'
          })
        }
      )
      setDataSources(prev =>
        prev.map(item => (item.type === source.type ? data.item : item))
      )
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '数据源保存失败')
    } finally {
      setSavingId(null)
    }
  }

  async function uploadGridData(file = selectedFile) {
    if (!file) {
      setError('请选择要上传的 Excel 或 CSV 文件')
      return
    }
    setSavingId('grid-upload')
    try {
      const formData = new FormData()
      formData.append('month', new Date().toISOString().slice(0, 7))
      formData.append('operator', 'admin')
      formData.append('file', file)
      const data = await adminFetch<{ item: GridImport }>('grid-data/upload', {
        method: 'POST',
        body: formData
      })
      setImports(prev => [data.item, ...prev])
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '文件上传失败')
    } finally {
      setSavingId(null)
    }
  }

  async function loadImportErrors(importId: number) {
    if (activeImportId === importId) {
      setActiveImportId(null)
      setImportErrors([])
      return
    }
    setSavingId(`import-errors-${importId}`)
    try {
      const data = await adminFetch<{ list: GridImportError[] }>(
        `grid-data/imports/${importId}/errors`
      )
      setActiveImportId(importId)
      setImportErrors(data.list || [])
      setError('')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '失败明细加载失败')
    } finally {
      setSavingId(null)
    }
  }

  async function logout() {
    await fetch('/api/chatdb/logout', { method: 'POST' }).catch(() => undefined)
    window.localStorage.removeItem('chatdb_admin_login')
    window.location.reload()
  }

  function openQuestionModal() {
    setNewQuestion({ ...emptyQuestion, topic: questionTopic })
    setQuestionModalTab('manual')
    setQuestionModalOpen(true)
  }

  return (
    <div className="flex h-full min-h-0 bg-[#f4f4f6] text-[#05070a]">
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[#e2e4e8] bg-white">
        <div className="flex h-[82px] items-center border-b border-[#eceef2] px-7">
          <div className="text-[28px] font-bold tracking-normal">问答问数</div>
        </div>

        <nav className="flex-1 py-6">
          {menuGroups.map(group => (
            <div key={group.title} className="mb-7">
              <div className="px-7 text-lg font-bold text-[#c3c7ce]">{group.title}</div>
              <div className="mt-3">
                {group.items.map(item => {
                  const active = activeSection === item.key
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveSection(item.key)}
                      className={
                        active
                          ? 'relative flex h-[54px] w-full items-center bg-[#f1f1f3] px-8 text-[22px] font-bold text-[#05070a] before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-[#111]'
                          : 'flex h-[54px] w-full items-center px-8 text-[22px] text-[#1f2937] hover:bg-[#f7f7f8]'
                      }
                    >
                      {item.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-[#eceef2] px-7 py-7">
          <div className="flex items-center gap-4">
            <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-[#111] text-lg font-bold text-white">
              管
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xl font-bold leading-tight">admin</div>
              <div className="mt-1 text-base text-[#a1a7b1]">超级管理员</div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg border border-[#e2e4e8] px-3 py-2 text-sm text-[#333] hover:bg-[#f5f6f8]"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        <header className="flex h-[74px] items-center justify-between border-b border-[#dddfe4] bg-white px-10">
          <div className="text-[22px] text-[#a6abb3]">
            首页 / <span className="font-bold text-[#05070a]">{sectionTitles[activeSection]}</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="rounded-full bg-[#111] px-4 py-1 text-lg font-bold leading-none text-white">
              ADMIN
            </span>
            <span className="text-xl text-[#9aa0aa]">{nowText()}</span>
          </div>
        </header>

        <div className="px-10 py-9">
          {error ? (
            <div className="mb-5 flex items-center justify-between rounded-xl border border-[#ff5a3d] bg-white px-4 py-3 text-base text-[#d93025]">
              <span>{error}</span>
              <button type="button" onClick={() => setError('')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="rounded-[18px] border border-[#e1e3e8] bg-white p-10 text-center text-lg text-[#8a9099]">
              正在加载后台数据...
            </div>
          ) : null}

          {!loading ? (
            <div className="mb-8">
              <h1 className="text-[34px] font-bold tracking-normal">
                {sectionTitles[activeSection]}
              </h1>
              {sectionSubtitles[activeSection] ? (
                <p className="mt-2 text-xl text-[#8a9099]">{sectionSubtitles[activeSection]}</p>
              ) : null}
            </div>
          ) : null}

          {!loading && activeSection === 'overview' ? (
            <OverviewPanel
              users={users}
              questions={questions}
              candidates={candidates}
              dataSources={dataSources}
              imports={imports}
              latestImport={latestImport}
              failedImports={failedImports}
              failedQueryCount={failedQueryCount}
            />
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
              selectedFile={selectedFile}
              savingId={savingId}
              fileInputRef={fileInputRef}
              activeImportId={activeImportId}
              importErrors={importErrors}
              onFileChange={file => {
                setSelectedFile(file)
                if (file) {
                  uploadGridData(file)
                }
              }}
              onToggleSource={toggleDataSource}
              onToggleErrors={loadImportErrors}
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
  failedQueryCount
}: {
  users: AdminUser[]
  questions: ExampleQuestion[]
  candidates: QuestionCandidate[]
  dataSources: DataSource[]
  imports: GridImport[]
  latestImport?: GridImport
  failedImports: GridImport[]
  failedQueryCount: number
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {dataSources.some(item => !item.enabled) ? (
          <div className="inline-flex h-[48px] items-center gap-3 rounded-xl border-2 border-[#ff5a3d] bg-white px-4 text-lg">
            <AlertTriangle className="h-5 w-5 text-[#ff3b30]" />
            <span>{dataSources.find(item => !item.enabled)?.name || '数据源'}接入中断</span>
            <span className="text-[#a6abb3]">10分钟前</span>
            <X className="h-4 w-4 text-[#a6abb3]" />
          </div>
        ) : null}
        {failedImports[0] ? (
          <div className="inline-flex h-[48px] items-center gap-3 rounded-xl border-2 border-[#ff5a3d] bg-white px-4 text-lg">
            <span className="font-bold text-[#ff3b30]">!</span>
            <span>网格数据上传部分失败</span>
            <span className="text-[#a6abb3]">{formatTime(failedImports[0].createTime)}</span>
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

      <h2 className="mt-7 text-2xl font-bold">数据源状态</h2>
      <div className="mt-4 grid gap-5 xl:grid-cols-3">
        {dataSources.map(source => (
          <SourceStatusCard key={source.type} source={source} />
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
    <section className="rounded-[18px] border border-[#e1e3e8] bg-white">
      <div className="border-b border-[#eceef2] px-7 py-6">
        <h2 className="text-2xl font-bold">用户列表</h2>
      </div>
      <div className="px-7 py-7">
        <div className="mb-5 flex h-[50px] w-[300px] items-center gap-2 rounded-xl border border-[#dfe3ea] px-4">
          <Search className="h-5 w-5 text-[#b2b6bf]" />
          <input
            value={search}
            onChange={event => onSearch(event.target.value)}
            placeholder="搜索姓名 / 账号..."
            className="w-full bg-transparent text-lg outline-none placeholder:text-[#c1c5cc]"
          />
        </div>

        <table className="min-w-full table-fixed text-left text-xl">
          <colgroup>
            <col className="w-[14%]" />
            <col className="w-[10%]" />
            <col className="w-[20%]" />
            <col className="w-[30%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="bg-[#f7f7f8] text-lg text-[#8a9099]">
            <tr>
              <th className="px-5 py-4 font-bold">账号</th>
              <th className="px-5 py-4 font-bold">姓名</th>
              <th className="px-5 py-4 font-bold">问数权限</th>
              <th className="px-5 py-4 font-bold">问答权限</th>
              <th className="px-5 py-4 font-bold">最后登录</th>
              <th className="px-5 py-4 font-bold">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#eceef2]">
            {users.map(user => (
              <tr key={user.userId}>
                <td className="truncate px-5 py-5">{user.username}</td>
                <td className="truncate px-5 py-5">{userDisplayName(user)}</td>
                <td className="px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    {user.permissions.filter(permission => permission.enabled).length ? (
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
                <td className="px-5 py-5">
                  <div className="flex flex-wrap gap-2">
                    {user.qaPermissions?.filter(permission => permission.enabled).length ? (
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
                <td className="px-5 py-5 text-[#a0a6af]">{formatTime(user.updateTime, true)}</td>
                <td className="px-5 py-5">
                  <button
                    type="button"
                    onClick={() => onEdit(user)}
                    className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-base font-bold"
                  >
                    编辑权限
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-7 flex items-center justify-end gap-2 text-lg text-[#a0a6af]">
          <span>共 {users.length} 条</span>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">«</button>
          <button className="rounded-lg bg-[#111] px-4 py-2 text-white">1</button>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-[#333]">2</button>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-[#333]">3</button>
          <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">»</button>
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
    <section className="rounded-[18px] border border-[#e1e3e8] bg-white">
      <div className="flex h-[64px] items-end gap-8 border-b border-[#eceef2] px-7">
        {(['grid', 'population', 'traffic'] as TopicKey[]).map(topic => (
          <button
            key={topic}
            type="button"
            onClick={() => onTopicChange(topic)}
            className={
              activeTopic === topic
                ? 'h-full border-b-3 border-[#111] px-1 pt-5 text-[22px] font-bold'
                : 'h-full px-1 pt-5 text-[22px] text-[#9aa0aa]'
            }
          >
            {topicLabels[topic]}
          </button>
        ))}
      </div>

      <div className="px-7 py-6">
        <div className="mb-5 flex justify-end">
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#111] px-5 text-lg font-bold text-white"
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
    <>
      <table className="min-w-full table-fixed text-left text-xl">
        <colgroup>
          <col className="w-[21%]" />
          <col className="w-[21%]" />
          <col className="w-[21%]" />
          <col className="w-[9%]" />
          <col className="w-[13%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead className="bg-[#f7f7f8] text-lg text-[#8a9099]">
          <tr>
            <th className="px-5 py-4 font-bold">用户不标准提问</th>
            <th className="px-5 py-4 font-bold">映射标准问题</th>
            <th className="px-5 py-4 font-bold">期望回答</th>
            <th className="px-5 py-4 font-bold">来源</th>
            <th className="px-5 py-4 font-bold">创建时间</th>
            <th className="px-5 py-4 font-bold">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eceef2]">
          {questions.map(question => (
            <tr key={question.id}>
              <td className="truncate px-5 py-5">{question.question}</td>
              <td className="truncate px-5 py-5 text-[#8a9099]">
                {question.description || question.question}
              </td>
              <td className="truncate px-5 py-5 text-[#8a9099]">
                {question.enabled ? '按标准口径生成结构化回答' : '-'}
              </td>
              <td className="px-5 py-5">
                <Tag danger={question.sort > 0}>
                  {question.sort > 0 ? '系统沉淀' : '人工录入'}
                </Tag>
              </td>
              <td className="truncate px-5 py-5 text-[#a0a6af]">
                {formatTime(question.updateTime, true)}
              </td>
              <td className="px-5 py-5">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit({ ...question, enabled: !question.enabled })}
                    className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-base font-bold"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(question.id)}
                    className="rounded-lg border border-[#ffb4a8] px-4 py-2 text-base text-[#ff3b30]"
                  >
                    删除
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-7 flex items-center justify-end gap-3 text-lg text-[#a0a6af]">
        <span>共 {questions.length} 条</span>
        <button className="rounded-lg bg-[#111] px-4 py-2 text-white">1</button>
      </div>
    </>
  )
}

function DataPanel({
  dataSources,
  imports,
  selectedFile,
  savingId,
  fileInputRef,
  activeImportId,
  importErrors,
  onFileChange,
  onToggleSource,
  onToggleErrors
}: {
  dataSources: DataSource[]
  imports: GridImport[]
  selectedFile: File | null
  savingId: string | null
  fileInputRef: React.RefObject<HTMLInputElement>
  activeImportId: number | null
  importErrors: GridImportError[]
  onFileChange: (value: File | null) => void
  onToggleSource: (source: DataSource, enabled: boolean) => void
  onToggleErrors: (importId: number) => void
}) {
  const population = dataSources.find(source => source.type === 'population')
  const traffic = dataSources.find(source => source.type === 'traffic')
  const latestImport = imports[0]

  return (
    <div className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-2">
        {[population, traffic].filter(Boolean).map(source => (
          <div
            key={source!.type}
            className="flex h-[120px] items-center justify-between rounded-[18px] border border-[#e1e3e8] bg-white px-7"
          >
            <div>
              <h2 className="text-2xl font-bold">{sourceLabels[source!.type]}</h2>
              <p className="mt-5 text-lg text-[#a0a6af]">
                最后同步 {formatTime(source!.latestSync, true)}
              </p>
            </div>
            <AdminToggle
              checked={source!.enabled}
              disabled={savingId === `source-${source!.type}`}
              onChange={checked => onToggleSource(source!, checked)}
            />
          </div>
        ))}
      </div>

      <section className="rounded-[18px] border border-[#e1e3e8] bg-white">
        <div className="border-b border-[#eceef2] px-7 py-6">
          <h2 className="text-2xl font-bold">网格数据月度上传</h2>
        </div>
        <div className="px-7 py-7">
          <div className="grid rounded-[16px] bg-[#f7f7f8] px-7 py-5 text-lg xl:grid-cols-4">
            <div>
              <div className="text-[#a0a6af]">最近同步时间</div>
              <div className="mt-2 text-xl font-bold">{formatTime(latestImport?.createTime, true)}</div>
            </div>
            <div>
              <div className="text-[#a0a6af]">数据文件</div>
              <div className="mt-2 text-xl font-bold">{latestImport?.fileName || '-'}</div>
            </div>
            <div>
              <div className="text-[#a0a6af]">数据条数</div>
              <div className="mt-2 text-xl font-bold">{latestImport?.successRows || 0} 条</div>
            </div>
            <div>
              <div className="text-[#a0a6af]">同步状态</div>
              <div className="mt-2 text-xl font-bold text-[#09a64f]">
                {latestImport ? statusLabel(latestImport.status) : '-'}
              </div>
            </div>
          </div>

          <label className="mt-6 flex h-[140px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#d8dadd] text-center text-xl text-[#6b7280]">
            <input
              ref={fileInputRef}
              onChange={event => onFileChange(event.target.files?.[0] || null)}
              className="hidden"
              type="file"
              accept=".xlsx,.csv,.xls"
            />
            <Upload className="mb-2 h-7 w-7 text-[#b3b7bf]" />
            <span>{selectedFile ? selectedFile.name : '点击上传 或 拖拽文件至此处'}</span>
            <span className="mt-2 text-base text-[#b3b7bf]">.csv / .xlsx / .xls · 最大 50MB</span>
          </label>

          {savingId === 'grid-upload' ? (
            <div className="mt-4 text-right text-base font-bold text-[#111]">
              正在导入，请稍候...
            </div>
          ) : null}

          <h3 className="mt-7 text-2xl font-bold">上传历史</h3>
          <div className="mt-4 divide-y divide-[#eceef2]">
            {imports.map(item => (
              <Fragment key={item.id}>
                <div className="flex items-center justify-between py-4">
                  <div>
                    <div className="text-xl">{item.fileName}</div>
                    <div className="mt-1 text-lg text-[#a0a6af]">
                      {formatTime(item.createTime, true)} · {item.successRows} 条
                      {item.failedRows ? ` · 失败 ${item.failedRows} 条` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => onToggleErrors(item.id)}>
                    <Tag danger={item.status !== 'completed'}>
                      {statusLabel(item.status)}
                    </Tag>
                  </button>
                </div>
                {activeImportId === item.id ? (
                  <div className="rounded-xl bg-[#f7f7f8] p-4">
                    {importErrors.length === 0 ? (
                      <div className="text-lg text-[#8a9099]">暂无失败明细</div>
                    ) : (
                      importErrors.map(error => (
                        <div key={error.id} className="py-2 text-base text-[#d93025]">
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

function LogsPanel({ imports }: { imports: GridImport[] }) {
  const [logFilter, setLogFilter] = useState<'all' | 'system' | 'admin'>('all')
  const rows = [
    ['2024-06-01 09:30', 'zhangsan', '问数查询', '哪个网格的案件影响最大？', '成功'],
    ['2024-06-01 09:18', 'lisi', '问答查询', '流动人口管理相关政策有哪些？', '成功'],
    ['2024-06-01 09:10', 'zhaoliu', '问数查询', '今天流动人口有多少人？', '成功'],
    ['2024-06-01 09:05', 'chenqi', '问数查询', '近3天车流数据', '失败'],
    ...imports.slice(0, 2).map(item => [
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
    <section className="rounded-[18px] border border-[#e1e3e8] bg-white">
      <div className="flex h-[64px] items-end gap-10 border-b border-[#eceef2] px-7">
        <button
          type="button"
          onClick={() => toggleLogFilter('system')}
          className={
            logFilter === 'system'
              ? 'h-full border-b-3 border-[#111] px-1 pt-5 text-[22px] font-bold text-[#111]'
              : 'h-full px-1 pt-5 text-[22px] text-[#8a9099]'
          }
        >
          系统查询日志
        </button>
        <button
          type="button"
          onClick={() => toggleLogFilter('admin')}
          className={
            logFilter === 'admin'
              ? 'h-full border-b-3 border-[#111] px-1 pt-5 text-[22px] font-bold text-[#111]'
              : 'h-full px-1 pt-5 text-[22px] text-[#8a9099]'
          }
        >
          管理后台操作日志
        </button>
      </div>
      <div className="px-7 py-5">
        <div className="mb-5 flex gap-3">
          <input
            placeholder="搜索用户 / 内容..."
            className="h-[50px] w-[300px] rounded-xl border border-[#dfe3ea] px-4 text-lg outline-none placeholder:text-[#c1c5cc]"
          />
          <select className="h-[50px] w-[196px] rounded-xl border border-[#dfe3ea] px-4 text-lg">
            <option>全部类型</option>
            <option>问数查询</option>
            <option>问答查询</option>
            <option>后台操作</option>
          </select>
          <input
            value="2024/06/01"
            readOnly
            className="h-[50px] w-[220px] rounded-xl border border-[#dfe3ea] px-4 text-lg"
          />
        </div>
        <LogTable rows={visibleRows} />
      </div>
    </section>
  )
}

function LogTable({ rows }: { rows: string[][] }) {
  return (
    <>
      <table className="min-w-full table-fixed text-left text-xl">
        <colgroup>
          <col className="w-[23%]" />
          <col className="w-[15%]" />
          <col className="w-[14%]" />
          <col className="w-[37%]" />
          <col className="w-[11%]" />
        </colgroup>
        <thead className="bg-[#f7f7f8] text-lg text-[#8a9099]">
          <tr>
            <th className="px-5 py-4 font-bold">时间</th>
            <th className="px-5 py-4 font-bold">用户</th>
            <th className="px-5 py-4 font-bold">类型</th>
            <th className="px-5 py-4 font-bold">查询内容</th>
            <th className="px-5 py-4 font-bold">结果</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#eceef2]">
          {rows.map((row, index) => (
            <tr key={`${row[0]}-${index}`}>
              <td className="truncate px-5 py-4 text-[#a0a6af]">{row[0]}</td>
              <td className="truncate px-5 py-4">{row[1]}</td>
              <td className="px-5 py-4">
                <Tag>{row[2]}</Tag>
              </td>
              <td className="truncate px-5 py-4">{row[3]}</td>
              <td className="px-5 py-4">
                <Tag danger={row[4] === '失败'}>{row[4]}</Tag>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-7 flex items-center justify-end gap-2 text-lg text-[#a0a6af]">
        <span>共 {rows.length} 条</span>
        <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">«</button>
        <button className="rounded-lg bg-[#111] px-4 py-2 text-white">1</button>
        <button className="rounded-lg border border-[#dfe3ea] px-4 py-2 text-[#333]">2</button>
        <button className="rounded-lg border border-[#dfe3ea] px-4 py-2">»</button>
      </div>
    </>
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
  onSave: (permissions: TopicPermission[], qaPermissions: KnowledgePermission[]) => void
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
      <div className="w-[680px] overflow-visible rounded-[18px] bg-white shadow-2xl">
        <div className="flex h-[86px] items-center justify-between border-b border-[#eceef2] px-8">
          <div>
            <h2 className="text-2xl font-bold">编辑权限</h2>
            <p className="mt-1 text-base text-[#8a9099]">
              {user.username}（{userDisplayName(user.username)}）
            </p>
          </div>
          <button type="button" onClick={onClose}>
            <X className="h-7 w-7 text-[#b7bbc3]" />
          </button>
        </div>

        <div className="space-y-6 px-8 py-8">
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
            onToggleOpen={() => setOpenSelect(openSelect === 'qa' ? null : 'qa')}
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

        <div className="flex h-[80px] items-center justify-end gap-3 border-t border-[#eceef2] px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#dfe3ea] px-6 py-3 text-lg font-bold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onSave(topicPermissions, qaPermissions)}
            disabled={saving}
            className="rounded-xl bg-[#111] px-6 py-3 text-lg font-bold text-white disabled:opacity-50"
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
        <label className="text-xl font-bold">{label}</label>
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
            <span className="text-lg text-[#a0a6af]">请选择</span>
          )}
        </div>
        <span className="ml-4 text-xl text-[#8a9099]">⌄</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 z-20 mt-2 rounded-xl border border-[#dfe3ea] bg-white p-2 shadow-lg">
          {options.map(option => (
            <label
              key={option.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-lg hover:bg-[#f7f7f8]"
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
  onQuestionChange: (question: Omit<ExampleQuestion, 'id' | 'updateTime'>) => void
  onClose: () => void
  onSave: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[3px]">
      <div className="w-[840px] overflow-hidden rounded-[18px] bg-white shadow-2xl">
        <div className="flex h-[92px] items-center justify-between border-b border-[#eceef2] px-8">
          <h2 className="text-2xl font-bold">新增示例问题</h2>
          <button type="button" onClick={onClose}>
            <X className="h-7 w-7 text-[#b7bbc3]" />
          </button>
        </div>

        <div className="flex h-[60px] items-end gap-8 border-b border-[#eceef2] px-8">
          <button
            type="button"
            onClick={() => onTabChange('manual')}
            className={
              tab === 'manual'
                ? 'h-full border-b-3 border-[#111] px-1 pt-4 text-xl font-bold'
                : 'h-full px-1 pt-4 text-xl text-[#8a9099]'
            }
          >
            手动录入
          </button>
          <button
            type="button"
            onClick={() => onTabChange('batch')}
            className={
              tab === 'batch'
                ? 'h-full border-b-3 border-[#111] px-1 pt-4 text-xl font-bold'
                : 'h-full px-1 pt-4 text-xl text-[#8a9099]'
            }
          >
            批量上传
          </button>
        </div>

        <div className="px-8 py-8">
          {tab === 'manual' ? (
            <div>
              <label className="text-lg">所属主题</label>
              <select
                value={question.topic}
                onChange={event =>
                  onQuestionChange({ ...question, topic: event.target.value as TopicKey })
                }
                className="mt-2 h-[50px] w-full rounded-xl border border-[#dfe3ea] px-5 text-xl"
              >
                <option value="grid">网格</option>
                <option value="population">人流</option>
                <option value="traffic">车流</option>
              </select>

              <div className="mt-5 rounded-[16px] border border-[#e1e3e8] px-5 py-5">
                <div className="mb-4 text-lg font-bold text-[#a0a6af]">第 1 条</div>
                <label className="text-lg">用户不标准提问 <span className="text-[#ff3b30]">*</span></label>
                <input
                  value={question.question}
                  onChange={event => onQuestionChange({ ...question, question: event.target.value })}
                  placeholder="例：今天人流咋样？"
                  className="mt-2 h-[50px] w-full rounded-xl border border-[#dfe3ea] px-5 text-lg"
                />
                <label className="mt-5 block text-lg">映射标准问题 <span className="text-[#a0a6af]">（选填）</span></label>
                <input
                  value={question.description}
                  onChange={event => onQuestionChange({ ...question, description: event.target.value })}
                  placeholder="例：今日人流进出统计是多少？"
                  className="mt-2 h-[50px] w-full rounded-xl border border-[#dfe3ea] px-5 text-lg"
                />
                <label className="mt-5 block text-lg">期望回答内容 <span className="text-[#a0a6af]">（选填）</span></label>
                <textarea
                  placeholder="输入希望系统回复的内容..."
                  className="mt-2 h-[84px] w-full rounded-xl border border-[#dfe3ea] px-5 py-3 text-lg"
                />
              </div>
              <button className="mt-4 h-[42px] w-full rounded-lg border border-[#dfe3ea] text-lg">
                + 再加一条
              </button>
            </div>
          ) : (
            <div>
              <div className="rounded-[14px] bg-[#f7f7f8] px-6 py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xl font-bold">下载导入模板</div>
                    <div className="mt-1 text-lg text-[#8a9099]">
                      模板包含：用户不标准提问 / 映射标准问题 / 期望回答内容
                    </div>
                  </div>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-[#dfe3ea] bg-white px-4 py-2 text-lg">
                    <Download className="h-5 w-5" />
                    下载模板
                  </button>
                </div>
              </div>
              <label className="mt-7 flex h-[210px] cursor-pointer flex-col items-center justify-center rounded-[16px] border-2 border-dashed border-[#d8dadd] text-center text-xl text-[#555]">
                <input type="file" className="hidden" accept=".xlsx,.csv" />
                <FileText className="mb-4 h-8 w-8 text-[#d8c8e8]" />
                拖拽文件至此处 或 点击选择
                <span className="mt-2 text-base text-[#b3b7bf]">.xlsx / .csv · 最大 10MB</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex h-[80px] items-center justify-end gap-3 border-t border-[#eceef2] px-8">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[#dfe3ea] px-6 py-3 text-lg font-bold"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-xl bg-[#111] px-6 py-3 text-lg font-bold text-white disabled:opacity-50"
          >
            {tab === 'manual' ? '保存' : '开始导入'}
          </button>
        </div>
      </div>
    </div>
  )
}
