import { dynamicTool } from 'ai'
import { z } from 'zod'

import type { MCPClient } from '@/lib/types/dynamic-tools'

// Maximum depth for nested objects in tool input
const MAX_INPUT_DEPTH = 5
// Maximum number of keys at any nesting level
const MAX_KEYS_PER_LEVEL = 20
// Maximum string value length
const MAX_STRING_LENGTH = 10000

/**
 * Recursively validates that a value has acceptable structure
 * for dynamic tool input. Blocks functions, symbols, and
 * overly deep/nested structures.
 */
function sanitizeDynamicInput(input: unknown, depth = 0): unknown {
  if (depth > MAX_INPUT_DEPTH) {
    throw new Error(`Dynamic tool input exceeds maximum nesting depth of ${MAX_INPUT_DEPTH}`)
  }

  if (input === null || input === undefined) {
    return input
  }

  if (typeof input === 'string') {
    if (input.length > MAX_STRING_LENGTH) {
      throw new Error(`String value exceeds maximum length of ${MAX_STRING_LENGTH}`)
    }
    return input
  }

  if (typeof input === 'number' || typeof input === 'boolean') {
    return input
  }

  if (typeof input === 'function' || typeof input === 'symbol') {
    throw new Error('Functions and symbols are not allowed in dynamic tool input')
  }

  if (Array.isArray(input)) {
    if (input.length > MAX_KEYS_PER_LEVEL) {
      throw new Error(`Array exceeds maximum length of ${MAX_KEYS_PER_LEVEL}`)
    }
    return input.map(item => sanitizeDynamicInput(item, depth + 1))
  }

  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>)
    if (entries.length > MAX_KEYS_PER_LEVEL) {
      throw new Error(`Object exceeds maximum key count of ${MAX_KEYS_PER_LEVEL}`)
    }
    const result: Record<string, unknown> = {}
    for (const [key, value] of entries) {
      if (typeof key !== 'string' || key.length > 256) {
        throw new Error('Object keys must be strings with length <= 256')
      }
      // Block prototype pollution keys
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue
      }
      result[key] = sanitizeDynamicInput(value, depth + 1)
    }
    return result
  }

  throw new Error(`Unsupported value type in dynamic tool input: ${typeof input}`)
}

const dynamicInputSchema = z.unknown().transform((val, ctx) => {
  try {
    return sanitizeDynamicInput(val)
  } catch (e) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: e instanceof Error ? e.message : 'Invalid dynamic tool input'
    })
    return z.NEVER
  }
})

/**
 * Creates a dynamic tool that can be used for runtime-defined tools
 * such as MCP tools or user-defined functions
 */
export function createDynamicTool(
  name: string,
  description: string,
  execute: (input: unknown) => Promise<unknown>
) {
  return dynamicTool({
    description,
    inputSchema: dynamicInputSchema,
    execute: async input => {
      try {
        const result = await execute(input)
        return result
      } catch (error) {
        console.error(`Error executing dynamic tool ${name}:`, error)
        throw error
      }
    }
  })
}

/**
 * Create an MCP tool wrapper
 */
export function createMCPTool(
  toolName: string,
  description: string,
  mcpClient: MCPClient
) {
  return createDynamicTool(`mcp__${toolName}`, description, async input => {
    return await mcpClient.callTool(toolName, input)
  })
}

/**
 * Create a custom user-defined tool
 */
export function createCustomTool(
  name: string,
  description: string,
  handler: (params: unknown) => Promise<unknown>
) {
  return createDynamicTool(`dynamic__${name}`, description, handler)
}
