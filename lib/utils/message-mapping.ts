import { generateId } from '@/lib/db/schema'
import type { UIMessage, UIMessageMetadata } from '@/lib/types/ai'
import type { DynamicToolPart } from '@/lib/types/dynamic-tools'
import type {
  DBMessagePart,
  DBMessagePartSelect,
  ToolState
} from '@/lib/types/message-persistence'

// Define local types for message parts that are compatible with the AI SDK
type TextUIPart = { type: 'text'; text: string; providerMetadata?: unknown }
type ReasoningUIPart = {
  type: 'reasoning'
  text: string
  providerMetadata?: unknown
}
type FileUIPart = {
  type: 'file'
  mediaType: string
  filename?: string
  url: string
}
type SourceUrlUIPart = {
  type: 'source-url'
  sourceId: string
  url: string
  title: string
}
type SourceDocumentUIPart = {
  type: 'source-document'
  sourceId: string
  mediaType: string
  title: string
  filename: string
  url: string
  snippet: string
}
type ToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  args: unknown
}
type ToolResultPart = {
  type: 'tool-result'
  toolCallId: string
  result: unknown
  isError?: boolean
}
type DataPart = { type: string; data?: unknown; id?: string }

type UIMessagePart =
  | TextUIPart
  | ReasoningUIPart
  | FileUIPart
  | SourceUrlUIPart
  | SourceDocumentUIPart
  | ToolCallPart
  | ToolResultPart
  | DataPart

// Type guards
function isToolCallPart(part: unknown): part is ToolCallPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    part.type === 'tool-call' &&
    typeof (part as ToolCallPart).toolCallId === 'string' &&
    typeof (part as ToolCallPart).toolName === 'string' &&
    'args' in part
  )
}

// Type for tool-specific parts with extended properties
type ExtendedToolPart = {
  type: string
  toolCallId?: string
  state?: ToolState
  errorText?: string
  input?: unknown
  output?: unknown
}

function isExtendedToolPart(part: unknown): part is ExtendedToolPart {
  return (
    typeof part === 'object' &&
    part !== null &&
    'type' in part &&
    typeof (part.type) === 'string' &&
    part.type.startsWith('tool-')
  )
}

// Helper function to create tool part mapping
function createToolPartMapping(
  basePart: Omit<DBMessagePart, 'type'>,
  part: ExtendedToolPart,
  toolName: string
): DBMessagePart {
  const inputColumn = `tool_${toolName}_input` as keyof DBMessagePart
  const outputColumn = `tool_${toolName}_output` as keyof DBMessagePart

  return {
    ...basePart,
    type: part.type,
    tool_toolCallId: part.toolCallId || generateId(),
    tool_state: part.state || ('input-available' as ToolState),
    tool_errorText: part.errorText,
    [inputColumn]: part.input,
    [outputColumn]: part.output
  } as DBMessagePart
}

// Tool names that use the standard 4-state pattern in the DB
const STANDARD_TOOL_NAMES = ['search', 'fetch', 'question', 'todoWrite', 'todoRead'] as const

type StandardToolUIPart = {
  type: `tool-${string}`
  toolCallId: string
  input: unknown
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error'
  output?: unknown
  errorText?: string
}

/**
 * Build a tool UI part from DB data using the standard 4-state pattern.
 */
function buildStandardToolPart(
  toolName: string,
  part: DBMessagePartSelect
): StandardToolUIPart {
  const inputColumn = `tool_${toolName}_input` as keyof DBMessagePartSelect
  const outputColumn = `tool_${toolName}_output` as keyof DBMessagePartSelect

  if (!part.tool_state) {
    throw new Error(`tool_state is undefined for ${toolName}`)
  }

  const base = {
    type: `tool-${toolName}` as const,
    toolCallId: part.tool_toolCallId || '',
    input: part[inputColumn]
  }

  switch (part.tool_state) {
    case 'input-streaming':
      return { ...base, state: 'input-streaming' }
    case 'input-available':
      return { ...base, state: 'input-available' }
    case 'output-available':
      return {
        ...base,
        state: 'output-available',
        output: part[outputColumn]
      }
    case 'output-error':
      return {
        ...base,
        state: 'output-error',
        errorText: part.tool_errorText || ''
      }
    default:
      throw new Error(`Unknown tool state: ${part.tool_state}`)
  }
}

/**
 * Convert UI message parts to DB format
 */
export function mapUIMessagePartsToDBParts(
  messageParts: UIMessagePart[],
  messageId: string
): DBMessagePart[] {
  const mappedParts = messageParts.map((part, index): DBMessagePart | null => {
    const basePart = {
      messageId,
      order: index,
      type: part.type
    }

    switch (part.type) {
      case 'text': {
        const { text } = part as TextUIPart
        return {
          ...basePart,
          text_text: text
        }
      }

      case 'reasoning': {
        const { text, providerMetadata } = part as ReasoningUIPart
        return {
          ...basePart,
          reasoning_text: text,
          providerMetadata: providerMetadata as Record<string, any> | null | undefined
        }
      }

      case 'file': {
        const { mediaType, filename, url } = part as FileUIPart
        return {
          ...basePart,
          file_mediaType: mediaType,
          file_filename: filename,
          file_url: url
        }
      }

      case 'source-url': {
        const { sourceId, url, title } = part as SourceUrlUIPart
        return {
          ...basePart,
          source_url_sourceId: sourceId,
          source_url_url: url,
          source_url_title: title
        }
      }

      case 'source-document': {
        const p = part as SourceDocumentUIPart
        return {
          ...basePart,
          source_document_sourceId: p.sourceId,
          source_document_mediaType: p.mediaType,
          source_document_title: p.title,
          source_document_filename: p.filename,
          source_document_url: p.url,
          source_document_snippet: p.snippet
        }
      }

      // Tool parts
      case 'tool-call': {
        if (!isToolCallPart(part)) {
          console.error('Invalid tool-call part:', part)
          return null
        }
        const toolName = getToolNameFromType(part.toolName)
        const toolInputColumn = `tool_${toolName}_input` as keyof DBMessagePart

        const result = {
          ...basePart,
          type: `tool-${toolName}`,
          tool_toolCallId: part.toolCallId,
          tool_state: 'input-available' as ToolState,
          [toolInputColumn]: part.args
        } as DBMessagePart

        // Store additional metadata for dynamic tools
        if (toolName === 'dynamic') {
          result.tool_dynamic_name = part.toolName
          result.tool_dynamic_type = part.toolName.startsWith('mcp__')
            ? 'mcp'
            : 'dynamic'
        }

        return result
      }

      case 'tool-result': {
        const toolResultPart = part as ToolResultPart
        const resultToolName = getToolNameFromCallId(
          toolResultPart.toolCallId,
          messageParts
        )
        const toolOutputColumn =
          `tool_${resultToolName}_output` as keyof DBMessagePart

        const toolResult = {
          ...basePart,
          type: `tool-${resultToolName}`,
          tool_toolCallId: toolResultPart.toolCallId,
          tool_state: toolResultPart.isError
            ? 'output-error'
            : ('output-available' as ToolState),
          tool_errorText: toolResultPart.isError ? String(toolResultPart.result) : undefined,
          [toolOutputColumn]: !toolResultPart.isError ? toolResultPart.result : undefined
        } as DBMessagePart

        // Preserve dynamic tool metadata from the corresponding tool-call
        if (resultToolName === 'dynamic') {
          const toolCallPart = messageParts.find(
            p => isToolCallPart(p) && p.toolCallId === toolResultPart.toolCallId
          ) as ToolCallPart | undefined

          if (toolCallPart) {
            toolResult.tool_dynamic_name = toolCallPart.toolName
            toolResult.tool_dynamic_type = toolCallPart.toolName.startsWith(
              'mcp__'
            )
              ? 'mcp'
              : 'dynamic'
          }
        }

        return toolResult
      }

      // Step parts
      case 'step-start':
        return basePart as DBMessagePart

      case 'step-result':
      case 'step-continue':
      case 'step-finish':
        return null

      // Dynamic tool parts from AI SDK v5
      case 'dynamic-tool': {
        const dynamicPart = part as unknown as DynamicToolPart
        return {
          ...basePart,
          type: 'tool-dynamic',
          tool_toolCallId: dynamicPart.toolCallId || generateId(),
          tool_state: dynamicPart.state as ToolState,
          tool_dynamic_name: dynamicPart.toolName,
          tool_dynamic_type: dynamicPart.toolName.startsWith('mcp__')
            ? 'mcp'
            : 'dynamic',
          tool_dynamic_input: dynamicPart.input,
          tool_dynamic_output:
            dynamicPart.state === 'output-available'
              ? dynamicPart.output
              : undefined,
          tool_errorText:
            dynamicPart.state === 'output-error'
              ? dynamicPart.errorText
              : undefined
        }
      }

      // Tool-specific extended parts (tool-search, tool-fetch, etc.)
      default:
        if (isExtendedToolPart(part)) {
          const extToolName = part.type.startsWith('tool-')
            ? part.type.substring(5)
            : null
          if (extToolName && (STANDARD_TOOL_NAMES as readonly string[]).includes(extToolName)) {
            return createToolPartMapping(basePart, part, extToolName)
          }
        }

        // Data parts
        if (part.type.startsWith('data-')) {
          const dataPart = part as DataPart
          const dataType = part.type.substring(5)
          return {
            ...basePart,
            data_prefix: dataType,
            data_content: dataPart.data,
            data_id: dataPart.id
          }
        }

        // Unknown part type - store as data
        return {
          ...basePart,
          data_prefix: part.type,
          data_content: part as unknown
        }
    }
  })

  // Filter out null values and re-index
  return mappedParts
    .filter((part): part is DBMessagePart => part !== null)
    .map((part, index) => ({ ...part, order: index }))
}

/**
 * Convert DB message parts to UI format (data-driven)
 */
export function mapDBPartToUIMessagePart(
  part: DBMessagePartSelect
): UIMessagePart {
  switch (part.type) {
    case 'text':
      return {
        type: 'text',
        text: part.text_text || ''
      }

    case 'reasoning':
      return {
        type: 'reasoning',
        text: part.reasoning_text || '',
        providerMetadata: part.providerMetadata
      }

    case 'file':
      return {
        type: 'file',
        mediaType: part.file_mediaType || '',
        filename: part.file_filename || '',
        url: part.file_url || ''
      }

    case 'source-url':
      return {
        type: 'source-url',
        sourceId: part.source_url_sourceId || '',
        url: part.source_url_url || '',
        title: part.source_url_title || ''
      }

    case 'source-document':
      return {
        type: 'source-document',
        sourceId: part.source_document_sourceId || '',
        mediaType: part.source_document_mediaType || '',
        title: part.source_document_title || '',
        filename: part.source_document_filename || '',
        url: part.source_document_url || '',
        snippet: part.source_document_snippet || ''
      }

    default: {
      // Tool parts
      if (part.type.startsWith('tool-')) {
        const toolName = part.type.substring(5)

        // Special handling for dynamic tools
        if (toolName === 'dynamic') {
          return {
            type: 'dynamic-tool' as const,
            toolCallId: part.tool_toolCallId || '',
            toolName: part.tool_dynamic_name || '',
            state: part.tool_state as DynamicToolPart['state'],
            input: part.tool_dynamic_input,
            output: part.tool_dynamic_output,
            errorText: part.tool_errorText
          } as DynamicToolPart
        }

        // Data-driven handling for standard tool names
        if ((STANDARD_TOOL_NAMES as readonly string[]).includes(toolName)) {
          return buildStandardToolPart(toolName, part)
        }

        // Standard tool-call/tool-result pattern for other tools
        const inputColumn =
          `tool_${toolName}_input` as keyof DBMessagePartSelect
        const outputColumn =
          `tool_${toolName}_output` as keyof DBMessagePartSelect

        if (
          part.tool_state === 'input-available' ||
          part.tool_state === 'input-streaming'
        ) {
          const originalToolName =
            toolName === 'dynamic' && part.tool_dynamic_name
              ? part.tool_dynamic_name
              : getOriginalToolName(toolName)

          return {
            type: 'tool-call',
            toolCallId: part.tool_toolCallId || '',
            toolName: originalToolName,
            args: part[inputColumn]
          }
        } else {
          return {
            type: 'tool-result',
            toolCallId: part.tool_toolCallId || '',
            isError: part.tool_state === 'output-error',
            result:
              part.tool_state === 'output-error'
                ? part.tool_errorText
                : part[outputColumn]
          }
        }
      }

      // Step parts
      if (part.type === 'step-start') {
        return {
          type: 'step-start'
        }
      }

      // Data parts
      if (part.data_prefix) {
        return {
          type: `data-${part.data_prefix}`,
          data: part.data_content,
          ...(part.data_id ? { id: part.data_id } : {})
        }
      }

      throw new Error(`Unknown part type: ${part.type}`)
    }
  }
}

/**
 * Normalize tool name (from tool-call's toolName)
 */
function getToolNameFromType(toolName: string): string {
  const toolNameMap: Record<string, string> = {
    search: 'search',
    fetch: 'fetch',
    askQuestion: 'question',
    question: 'question',
    todoWrite: 'todoWrite',
    todoRead: 'todoRead'
  }

  if (toolName.startsWith('mcp__') || toolName.startsWith('dynamic__')) {
    return 'dynamic'
  }

  return toolNameMap[toolName] || toolName
}

/**
 * Get tool name from tool-result
 */
function getToolNameFromCallId(
  toolCallId: string,
  allParts: UIMessagePart[]
): string {
  const toolCallPart = allParts.find(
    part => part.type === 'tool-call' && (part as ToolCallPart).toolCallId === toolCallId
  ) as ToolCallPart | undefined

  if (toolCallPart) {
    return getToolNameFromType(toolCallPart.toolName)
  }

  return 'unknown'
}

/**
 * Convert DB column name back to original tool name
 */
function getOriginalToolName(dbToolName: string): string {
  const reverseMap: Record<string, string> = {
    search: 'search',
    fetch: 'fetch',
    question: 'askQuestion',
    todoWrite: 'todoWrite',
    todoRead: 'todoRead',
    dynamic: 'dynamic'
  }

  return reverseMap[dbToolName] || dbToolName
}

/**
 * Convert UI message to DB message (excluding parts)
 */
export function mapUIMessageToDBMessage(
  message: UIMessage & { id: string; chatId: string }
): {
  id: string
  chatId: string
  role: string
  metadata?: UIMessageMetadata | null
} {
  return {
    id: message.id,
    chatId: message.chatId,
    role: message.role,
    metadata: message.metadata || null
  }
}

/**
 * Build UI message from DB message and parts
 */
export function buildUIMessageFromDB(
  dbMessage: {
    id: string
    role: string
    metadata?: UIMessageMetadata | null
    createdAt?: Date | string
  },
  dbParts: DBMessagePartSelect[]
): UIMessage {
  const metadata: UIMessageMetadata = {
    ...(dbMessage.metadata || {}),
    ...(dbMessage.createdAt && {
      createdAt:
        dbMessage.createdAt instanceof Date
          ? dbMessage.createdAt
          : new Date(dbMessage.createdAt)
    })
  }

  return {
    id: dbMessage.id,
    role: dbMessage.role as 'user' | 'assistant',
    parts: dbParts.map(mapDBPartToUIMessagePart) as UIMessage['parts'],
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined
  }
}
