import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

import { type Model } from '@/lib/types/models'

// Function to generate a UUID
export function generateUUID(): string {
  // Generate UUIDv4
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes a URL by replacing spaces with '%20' and validating the scheme.
 * Only http and https schemes are allowed; others return an empty string.
 * @param url - The URL to sanitize
 * @returns The sanitized URL, or empty string if scheme is invalid
 */
export function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return ''
    }
  } catch {
    return ''
  }
  return url.replace(/\s+/g, '%20')
}

/**
 * Checks if a URL is safe to fetch server-side (SSRF protection).
 * Blocks private/internal IP ranges and non-HTTP schemes.
 */
const PRIVATE_IP_RANGES = [
  /^127\./, // Loopback IPv4
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  /^169\.254\./, // Link-local / AWS metadata
  /^0\./, // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 (CGN)
  /^198\.1[8-9]\./, // 198.18.0.0/15 (benchmark)
]

export function isUrlSafeToFetch(urlStr: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    return false
  }

  // Only allow http and https schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false
  }

  const hostname = parsed.hostname.toLowerCase()

  // Block IPv6 loopback and private ranges
  if (hostname === '[::1]' || hostname.startsWith('[fc') || hostname.startsWith('[fd') || hostname.startsWith('[fe80')) {
    return false
  }

  // Block bare hostnames that resolve to loopback
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return false
  }

  // Block IPv4 private ranges
  for (const range of PRIVATE_IP_RANGES) {
    if (range.test(hostname)) {
      return false
    }
  }

  return true
}

export function createModelId(model: Model): string {
  return `${model.providerId}:${model.id}`
}

export function getDefaultModelId(models: Model[]): string {
  if (!models.length) {
    throw new Error('No models available')
  }
  return createModelId(models[0])
}
