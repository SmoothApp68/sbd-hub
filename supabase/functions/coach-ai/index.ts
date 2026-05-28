// ============================================================
// coach-ai — Edge Function freemium IA coaching
// Stack : Gemini Flash (gratuit) + Supabase rate limiting
// Limites : 10 req/min global · 1200 req/jour global · 30s cooldown/user
// ============================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent'

const COOLDOWN_MS = 30_000        // 30s par user
const MAX_PER_MINUTE = 10         // plafond global /min
const MAX_PER_DAY = 1200          // plafond global /jour

const ALLOWED_ORIGINS = [
  'https://smoothapp68.github.io',
  'http://localhost:3000',
  'http://localhost:8000',
]

function corsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const cors = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: cors })
  }

  try {
    const { prompt, userId, plan, betaExpiresAt } = await req.json()
    if (!prompt || !userId) {
      return new Response(JSON.stringify({ error: 'Missing prompt or userId' }), { status: 400, headers: cors })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const now = new Date()
    const minuteKey = now.toISOString().slice(0, 16)  // "2026-05-22T14:35"
    const dayKey    = now.toISOString().slice(0, 10)  // "2026-05-22"

    // ── 1. Cooldown par user ─────────────────────────────────────
    const { data: userLimit } = await supabase
      .from('ai_rate_limits')
      .select('last_request_at, minute_key, minute_count, day_key, day_count')
      .eq('user_id', userId)
      .maybeSingle()

    const isBetaPermanent = plan === 'beta' && (betaExpiresAt === null || betaExpiresAt === undefined)

    if (userLimit?.last_request_at && !isBetaPermanent) {
      const msSinceLast = Date.now() - new Date(userLimit.last_request_at).getTime()
      if (msSinceLast < COOLDOWN_MS) {
        const waitSec = Math.ceil((COOLDOWN_MS - msSinceLast) / 1000)
        return new Response(JSON.stringify({
          error: 'cooldown',
          waitSeconds: waitSec,
          message: `Attends encore ${waitSec}s avant ta prochaine question.`
        }), { status: 429, headers: cors })
      }
    }

    // ── 2. Limites globales /minute et /jour ─────────────────────
    const { count: globalMinuteCount } = await supabase
      .from('ai_rate_limits')
      .select('user_id', { count: 'exact', head: true })
      .eq('minute_key', minuteKey)

    const { count: globalDayCount } = await supabase
      .from('ai_rate_limits')
      .select('user_id', { count: 'exact', head: true })
      .eq('day_key', dayKey)

    const currentMinuteCount = globalMinuteCount ?? 0
    const currentDayCount    = globalDayCount ?? 0

    if (currentMinuteCount >= MAX_PER_MINUTE) {
      const waitSec = 60 - now.getSeconds()
      return new Response(JSON.stringify({
        error: 'queue',
        waitSeconds: waitSec,
        message: `Coach occupé, réessaie dans ${waitSec}s.`
      }), { status: 429, headers: cors })
    }

    if (currentDayCount >= MAX_PER_DAY) {
      return new Response(JSON.stringify({
        error: 'daily_limit',
        message: 'Limite quotidienne atteinte. Le coach revient demain.'
      }), { status: 429, headers: cors })
    }

    // ── 3. Appel Gemini Flash ────────────────────────────────────
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: 'Gemini API key not configured' }), { status: 500, headers: cors })
    }

    const geminiResponse = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 150,  // 2-3 phrases max
          temperature: 0.7,
        }
      })
    })

    if (!geminiResponse.ok) {
      const errText = await geminiResponse.text().catch(() => '')
      return new Response(JSON.stringify({ error: `Gemini error: ${geminiResponse.status}`, details: errText }), {
        status: 502, headers: cors
      })
    }

    const geminiData = await geminiResponse.json()
    const answer = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    // ── 4. Update counters (upsert per user) ────────────────────
    const prevMinuteCount = userLimit && userLimit.minute_key === minuteKey
      ? (userLimit.minute_count ?? 0)
      : 0
    const prevDayCount = userLimit && userLimit.day_key === dayKey
      ? (userLimit.day_count ?? 0)
      : 0

    await supabase.from('ai_rate_limits').upsert({
      user_id: userId,
      last_request_at: now.toISOString(),
      minute_key: minuteKey,
      minute_count: prevMinuteCount + 1,
      day_key: dayKey,
      day_count: prevDayCount + 1,
      updated_at: now.toISOString()
    }, { onConflict: 'user_id' })

    return new Response(JSON.stringify({ answer }), { headers: cors })

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: cors
    })
  }
})
