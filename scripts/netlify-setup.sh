#!/usr/bin/env bash
# Netlify setup after `npm run netlify:login`
set -euo pipefail
cd "$(dirname "$0")/.."

npx netlify status || { echo "Run: npm run netlify:login"; exit 1; }

if [[ ! -f .netlify/state.json ]]; then
  echo "Creating site quizknight..."
  npx netlify sites:create --name quizknight
  npx netlify link --name quizknight
fi

set_env() {
  local key="$1"
  local val="$2"
  [[ -z "$val" ]] && return
  echo "env set: $key"
  printf '%s' "$val" | npx netlify env:set "$key"
}

# shellcheck disable=SC1091
source <(grep -v '^#' .env.local | grep -v '^$' | sed 's/^/export /')

set_env NEXT_PUBLIC_SUPABASE_URL "${NEXT_PUBLIC_SUPABASE_URL:-}"
set_env NEXT_PUBLIC_SUPABASE_ANON_KEY "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}"
set_env SUPABASE_SERVICE_ROLE_KEY "${SUPABASE_SERVICE_ROLE_KEY:-}"
set_env CLEANUP_SECRET "${CLEANUP_SECRET:-}"
set_env ADMIN_PASSWORD "${ADMIN_PASSWORD:-}"
set_env CRON_SECRET "${CRON_SECRET:-}"

echo "Deploying..."
npx netlify deploy --prod --build
npx netlify status
