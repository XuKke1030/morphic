'use client'

import { FormEvent, ReactNode, useState } from 'react'

import { LockKeyhole, ShieldCheck } from 'lucide-react'

import { useChatDbAuth } from '@/lib/contexts/chatdb-auth-context'

type LoginMode = 'user' | 'admin'

type Props = {
  mode: LoginMode
  children: ReactNode
}

const modeConfig = {
  user: {
    title: '问答问数平台',
    subtitle: '请登录后使用网格、人流、车流与智能问答',
    button: '登录平台'
  },
  admin: {
    title: '问数管理后台',
    subtitle: '管理员登录后可维护权限、问题与数据接入',
    button: '进入后台'
  }
} satisfies Record<LoginMode, Record<string, string>>

export function ChatDbLoginGate({ mode, children }: Props) {
  const config = modeConfig[mode]
  const {
    initialLoading,
    userAuthenticated,
    adminAuthenticated,
    login,
    error: contextError
  } = useChatDbAuth()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  const authenticated =
    mode === 'admin' ? adminAuthenticated : userAuthenticated
  const error = localError || contextError

  if (initialLoading) {
    return null
  }

  if (authenticated) {
    return <>{children}</>
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLocalError('')
    setSubmitting(true)
    try {
      await login(mode, username, password)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f4f6f8] px-5 py-8 text-[#111827]">
      <div className="w-full max-w-[420px] rounded-lg border border-[#dfe3ea] bg-white p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#102033] text-white">
            {mode === 'admin' ? (
              <ShieldCheck className="h-5 w-5" />
            ) : (
              <LockKeyhole className="h-5 w-5" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{config.title}</h1>
            <p className="mt-1 text-sm text-[#64748b]">{config.subtitle}</p>
          </div>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="text-sm font-medium text-[#374151]">账号</span>
            <input
              value={username}
              onChange={event => setUsername(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-[#d1d5db] px-3 text-base outline-none focus:border-[#102033]"
              autoComplete="username"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[#374151]">密码</span>
            <input
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-[#d1d5db] px-3 text-base outline-none focus:border-[#102033]"
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-[#fecaca] bg-[#fff5f5] px-3 py-2 text-sm text-[#b91c1c]">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="h-11 w-full rounded-lg bg-[#102033] text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '登录中...' : config.button}
          </button>
        </form>
      </div>
    </div>
  )
}
