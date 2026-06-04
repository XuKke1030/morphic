'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { LogOut, UserRound } from 'lucide-react'

import { useChatDbAuth } from '@/lib/contexts/chatdb-auth-context'
import { useVisualViewport } from '@/hooks/use-visual-viewport'

type Topic = {
  code?: string
  label: string
  name?: string
  value: string
  permission?: number
  enabled?: boolean
}

type AlertItem = {
  id: number
  topic: string
  content: string
  question?: string
  title?: string
  displayTimeText?: string
}

type BootstrapData = {
  welcomeMessage?: string
  welcomeSubtext?: string
  authenticated?: boolean
}

type ExampleQuestion = {
  id: number
  topic: string
  question: string
}

const visibleTopicOrder = ['grid', 'population', 'traffic']

function topicCode(topic: Topic) {
  return topic.code || topic.value
}

function topicLabel(topic: Topic) {
  return topic.name || topic.label
}

export function QuestionPlatformHome() {
  const { username, logout: authLogout } = useChatDbAuth()
  const { height: vvHeight } = useVisualViewport()
  const [topics, setTopics] = useState<Topic[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loadingTopics, setLoadingTopics] = useState(true)
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [userName, setUserName] = useState('用户')
  const [profileOpen, setProfileOpen] = useState(false)
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null)
  const [exampleQuestions, setExampleQuestions] = useState<ExampleQuestion[]>(
    []
  )
  const profileRef = useRef<HTMLDivElement>(null)
  const topicQuery = topics.map(topic => topicCode(topic)).join(',')

  useEffect(() => {
    if (username) setUserName(username)
  }, [username])

  useEffect(() => {
    let active = true
    fetch('/api/chatdb/user/bootstrap', {
      cache: 'no-store',
      credentials: 'include'
    })
      .then(r => r.json())
      .then(json => {
        if (active && json?.data) setBootstrap(json.data)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    fetch('/api/chatdb/example-questions', {
      cache: 'no-store',
      credentials: 'include'
    })
      .then(r => r.json())
      .then(json => {
        const list = json?.data?.list || json?.list || []
        if (active && Array.isArray(list)) setExampleQuestions(list.slice(0, 6))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) {
        setProfileOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    let active = true

    async function loadTopics() {
      try {
        const response = await fetch('/api/chatdb/topics', {
          cache: 'no-store',
          credentials: 'include'
        })
        if (!response.ok) throw new Error('load topics failed')
        const payload = await response.json()
        const list = payload?.data?.list || payload?.list || []
        if (active && Array.isArray(list)) {
          setTopics(
            list
              .filter((topic: Topic) => {
                const code = topicCode(topic)
                return (
                  topic.enabled !== false && visibleTopicOrder.includes(code)
                )
              })
              .sort(
                (a: Topic, b: Topic) =>
                  visibleTopicOrder.indexOf(topicCode(a)) -
                  visibleTopicOrder.indexOf(topicCode(b))
              )
          )
        }
      } catch {
        if (active) setTopics([])
      } finally {
        if (active) setLoadingTopics(false)
      }
    }

    loadTopics()
    const timer = window.setInterval(loadTopics, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadAlerts() {
      if (!topicQuery) {
        if (active) {
          setAlerts([])
          setLoadingAlerts(false)
        }
        return
      }
      try {
        const response = await fetch(
          `/api/chatdb/alerts?topics=${encodeURIComponent(topicQuery)}`,
          { cache: 'no-store', credentials: 'include' }
        )
        if (!response.ok) throw new Error('load alerts failed')
        const payload = await response.json()
        const list = payload?.data?.list || payload?.list || []
        if (active && Array.isArray(list)) {
          setAlerts(list)
        }
      } catch {
        if (active) setAlerts([])
      } finally {
        if (active) setLoadingAlerts(false)
      }
    }

    loadAlerts()
    const timer = window.setInterval(loadAlerts, 5000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [topicQuery])

  const dismissAlert = async (alertId: number) => {
    setAlerts(items => items.filter(item => item.id !== alertId))
    await fetch(`/api/chatdb/alerts/${alertId}/dismiss`, {
      method: 'POST',
      credentials: 'include'
    }).catch(() => undefined)
  }

  const logout = async () => {
    await authLogout('user')
  }

  return (
    <div
      className="h-dvh w-full overflow-y-auto bg-[#f7f7f7] text-[#111827]"
      style={{ height: vvHeight ? `${vvHeight}px` : '100dvh' }}
    >
      <div className="mx-auto min-h-full max-w-[560px] bg-white">
        <header className="flex h-auto min-h-[56px] items-center justify-between border-b border-[#eeeeee] px-5 py-3">
          <h1 className="text-xl font-bold tracking-normal">问答问数平台</h1>
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => setProfileOpen(open => !open)}
              className="flex items-center gap-4 rounded-[13px] px-2 py-2 text-[18px] text-[#555] transition hover:bg-[#f7f7f7]"
              aria-label="个人中心"
            >
              <span>{userName}</span>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f2f0f5]">
                <UserRound className="h-6 w-6 fill-[#4b266f] text-[#4b266f]" />
              </span>
            </button>

            {profileOpen ? (
              <div className="absolute right-0 top-[62px] z-20 w-[260px] rounded-[13px] border border-[#e5e7eb] bg-white p-4 text-left shadow-lg">
                <div className="border-b border-[#eeeeee] pb-3">
                  <div className="text-sm text-[#8b8f99]">个人中心</div>
                  <div className="mt-1 text-lg font-semibold text-[#111827]">
                    {userName}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#fecaca] text-sm font-medium text-[#dc2626]"
                >
                  <LogOut className="h-4 w-4" />
                  退出登录
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <main className="px-5 pt-6">
          <section>
            <h2 className="text-2xl font-extrabold leading-tight tracking-normal">
              {bootstrap?.welcomeMessage || `您好，${userName}`}
            </h2>
            <p className="mt-3 text-base text-[#8b8f99]">
              {bootstrap?.welcomeSubtext || '请选择业务主题'}
            </p>

            <div
              className="mt-6 grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(Math.min(topics.length, 3), 1)}, minmax(0, 1fr))`
              }}
            >
              {topics.map(topic => (
                <Link
                  key={topic.value}
                  href={`/ask?topic=${topicCode(topic)}`}
                  className="flex h-14 items-center justify-center rounded-xl border border-[#e8e8e8] bg-white text-base font-semibold shadow-sm transition hover:border-[#b8b8b8] hover:bg-[#fafafa]"
                >
                  {topicLabel(topic)}
                </Link>
              ))}
            </div>

            {!loadingTopics && topics.length === 0 ? (
              <div className="mt-5 rounded-[13px] border border-[#eeeeee] bg-[#fafafa] px-5 py-6 text-[16px] text-[#8b8f99]">
                当前账号暂无可访问的问数主题
              </div>
            ) : null}

            {/* 智能问答入口暂时隐藏
            <Link
              href="/qa"
              className="mt-5 flex h-[78px] items-center justify-center rounded-[13px] bg-[#484848] text-[24px] font-bold text-white transition hover:bg-[#333333]"
            >
              智能问答
            </Link>
            */}

            {exampleQuestions.length > 0 ? (
              <div className="mt-5">
                <h3 className="text-[16px] font-medium text-[#9aa0aa]">
                  试试这样问
                </h3>
                <div className="mt-2 space-y-1.5">
                  {exampleQuestions.map(eq => {
                    const topic = topics.find(t => topicCode(t) === eq.topic)
                    const href =
                      eq.topic === 'qa'
                        ? `/ask?topic=grid&q=${encodeURIComponent(eq.question)}`
                        : `/ask?topic=${eq.topic || ''}&q=${encodeURIComponent(eq.question)}`
                    return (
                      <Link
                        key={eq.id}
                        href={href}
                        className="block rounded-xl border border-[#eeeeee] bg-[#fafafa] px-4 py-3 text-[15px] text-[#374151] transition hover:border-[#cbd5e1] hover:bg-white"
                      >
                        {eq.question}
                      </Link>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </section>

          <section className="mt-8 pb-8">
            <h3 className="text-[16px] font-normal text-[#9aa0aa]">实时告警</h3>

            <div className="mt-5 space-y-4">
              {alerts.map(alert => (
                <Link
                  key={alert.id}
                  href={`/ask?topic=${alert.topic}&alertId=${alert.id}&autoAsk=1&q=${encodeURIComponent(alert.question || alert.content)}`}
                  className="group flex min-h-[98px] items-center rounded-[13px] border border-[#ffcfc5] bg-[#fff8f6] px-7 text-left"
                >
                  <span className="mr-4 h-[55px] w-1 rounded-full bg-[#ff784f]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] text-[#ff5f3d]">
                      {alert.displayTimeText || '刚刚'}
                    </span>
                    <span className="mt-2 block truncate text-[18px] text-[#333]">
                      {alert.title || alert.content}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="关闭告警"
                    className="mr-5 text-[22px] leading-none text-[#ff8b72]"
                    onClick={event => {
                      event.preventDefault()
                      dismissAlert(alert.id)
                    }}
                  >
                    ×
                  </button>
                  <span className="text-[24px] text-[#ff8b72] transition group-hover:translate-x-1">
                    ›
                  </span>
                </Link>
              ))}

              {!loadingAlerts && alerts.length === 0 ? (
                <div className="rounded-[13px] border border-[#eeeeee] bg-[#fafafa] px-5 py-6 text-[16px] text-[#8b8f99]">
                  暂无异常
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
