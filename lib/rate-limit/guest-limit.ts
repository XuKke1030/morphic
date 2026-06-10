import { Redis } from '@upstash/redis'

const DEFAULT_GUEST_DAILY_LIMIT = 10

// Module-level singleton Redis client
let redisInstance: Redis | null = null

function getRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null
  }
  if (!redisInstance) {
    redisInstance = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN
    })
  }
  return redisInstance
}

/**
 * Atomic increment with TTL using a Lua script.
 * Prevents the race condition where a process crashes between incr and expire,
 * leaving a key with no TTL that never expires.
 */
const INCR_WITH_EXPIRE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

function getGuestDailyLimit(): number {
  const raw = process.env.GUEST_CHAT_DAILY_LIMIT
  const parsed = raw ? Number(raw) : DEFAULT_GUEST_DAILY_LIMIT
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_GUEST_DAILY_LIMIT
  }
  return Math.floor(parsed)
}

function getSecondsUntilMidnight(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

function getNextMidnightTimestamp(): number {
  const now = new Date()
  const midnight = new Date(now)
  midnight.setUTCHours(24, 0, 0, 0)
  return midnight.getTime()
}

async function checkGuestLimit(ip: string): Promise<{
  allowed: boolean
  remaining: number
  resetAt: number
  limit: number
}> {
  if (process.env.MORPHIC_CLOUD_DEPLOYMENT !== 'true') {
    return { allowed: true, remaining: Infinity, resetAt: 0, limit: 0 }
  }

  const redis = getRedis()
  if (!redis) {
    return { allowed: true, remaining: Infinity, resetAt: 0, limit: 0 }
  }

  try {
    const dateKey = new Date().toISOString().split('T')[0]
    const key = `rl:guest:chat:${ip}:${dateKey}`
    const secondsUntilMidnight = getSecondsUntilMidnight()

    const count = await Promise.race([
      redis.eval(INCR_WITH_EXPIRE_SCRIPT, [key], [String(secondsUntilMidnight)]) as Promise<number>,
      new Promise<number>((_, reject) =>
        setTimeout(() => reject(new Error('Redis timeout')), 3000)
      )
    ])

    const limit = getGuestDailyLimit()
    const remaining = Math.max(0, limit - count)
    const resetAt = getNextMidnightTimestamp()

    return {
      allowed: count <= limit,
      remaining,
      resetAt,
      limit
    }
  } catch (error) {
    console.error('Guest rate limit check failed:', error)
    return { allowed: true, remaining: Infinity, resetAt: 0, limit: 0 }
  }
}

export async function checkAndEnforceGuestLimit(
  ip: string | null
): Promise<Response | null> {
  if (!ip) return null

  const result = await checkGuestLimit(ip)
  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Please sign in to continue.',
        remaining: 0,
        resetAt: result.resetAt,
        limit: result.limit
      }),
      {
        status: 401,
        statusText: 'Unauthorized',
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(result.resetAt)
        }
      }
    )
  }

  return null
}
