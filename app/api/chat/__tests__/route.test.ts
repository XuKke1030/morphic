import { beforeEach,describe, expect, it, type Mock, vi } from 'vitest'

vi.mock('next/cache', () => ({
  revalidateTag: vi.fn()
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() =>
    Promise.resolve({
      get: vi.fn()
    })
  )
}))

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUserId: vi.fn()
}))

vi.mock('@/lib/actions/chat', () => ({
  loadChat: vi.fn()
}))

vi.mock('@/lib/analytics', () => ({
  calculateConversationTurn: vi.fn(() => 1),
  trackChatEvent: vi.fn()
}))

vi.mock('@/lib/rate-limit/chat-limits', () => ({
  checkAndEnforceOverallChatLimit: vi.fn()
}))

vi.mock('@/lib/rate-limit/guest-limit', () => ({
  checkAndEnforceGuestLimit: vi.fn()
}))

vi.mock('@/lib/streaming/create-chat-stream-response', () => ({
  createChatStreamResponse: vi.fn()
}))

vi.mock('@/lib/streaming/create-ephemeral-chat-stream-response', () => ({
  createEphemeralChatStreamResponse: vi.fn()
}))

vi.mock('@/lib/utils/model-selection', () => ({
  selectModel: vi.fn()
}))

vi.mock('@/lib/utils/registry', () => ({
  isProviderEnabled: vi.fn(() => true)
}))

import { getCurrentUserId } from '@/lib/auth/get-current-user'
import { checkAndEnforceOverallChatLimit } from '@/lib/rate-limit/chat-limits'
import { checkAndEnforceGuestLimit } from '@/lib/rate-limit/guest-limit'
import { selectModel } from '@/lib/utils/model-selection'

import { POST } from '../route'

const mockUserId = getCurrentUserId as Mock<typeof getCurrentUserId>
const mockOverallLimit = checkAndEnforceOverallChatLimit as Mock
const mockGuestLimit = checkAndEnforceGuestLimit as Mock
const mockSelectModel = selectModel as Mock

function makeRequest(overrides: Record<string, unknown> = {}) {
  const headers = new Headers()
  headers.set('referer', 'http://localhost:3000/chat')

  return new Request('http://localhost:3000/api/chat', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      message: 'Hello',
      messages: [],
      chatId: 'test-chat-id',
      trigger: 'submit-message',
      messageId: 'msg-1',
      isNewChat: true,
      ...overrides
    })
  })
}

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ENABLE_GUEST_CHAT = 'false'
    process.env.MORPHIC_CLOUD_DEPLOYMENT = 'true'
    process.env.UPSTASH_REDIS_REST_URL = 'https://example.com'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token'
    delete process.env.ENABLE_AUTH
    delete process.env.ANONYMOUS_USER_ID
  })

  it('returns 401 when user is not authenticated and guest chat is disabled', async () => {
    mockUserId.mockResolvedValue(undefined)

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })

  it('returns 403 on share pages', async () => {
    mockUserId.mockResolvedValue('user-1')
    mockOverallLimit.mockResolvedValue(null)
    mockSelectModel.mockResolvedValue({ id: 'model-1', providerId: 'openai' })

    const headers = new Headers()
    headers.set('referer', 'http://localhost:3000/share/abc123')

    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Hello',
        messages: [],
        chatId: 'test-chat-id',
        trigger: 'submit-message'
      })
    })

    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('extracts IP from last x-forwarded-for entry for guest rate limiting', async () => {
    mockUserId.mockResolvedValue(undefined)
    process.env.ENABLE_GUEST_CHAT = 'true'
    mockGuestLimit.mockResolvedValue(null)
    mockSelectModel.mockResolvedValue({ id: 'model-1', providerId: 'openai' })

    const headers = new Headers()
    headers.set('x-forwarded-for', '1.2.3.4, 5.6.7.8')
    headers.set('referer', 'http://localhost:3000/chat')

    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Hello',
        messages: [],
        chatId: 'guest-chat',
        trigger: 'submit-message'
      })
    })

    await POST(req)
    expect(mockGuestLimit).toHaveBeenCalledWith('5.6.7.8')
  })

  it('rejects invalid IP format in x-forwarded-for', async () => {
    mockUserId.mockResolvedValue(undefined)
    process.env.ENABLE_GUEST_CHAT = 'true'

    const headers = new Headers()
    headers.set('x-forwarded-for', '<script>alert(1)</script>')
    headers.set('referer', 'http://localhost:3000/chat')

    const req = new Request('http://localhost:3000/api/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: 'Hello',
        messages: [],
        chatId: 'guest-chat',
        trigger: 'submit-message'
      })
    })

    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is missing for submit-message trigger', async () => {
    mockUserId.mockResolvedValue('user-1')

    const res = await POST(
      makeRequest({ trigger: 'submit-message', message: null })
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 when messageId is missing for regenerate-message trigger', async () => {
    mockUserId.mockResolvedValue('user-1')

    const res = await POST(
      makeRequest({ trigger: 'regenerate-message', messageId: null })
    )
    expect(res.status).toBe(400)
  })

  it('returns 503 when no model is available', async () => {
    mockUserId.mockResolvedValue('user-1')
    mockOverallLimit.mockResolvedValue(null)
    mockSelectModel.mockResolvedValue(null)

    const res = await POST(makeRequest())
    expect(res.status).toBe(503)
  })

  it('passes rate limit check for authenticated users', async () => {
    mockUserId.mockResolvedValue('user-1')
    mockOverallLimit.mockResolvedValue(null)
    mockSelectModel.mockResolvedValue({ id: 'model-1', providerId: 'openai' })

    const { createChatStreamResponse } = await import(
      '@/lib/streaming/create-chat-stream-response'
    )
    ;(createChatStreamResponse as Mock).mockResolvedValue(
      new Response('ok')
    )

    const res = await POST(makeRequest())
    expect(mockOverallLimit).toHaveBeenCalledWith('user-1')
    expect(res.status).not.toBe(429)
  })
})
