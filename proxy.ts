import { type NextRequest, NextResponse } from 'next/server'

import { updateSession } from '@/lib/supabase/middleware'

// ==================== 路径定义 ====================

// 普通用户受保护路径（需要 chatdb_token）
const chatdbProtectedPaths = ['/ask', '/qa']
// 管理员受保护路径（需要 chatdb_admin_token，cookie path=/admin）
const adminPaths = ['/admin']
// 所有由 ChatDB 管理认证的路径（包括首页登录页）
// 这些路径跳过 Supabase 的 updateSession，避免被重定向到 /auth/login 导致白屏
const chatdbAuthPaths = ['/', ...chatdbProtectedPaths, ...adminPaths]

// ==================== 代理主函数 ====================

/**
 * Next.js 16 的请求代理入口（替代旧版 middleware.ts）
 * 每个匹配 matcher 的请求在到达页面前都会经过此函数
 *
 * 两层职责：
 * 1. 认证分流：ChatDB 路径 vs Supabase 路径，互不干扰
 * 2. 状态注入：设置 chatdb_auth_status cookie 供客户端快速读取
 */
export async function proxy(request: NextRequest) {
  // ---------- 反向代理头处理 ----------
  // 从 Nginx/CDN 传入的转发头中还原原始协议和主机名
  const protocol =
    request.headers.get('x-forwarded-proto') || request.nextUrl.protocol
  const host =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  // 构造 baseUrl，确保协议格式正确（http:// 或 https://）
  const baseUrl = `${protocol}${protocol.endsWith(':') ? '//' : '://'}${host}`

  // ---------- 认证分流 ----------
  const pathname = request.nextUrl.pathname

  const isChatdbPath = chatdbAuthPaths.some(
    p => pathname === p || pathname.startsWith(p + '/')
  )

  let response: NextResponse
  if (isChatdbPath) {
    // ChatDB 路径：直接放行，不调 Supabase updateSession
    // 原因：Supabase 未配置时，updateSession 发现没有 Supabase 用户
    //       会把 /ask、/qa、/admin 重定向到 /auth/login（不存在）→ 白屏
    response = NextResponse.next({ request })
  } else {
    // 非 ChatDB 路径（如 /search）：走 Supabase 认证流程
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (supabaseUrl && supabaseAnonKey) {
      response = await updateSession(request)
    } else {
      response = NextResponse.next({ request })
    }
  }

  // ---------- 注入反向代理头 ----------
  // 把原始请求信息写入响应头，供下游 Server Component 或 API 读取
  response.headers.set('x-url', request.url)
  response.headers.set('x-host', host)
  response.headers.set('x-protocol', protocol)
  response.headers.set('x-base-url', baseUrl)

  // ---------- 认证状态 cookie ----------
  // 静态资源和 API 路由不需要设置认证 cookie
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return response
  }

  // 读取 httpOnly 的 token cookie（客户端 JS 无法读取这些 cookie）
  const userToken = request.cookies.get('chatdb_token')?.value
  const adminToken = request.cookies.get('chatdb_admin_token')?.value

  // 根据路径和 token 存在情况，判断当前认证状态
  let authStatus = 'none'
  if (adminPaths.some(p => pathname.startsWith(p)) && adminToken) {
    // 访问 /admin 且有 admin token → admin
    authStatus = 'admin'
  } else if (
    chatdbProtectedPaths.some(
      p => pathname === p || pathname.startsWith(p + '/')
    ) &&
    userToken
  ) {
    // 访问 /ask、/qa 且有 user token → user
    authStatus = 'user'
  }

  // 写入非 httpOnly cookie，供客户端 AuthContext 立即读取，避免首次渲染闪烁
  // 值为 'none' | 'user' | 'admin'
  response.cookies.set('chatdb_auth_status', authStatus, {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7
  })

  return response
}

// ==================== 路由匹配规则 ====================
// 匹配所有请求路径，排除：
// - _next/static（静态资源）
// - _next/image（图片优化）
// - favicon.ico
// - 图片文件（svg, png, jpg 等）
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
}
