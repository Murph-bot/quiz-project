import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig({
  // No ISR data in this app — all game pages are dynamic. Skip R2 cache
  // setup; add `r2IncrementalCache` + the NEXT_INC_CACHE_R2_BUCKET binding
  // if ISR is ever introduced.
})
