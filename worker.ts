// Custom worker entry — re-uses the OpenNext-generated fetch handler and adds
// Cron Triggers (replacing the old Netlify scheduled functions + Vercel crons).
// Local structural types keep @cloudflare/workers-types out of the global
// scope (it would override lib.dom Response.json() with `unknown` project-wide).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js'

interface ScheduledEvent {
  cron: string
  scheduledTime: number
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

interface Env {
  WORKER_SELF_REFERENCE: { fetch: typeof fetch }
  CLEANUP_SECRET?: string
}

const worker = {
  fetch: handler.fetch,

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const path = event.cron === '0 9 * * *' ? '/api/ping' : '/api/cleanup'
    ctx.waitUntil(
      env.WORKER_SELF_REFERENCE.fetch(`https://worker${path}`, {
        headers:
          path === '/api/cleanup' && env.CLEANUP_SECRET
            ? { Authorization: `Bearer ${env.CLEANUP_SECRET}` }
            : {},
      }).then(async (res) => {
        console.log(`[cron ${event.cron}] ${path} → ${res.status} ${await res.text()}`)
      }),
    )
  },
}

export default worker
