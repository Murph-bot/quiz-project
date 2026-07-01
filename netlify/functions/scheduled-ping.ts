import type { Config, Context } from '@netlify/functions'

/**
 * Netlify Scheduled Function — pings /api/ping daily (same schedule as Vercel cron).
 * Keeps serverless warm and verifies DB connectivity.
 */
export default async (_req: Request, context: Context) => {
  const siteUrl = context.site?.url
  if (!siteUrl) {
    console.error('[scheduled-ping] context.site.url missing')
    return new Response(JSON.stringify({ error: 'Site URL unavailable' }), { status: 500 })
  }

  const res = await fetch(`${siteUrl}/api/ping`)
  const body = await res.text()
  console.log(`[scheduled-ping] ${res.status} ${body}`)
  return new Response(body, { status: res.status })
}

export const config: Config = {
  schedule: '0 9 * * *',
}
