'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

import { LogOut, UserRound } from 'lucide-react'

type Topic = {
  label: string
  value: string
  permission?: number
  enabled?: boolean
}

type AlertItem = {
  id: number
  topic: string
  content: string
  question?: string
  displayTimeText?: string
}

export function QuestionPlatformHome() {
  const [topics, setTopics] = useState<Topic[]>([])
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [loadingTopics, setLoadingTopics] = useState(true)
  const [loadingAlerts, setLoadingAlerts] = useState(true)
  const [userName, setUserName] = useState('用户')
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    queueMicrotask(() => {
      const storedName = window.localStorage.getItem('chatdb_user_name')
      if (storedName) {
        setUserName(storedName)
      }
    })
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
        const response = await fetch('/api/chatdb/topics', { cache: 'no-store' })
        if (!response.ok) throw new Error('load topics failed')
        const payload = await response.json()
        const list = payload?.data?.list || payload?.list || []
        if (active && Array.isArray(list)) {
          setTopics(list.filter((topic: Topic) => topic.enabled !== false))
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
      try {
        const response = await fetch('/api/chatdb/alerts', { cache: 'no-store' })
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
  }, [])

  const dismissAlert = async (alertId: number) => {
    setAlerts(items => items.filter(item => item.id !== alertId))
    await fetch(`/api/chatdb/alerts/${alertId}/dismiss`, {
      method: 'POST'
    }).catch(() => undefined)
  }

  const logout = async () => {
    await fetch('/api/chatdb/logout', { method: 'POST' }).catch(() => undefined)
    window.localStorage.removeItem('chatdb_user_login')
    window.localStorage.removeItem('chatdb_user_name')
    window.location.reload()
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[#f7f7f7] text-[#111827]">
      <div className="mx-auto min-h-full max-w-[560px] bg-white">
        <header className="flex h-[90px] items-center justify-between border-b border-[#eeeeee] px-8">
          <h1 className="text-[28px] font-bold tracking-normal">
            问答问数平台
          </h1>
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

        <main className="px-8 pt-12">
          <section>
            <h2 className="text-[38px] font-extrabold leading-tight tracking-normal">
              您好，今天想了解什么？
            </h2>
            <p className="mt-5 text-[20px] text-[#8b8f99]">请选择业务主题</p>

            <div
              className="mt-12 grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${Math.max(Math.min(topics.length, 3), 1)}, minmax(0, 1fr))`
              }}
            >
              {topics.map(topic => (
                <Link
                  key={topic.value}
                  href={`/ask?topic=${topic.value}`}
                  className="flex h-[74px] items-center justify-center rounded-[13px] border border-[#e8e8e8] bg-white text-[22px] font-semibold shadow-[0_1px_8px_rgba(0,0,0,0.02)] transition hover:border-[#b8b8b8] hover:bg-[#fafafa]"
                >
                  {topic.label}
                </Link>
              ))}
            </div>

            {!loadingTopics && topics.length === 0 ? (
              <div className="mt-5 rounded-[13px] border border-[#eeeeee] bg-[#fafafa] px-5 py-6 text-[16px] text-[#8b8f99]">
                当前账号暂无可访问的问数主题
              </div>
            ) : null}

            <Link
              href="/qa"
              className="mt-5 flex h-[78px] items-center justify-center rounded-[13px] bg-[#484848] text-[24px] font-bold text-white transition hover:bg-[#333333]"
            >
              智能问答
            </Link>
          </section>

          <section className="mt-16">
            <h3 className="text-[20px] font-normal text-[#9aa0aa]">
              实时告警
            </h3>

            <div className="mt-5 space-y-4">
              {alerts.map(alert => (
                <Link
                  key={alert.id}
                  href={`/ask?topic=${alert.topic}&q=${encodeURIComponent(alert.question || alert.content)}`}
                  className="group flex min-h-[98px] items-center rounded-[13px] border border-[#ffcfc5] bg-[#fff8f6] px-7 text-left"
                >
                  <span className="mr-4 h-[55px] w-1 rounded-full bg-[#ff784f]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[17px] text-[#ff5f3d]">
                      {alert.displayTimeText || '刚刚'}
                    </span>
                    <span className="mt-2 block truncate text-[18px] text-[#333]">
                      {alert.content}
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
                  暂无实时告警
                </div>
              ) : null}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
