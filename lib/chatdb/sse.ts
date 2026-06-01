/**
 * Shared SSE stream reader for ChatDB backend.
 *
 * Parses both `data:` and `event:` SSE fields per the SSE specification.
 * Heartbeat `event: ping` frames are acknowledged to keep the connection
 * alive during long AI responses.
 *
 * Includes an inactivity timeout (default 30s): if no data is received for
 * the specified duration, the stream is aborted to prevent indefinite hangs.
 *
 * Usage:
 *   readSSEStream(response.body, frame => {
 *     if (frame.event === 'message') { ... }
 *   })
 */

export type SSEFrame = {
  event?: string
  content?: string
  role?: string
  data?: Record<string, unknown>
  fastPath?: boolean
  format?: Record<string, unknown>
  [key: string]: unknown
}

const DEFAULT_INACTIVITY_TIMEOUT_MS = 30_000

export async function readSSEStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: SSEFrame) => void,
  onError?: (error: Error) => void,
  options?: { inactivityTimeoutMs?: number }
) {
  const timeoutMs = options?.inactivityTimeoutMs ?? DEFAULT_INACTIVITY_TIMEOUT_MS
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent: string | undefined

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  function resetTimeout() {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      reader.cancel(new Error(`SSE stream timed out: no data for ${timeoutMs}ms`))
    }, timeoutMs)
  }

  function clearTimeout_() {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
  }

  resetTimeout()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      resetTimeout()

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) {
          // Empty line = end of SSE event, reset currentEvent
          currentEvent = undefined
          continue
        }
        if (trimmed.startsWith('event:')) {
          currentEvent = trimmed.slice(6).trim()
          // Acknowledge heartbeat to keep connection alive
          if (currentEvent === 'ping') {
            resetTimeout()
            onFrame({ event: 'ping' })
          }
          continue
        }
        if (!trimmed.startsWith('data:')) continue
        const raw = trimmed.slice(5).trim()
        if (!raw || raw === '[DONE]') break

        let frame: SSEFrame
        try {
          frame = JSON.parse(raw) as SSEFrame
        } catch {
          frame = { event: 'message', content: raw }
        }

        // If an event: line preceded this data: line and the JSON
        // payload doesn't already carry an event field, use the
        // SSE-level event type (e.g. "ping" is already handled above).
        if (currentEvent && !frame.event) {
          frame.event = currentEvent
        }

        onFrame(frame)
      }
    }
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (onError) {
      onError(err)
    } else {
      throw err
    }
  } finally {
    clearTimeout_()
    reader.releaseLock()
  }
}
