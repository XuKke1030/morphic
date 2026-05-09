import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import { afterEach, describe, expect, test, vi } from 'vitest'

import type { UIMessage } from '@/lib/types/ai'

import { RenderMessage } from '../render-message'

function render(ui: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  let root: Root | null = null

  act(() => {
    root = createRoot(container)
    root.render(ui)
  })

  return {
    container,
    unmount: () => {
      act(() => {
        root?.unmount()
      })
      container.remove()
    }
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

const screen = {
  getAllByTestId: (id: string) =>
    Array.from(document.querySelectorAll(`[data-testid="${id}"]`)),
  getByTestId: (id: string) => {
    const element = document.querySelector(`[data-testid="${id}"]`)
    if (!element) throw new Error(`Unable to find element by test id: ${id}`)
    return element
  }
}

vi.mock('../answer-section', () => ({
  AnswerSection: ({ content }: { content: string }) => (
    <div data-testid="answer-section">{content}</div>
  )
}))

vi.mock('../research-process-section', () => ({
  __esModule: true,
  default: ({ parts }: { parts: Array<{ type: string }> }) => (
    <div data-testid="research-process">
      {parts.map(part => part.type).join(',')}
    </div>
  )
}))

vi.mock('../dynamic-tool-display', () => ({
  DynamicToolDisplay: () => <div data-testid="dynamic-tool" />
}))

vi.mock('../user-file-section', () => ({
  UserFileSection: () => <div data-testid="user-file" />
}))

vi.mock('../user-text-section', () => ({
  UserTextSection: () => <div data-testid="user-text" />
}))

describe('RenderMessage', () => {
  test('ignores empty text parts so research process is not split early', () => {
    const message: UIMessage = {
      id: 'assistant-msg',
      role: 'assistant',
      parts: [
        { type: 'reasoning', text: 'First reasoning' } as any,
        {
          type: 'tool-search',
          toolCallId: 'tool-1',
          state: 'output-available',
          input: {},
          output: {}
        } as any,
        { type: 'text', text: '' } as any,
        { type: 'reasoning', text: 'Second reasoning' } as any,
        { type: 'text', text: 'Final answer' } as any
      ]
    } as UIMessage

    const { container } = render(
      <RenderMessage
        message={message}
        messageId={message.id}
        getIsOpen={() => true}
        onOpenChange={() => {}}
      />
    )

    const processSections = screen.getAllByTestId('research-process')
    expect(processSections).toHaveLength(1)
    expect(processSections[0]).toHaveTextContent(
      'reasoning,tool-search,reasoning'
    )

    const answerSections = screen.getAllByTestId('answer-section')
    expect(answerSections).toHaveLength(1)
    expect(answerSections[0]).toHaveTextContent('Final answer')

    const order = Array.from(
      container.querySelectorAll(
        '[data-testid="research-process"], [data-testid="answer-section"]'
      )
    ).map(node => (node as Element).getAttribute('data-testid'))
    expect(order).toEqual(['research-process', 'answer-section'])
  })
})
