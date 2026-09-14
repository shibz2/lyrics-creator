import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DEFAULT_MODEL = 'openrouter/free'
const SITE_URL = 'https://lyrics.shibz.uk'
const SITE_TITLE = 'Lyrics Creator Auto'
const FREE_MAX_PRICE = { prompt: 0, completion: 0, request: 0 }

type Body = {
  prompt?: unknown
  model?: unknown
  apiKey?: unknown
}

function shibZIsFreeOpenRouterModel(id: string) {
  return id === 'openrouter/free' || id.endsWith(':free')
}

function shibZRequireFreeModel(raw: string) {
  const model = raw.trim()
  if (shibZIsFreeOpenRouterModel(model)) return model
  return DEFAULT_MODEL
}

function shibZErrorMessage(data: unknown, status: number) {
  if (data && typeof data === 'object') {
    const err = (data as { error?: unknown }).error
    if (typeof err === 'string' && err.trim()) return err
    if (err && typeof err === 'object') {
      const message = (err as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  }
  return `OpenRouter request failed (${status})`
}

function shibZMessageText(content: unknown) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
          return (part as { text: string }).text
        }
        return ''
      })
      .join('')
  }
  return ''
}

async function shibZCallOpenRouter(apiKey: string, model: string, prompt: string) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': SITE_URL,
      'X-OpenRouter-Title': SITE_TITLE,
      'X-Title': SITE_TITLE,
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      max_tokens: 2048,
      provider: { max_price: FREE_MAX_PRICE },
      messages: [
        {
          role: 'system',
          content:
            'You are a lyricist. Follow the user prompt exactly. Output only the lyrics, one line per phrase, with every syllable separated by |. No commentary.',
        },
        { role: 'user', content: prompt },
      ],
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(shibZErrorMessage(data, res.status))
  }
  const text = shibZMessageText(data?.choices?.[0]?.message?.content)
  if (!text.trim()) {
    throw new Error('The model returned empty lyrics.')
  }
  const usedModel = typeof data?.model === 'string' && data.model.trim() ? data.model.trim() : model
  return { lyrics: text.trim(), model: usedModel }
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

  const requested =
    typeof body.model === 'string' && body.model.trim() ? body.model.trim() : DEFAULT_MODEL
  if (!shibZIsFreeOpenRouterModel(requested)) {
    return NextResponse.json(
      {
        error:
          'Only OpenRouter free models are allowed. Use openrouter/free or a model id ending in :free.',
      },
      { status: 400 }
    )
  }
  const model = shibZRequireFreeModel(requested)

  const userKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const apiKey = userKey || process.env.OPENROUTER_API_KEY || ''
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'No API key. Add an OpenRouter key in Settings, or set OPENROUTER_API_KEY for the server.',
      },
      { status: 400 }
    )
  }

  try {
    const result = await shibZCallOpenRouter(apiKey, model, prompt)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
