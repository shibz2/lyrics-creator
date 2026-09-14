import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const HARD_DEFAULT_MODEL = 'gemini-3.5-flash-lite'
const SYSTEM_PROMPT =
  'You are a lyricist. Follow the user prompt exactly. Output ONLY the lyrics between <<<LYRICS and >>>. No titles, numbering, comments, or markdown.'

type Body = {
  prompt?: unknown
}

function shibZEnvModel() {
  const raw = typeof process.env.AI_SUB_MODEL === 'string' ? process.env.AI_SUB_MODEL.trim() : ''
  return shibZIsGeminiModel(raw) ? raw : ''
}

function shibZDefaultModel() {
  return shibZEnvModel() || HARD_DEFAULT_MODEL
}

function shibZIsGeminiModel(id: string) {
  return /^gemini-[a-z0-9.-]+$/i.test((id || '').trim())
}

function shibZGeminiText(data: unknown) {
  if (!data || typeof data !== 'object') return ''
  const candidates = (data as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates) || !candidates[0] || typeof candidates[0] !== 'object') return ''
  const content = (candidates[0] as { content?: { parts?: unknown } }).content
  const parts = content && Array.isArray(content.parts) ? content.parts : []
  return parts
    .map((part) => {
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text
      }
      return ''
    })
    .join('')
}

async function shibZCallGemini(apiKey: string, model: string, prompt: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2048,
        },
      }),
    }
  )
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error('Generation failed.')
  }
  const text = shibZGeminiText(data)
  if (!text.trim()) {
    throw new Error('Generation failed.')
  }
  return { lyrics: text.trim() }
}

export async function GET() {
  return NextResponse.json({
    ready: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
  })
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    return NextResponse.json({ error: 'Missing prompt. Process some taps first.' }, { status: 400 })
  }
  if (prompt.length > 20000) {
    return NextResponse.json({ error: 'Prompt is too long.' }, { status: 400 })
  }

  const model = shibZDefaultModel()
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
  if (!apiKey) {
    return NextResponse.json({ error: 'Lyrics generation is not configured.' }, { status: 400 })
  }

  try {
    const result = await shibZCallGemini(apiKey, model, prompt)
    return NextResponse.json({ lyrics: result.lyrics })
  } catch {
    return NextResponse.json({ error: 'Generation failed.' }, { status: 502 })
  }
}
