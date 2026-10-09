---
description: Run the QuizKnight verification gate (lint, typecheck, unit tests, build)
allowed-tools: Bash(npm run lint), Bash(npx tsc --noEmit), Bash(npm test*), Bash(npx jest *), Bash(npm run build)
---
Run in order and stop at the first failure:

1. `npm run lint`
2. `npx tsc --noEmit`
3. `npm test` (if a Jest worker crashes, retry with `npx jest --runInBand`)
4. `npm run build`

Report pass/fail per step with failing output verbatim. The e2e suite is separate: use `/e2e`.
