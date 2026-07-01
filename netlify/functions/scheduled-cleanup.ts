import type { Config, Context } from '@netlify/functions'

/**
 * Netlify Scheduled Function — triggers /api/cleanup daily (same schedule as Vercel cron).
 * Uses CLEANUP_SECRET; the Next.js route handles the actual DB cleanup.
 */
export default async (_req: Request, context: Context) => {
  const siteUrl = context.site?.url
  const secret = process.env.CLEANUP_SECRET

  if (!siteUrl) {
    console.error('[scheduled-cleanup] context.site.url missing')
    return new Response(JSON.stringify({ error: 'Site URL unavailable' }), { status: 500 })
  }
  if (!secret) {
    console.error('[scheduled-cleanup] CLEANUP_SECRET not set')
    return new Response(JSON.stringify({ error: 'CLEANUP_SECRET not configured' }), { status: 500 })
  }

  const res = await fetch(`${siteUrl}/api/cleanup`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${secret}` },
  })
  const body = await res.text()
  console.log(`[scheduled-cleanup] ${res.status} ${body}`)
  return new Response(body, { status: res.status })
}

export const config: Config = {
  schedule: '0 3 * * *',
}
