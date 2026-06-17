'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'

// ==================== 类型定义 ====================

type ChatDbAuthMode = 'user' | 'admin'

/**
 * 全局认证状态，所有页面通过 useChatDbAuth() 读取
 *
 * 核心设计：
 * - 挂在 layout.tsx 的 <UserProvider> 内，路由切换时不会重新挂载
 * - 首次渲染读 cookie 设置初始状态（无闪烁），再异步校验 token 有效性
 * - login/logout 统一管理，ChatDbLoginGate 不再自己维护认证逻辑
 */
type ChatDbAuthState = {
  // 普通用户是否已认证
  userAuthenticated: boolean
  // 管理员是否已认证
  adminAuthenticated: boolean
  // 普通用户名（来自 localStorage + API 回填）
  username: string | null
  // 管理员用户名（来自 localStorage + API 回填）
  adminUsername: string | null
  // 首次加载中（读 cookie + 异步校验完成前为 true）
  initialLoading: boolean
  // 最近一次登录/校验错误信息
  error: string | null
  // 登录（调 BFF API，成功后更新状态 + 写 cookie/localStorage）
  login: (
    mode: ChatDbAuthMode,
    username: string,
    password: string
  ) => Promise<void>
  // 登出（调 BFF API，清除状态 + 清 cookie/localStorage）
  logout: (mode: ChatDbAuthMode) => Promise<void>
}

const ChatDbAuthContext = createContext<ChatDbAuthState | null>(null)

// ==================== Cookie 工具函数 ====================

/** 读取非 httpOnly cookie（httpOnly 的 token cookie 客户端读不到） */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : undefined
}

/** 删除 cookie（通过设置 max-age=0 使其过期） */
function deleteCookie(name: string, path = '/') {
  document.cookie = `${name}=; path=${path}; max-age=0`
}

// ==================== Provider 组件 ====================

export function ChatDbAuthProvider({
  children
}: {
  children: React.ReactNode
}) {
  const [userAuthenticated, setUserAuthenticated] = useState(false)
  const [adminAuthenticated, setAdminAuthenticated] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [adminUsername, setAdminUsername] = useState<string | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 上次成功校验的时间戳，用于控制定期校验频率
  const lastValidatedRef = useRef(0)
  // 定期校验的定时器引用
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---------- 异步校验 session ----------
  /**
   * 调 /api/chatdb/permissions 验证当前 token 是否有效
   *
   * 这是从旧版 ChatDbLoginGate 迁移过来的核心校验逻辑：
   * - 旧版：每个页面独立 useEffect + fetch，页面切换时重新挂载导致每次都要登录
   * - 新版：统一在 Context 中校验，状态跨页面共享，切换路由不丢失
   */
  const validateSession = useCallback(async (mode: ChatDbAuthMode) => {
    try {
      const validatePath =
        mode === 'admin'
          ? '/api/chatdb/admin/profile'
          : '/api/chatdb/permissions'
      const response = await fetch(validatePath, {
        cache: 'no-store',
        credentials: 'include'
      })
      const payload = await response.json().catch(() => null)
      const data = payload?.data || payload
      // admin/profile: returns { username, role } → check data.username
      // user/permissions: returns { permissions, qaPermissions } → check code === 0 and data exists
      const isValid =
        data?.authenticated ||
        data?.username ||
        (payload?.code === 0 &&
          data &&
          (data.permissions ||
            data.qaPermissions ||
            data.ruleLevel !== undefined))
      if (isValid) {
        if (mode === 'user') setUserAuthenticated(true)
        if (mode === 'admin') setAdminAuthenticated(true)
        if (data?.username) {
          if (mode === 'admin') setAdminUsername(data.username)
          else setUsername(data.username)
        }
        lastValidatedRef.current = Date.now()
      } else {
        if (mode === 'user') {
          setUserAuthenticated(false)
          deleteCookie('chatdb_auth_status')
        }
        if (mode === 'admin') {
          setAdminAuthenticated(false)
          deleteCookie('chatdb_auth_status')
        }
      }
    } catch {
      if (mode === 'user') setUserAuthenticated(false)
      if (mode === 'admin') setAdminAuthenticated(false)
    }
  }, [])

  // ---------- 初始化 + 定期校验 ----------
  useEffect(() => {
    // 用 queueMicrotask 避免阻塞首次渲染
    queueMicrotask(() => {
      // 1. 读取 proxy.ts 设置的非 httpOnly cookie，立即确定初始认证状态
      //    这样页面首次渲染就能正确显示登录表单或内容，无闪烁
      const authStatus = getCookie('chatdb_auth_status')

      // 2. 从 localStorage 恢复用户名（cookie 中不存用户名，避免体积膨胀）
      const storedUserName = window.localStorage.getItem('chatdb_user_name')
      const storedAdminName = window.localStorage.getItem('chatdb_admin_name')
      if (storedUserName) setUsername(storedUserName)
      if (storedAdminName) setAdminUsername(storedAdminName)

      // 3. 根据 cookie 状态决定是否需要异步校验
      if (authStatus === 'both') {
        setAdminAuthenticated(true)
        setUserAuthenticated(true)
        Promise.all([
          validateSession('admin'),
          validateSession('user')
        ]).finally(() => setInitialLoading(false))
      } else if (authStatus === 'admin') {
        setAdminAuthenticated(true)
        validateSession('admin').finally(() => setInitialLoading(false))
      } else if (authStatus === 'user') {
        setUserAuthenticated(true)
        const now = Date.now()
        if (now - lastValidatedRef.current > 5 * 60 * 1000) {
          validateSession('user').finally(() => setInitialLoading(false))
        } else {
          setInitialLoading(false)
        }
      } else {
        // 无认证状态，清理旧 localStorage 残留（兼容过渡期）
        window.localStorage.removeItem('chatdb_user_login')
        window.localStorage.removeItem('chatdb_user_name')
        window.localStorage.removeItem('chatdb_admin_login')
        window.localStorage.removeItem('chatdb_admin_name')
        setInitialLoading(false)
      }
    })

    // 4. 定期校验（每 2 分钟检查一次 cookie 状态）
    //    admin：每次都校验（安全要求高）
    //    user：距上次校验超过 10 分钟才校验（平衡性能）
    intervalRef.current = setInterval(
      () => {
        const authStatus = getCookie('chatdb_auth_status')
        if (authStatus === 'both') {
          validateSession('admin')
          validateSession('user')
        } else if (authStatus === 'admin') {
          validateSession('admin')
        } else if (authStatus === 'user') {
          const now = Date.now()
          if (now - lastValidatedRef.current > 10 * 60 * 1000) {
            validateSession('user')
          }
        } else {
          setUserAuthenticated(false)
          setAdminAuthenticated(false)
        }
      },
      2 * 60 * 1000
    )

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [validateSession])

  // ---------- 登录 ----------
  /**
   * 调 BFF 登录 API，成功后：
   * 1. 写 chatdb_auth_status cookie 供 proxy.ts 下次请求读取
   * 2. 更新 Context 认证状态，触发所有 ChatDbLoginGate 重新渲染
   * 3. 写 localStorage 保存用户名（刷新后仍可显示）
   * 4. admin 模式额外调 validateSession 确认 token 有效
   */
  const login = useCallback(
    async (mode: ChatDbAuthMode, user: string, pass: string) => {
      setError(null)
      const apiPath =
        mode === 'admin' ? '/api/chatdb/admin/login' : '/api/chatdb/login'
      try {
        const response = await fetch(apiPath, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username: user, password: pass })
        })
        const payload = await response.json().catch(() => null)
        if (!response.ok || payload?.code !== 0) {
          throw new Error(payload?.message || '登录失败，请检查账号和密码')
        }
        // 写非 httpOnly cookie，让客户端下次刷新时能立即读取状态
        // 组合格式：如果双方都已认证则为 "both"
        const currentAuthStatus = getCookie('chatdb_auth_status')
        let newAuthStatus: string = mode
        if (currentAuthStatus === 'user' && mode === 'admin') {
          newAuthStatus = 'both'
        } else if (currentAuthStatus === 'admin' && mode === 'user') {
          newAuthStatus = 'both'
        }
        document.cookie = `chatdb_auth_status=${newAuthStatus}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
        const name = payload?.data?.username || user
        if (mode === 'admin') {
          setAdminUsername(name)
          setAdminAuthenticated(true)
          window.localStorage.setItem('chatdb_admin_name', name)
          window.localStorage.removeItem('chatdb_admin_login')
          await validateSession('admin')
        } else {
          setUsername(name)
          setUserAuthenticated(true)
          window.localStorage.setItem('chatdb_user_name', name)
          window.localStorage.removeItem('chatdb_user_login')
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : '登录失败'
        setError(msg)
        throw err
      }
    },
    [validateSession]
  )

  // ---------- 登出 ----------
  /**
   * 调 BFF 登出 API（让后端也清除 httpOnly token cookie），
   * 同时清除前端状态 + localStorage 残留
   */
  const logout = useCallback(async (mode: ChatDbAuthMode) => {
    // 通知后端清除 httpOnly cookie（chatdb_token / chatdb_admin_token）
    await fetch('/api/chatdb/logout', {
      method: 'POST',
      credentials: 'include'
    }).catch(() => undefined)

    if (mode === 'user') {
      setUserAuthenticated(false)
      setUsername(null)
      window.localStorage.removeItem('chatdb_user_login')
      window.localStorage.removeItem('chatdb_user_name')
    } else {
      setAdminAuthenticated(false)
      setAdminUsername(null)
      window.localStorage.removeItem('chatdb_admin_login')
      window.localStorage.removeItem('chatdb_admin_name')
    }
    // 更新 cookie 为剩余认证状态
    const remainingUser = mode !== 'user' && userAuthenticated
    const remainingAdmin = mode !== 'admin' && adminAuthenticated
    if (remainingUser && remainingAdmin) {
      document.cookie = `chatdb_auth_status=both; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    } else if (remainingAdmin) {
      document.cookie = `chatdb_auth_status=admin; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    } else if (remainingUser) {
      document.cookie = `chatdb_auth_status=user; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    } else {
      deleteCookie('chatdb_auth_status')
    }
  }, [])

  return (
    <ChatDbAuthContext.Provider
      value={{
        userAuthenticated,
        adminAuthenticated,
        username,
        adminUsername,
        initialLoading,
        error,
        login,
        logout
      }}
    >
      {children}
    </ChatDbAuthContext.Provider>
  )
}

// ==================== Hook ====================

/** 在组件中读取全局认证状态，必须在 ChatDbAuthProvider 内使用 */
export function useChatDbAuth() {
  const ctx = useContext(ChatDbAuthContext)
  if (!ctx)
    throw new Error('useChatDbAuth must be used within ChatDbAuthProvider')
  return ctx
}
