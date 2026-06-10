import { describe, expect, it, type Mock,vi } from 'vitest'

vi.mock('@/lib/actions/chat', () => ({
  loadChat: vi.fn()
}))

vi.mock('@/lib/agents/researcher', () => ({
  researcher: vi.fn()
}))

vi.mock('@/lib/agents/title-generator', () => ({
  generateChatTitle: vi.fn().mockResolvedValue('Test Title')
}))

vi.mock('@/lib/utils/context-window', () => ({
  getMaxAllowedTokens: vi.fn(() => 128000),
  shouldTruncateMessages: vi.fn(() => false),
  truncateMessages: vi.fn()
}))

vi.mock('@/lib/utils/telemetry', () => ({
  isTracingEnabled: vi.fn(() => false)
}))

vi.mock('@/lib/utils/message-utils', () => ({
  getTextFromParts: vi.fn(() => 'test content')
}))

vi.mock('@/lib/utils/perf-logging', () => ({
  perfLog: vi.fn(),
  perfTime: vi.fn()
}))

vi.mock('@/lib/streaming/helpers/persist-stream-results', () => ({
  persistStreamResults: vi.fn()
}))

vi.mock('@/lib/streaming/helpers/prepare-messages', () => ({
  prepareMessages: vi.fn()
}))

vi.mock('@/lib/streaming/helpers/strip-reasoning-parts', () => ({
  stripReasoningParts: vi.fn(m => m)
}))

vi.mock('@/lib/streaming/helpers/strip-spec-from-messages', () => ({
  stripSpecFromMessages: vi.fn(m => m)
}))

vi.mock('ai', () => ({
  consumeStream: vi.fn(),
  convertToModelMessages: vi.fn(m => Promise.resolve(m)),
  pruneMessages: vi.fn(({ messages }) => messages),
  smoothStream: vi.fn(() => () => {})
}))

vi.mock('langfuse', () => ({
  Langfuse: vi.fn()
}))

import { loadChat } from '@/lib/actions/chat'
import { researcher } from '@/lib/agents/researcher'
import { prepareMessages } from '@/lib/streaming/helpers/prepare-messages'

import { createChatStreamResponse } from '../create-chat-stream-response'
import type { BaseStreamConfig } from '../types'

const mockLoadChat = loadChat as Mock
const mockResearcher = researcher as Mock
const mockPrepareMessages = prepareMessages as Mock

const baseConfig = {
  message: { id: 'msg-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Hello' }] },
  model: { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', providerId: 'openai' },
  chatId: 'chat-123',
  userId: 'user-1',
  trigger: 'submit-message' as const,
  messageId: 'msg-1',
  abortSignal: new AbortController().signal,
  isNewChat: true,
  searchMode: 'quick' as const
} as unknown as BaseStreamConfig

describe('createChatStreamResponse', () => {
  it('returns 400 when chatId is missing', async () => {
    const response = await createChatStreamResponse({
      ...baseConfig,
      chatId: ''
    })

    expect(response.status).toBe(400)
    const text = await response.text()
    expect(text).toBe('Chat ID is required')
  })

  it('returns 403 when existing chat belongs to another user', async () => {
    mockLoadChat.mockResolvedValue({
      id: 'chat-123',
      userId: 'different-user'
    })

    const response = await createChatStreamResponse({
      ...baseConfig,
      isNewChat: false
    })

    expect(response.status).toBe(403)
    const text = await response.text()
    expect(text).toBe('You are not allowed to access this chat')
  })

  it('loads chat history for existing chats', async () => {
    mockLoadChat.mockResolvedValue({
      id: 'chat-123',
      userId: 'user-1',
      messages: []
    })
    mockPrepareMessages.mockResolvedValue([])
    mockResearcher.mockReturnValue({
      stream: vi.fn().mockResolvedValue({
        consumeStream: vi.fn(),
        toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('ok'))
      })
    })

    await createChatStreamResponse({
      ...baseConfig,
      isNewChat: false
    })

    expect(mockLoadChat).toHaveBeenCalledWith('chat-123', 'user-1')
  })

  it('skips direct chat loading for new chats', async () => {
    mockPrepareMessages.mockResolvedValue([])
    mockResearcher.mockReturnValue({
      stream: vi.fn().mockResolvedValue({
        consumeStream: vi.fn(),
        toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('ok'))
      })
    })

    const response = await createChatStreamResponse({
      ...baseConfig,
      isNewChat: true
    })

    expect(response.status).toBe(200)
  })
})
