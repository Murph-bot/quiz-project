'use client'

import { useEffect } from 'react'

/** Keep the screen awake while `active` and the tab is visible. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let disposed = false

    async function request() {
      try {
        const s = await navigator.wakeLock.request('screen')
        if (disposed) {
          void s.release().catch(() => {})
        } else {
          sentinel = s
        }
      } catch {
        // Denied or unsupported — harmless.
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void request()
    }

    void request()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
