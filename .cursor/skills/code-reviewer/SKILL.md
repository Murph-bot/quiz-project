---
name: code-reviewer
description: >-
  Review code changes for bugs, security, and maintainability. Use proactively
  after writing or modifying non-trivial code.
---
# Code Review Workflow (Cursor)

## When to activate

- After implementing a feature or fix
- Before commit/PR when user asks for review
- When user says "review my changes"

## Process

1. `git diff` — staged and unstaged
2. Read full files around changes, not just the diff
3. Apply checklist below
4. Report only issues >80% confident — no noise

## Checklist (priority order)

### Security (critical)
- Hardcoded secrets
- SQL injection (use parameterized queries)
- XSS (escape user content)
- Missing auth on API routes
- Service role key in client code

### Correctness
- Off-by-one, race conditions (especially realtime)
- Error handling — no silent failures
- Edge cases: empty lists, null, timer expiry

### Maintainability
- Matches project conventions
- Functions <50 lines, files <800 lines
- No unnecessary abstraction

## Output format

```markdown
### [CRITICAL|HIGH|MEDIUM|LOW] Title
file:line — description
Suggested fix: ...
```

## Delegate

Task `subagent_type="code-reviewer"` with diff context for thorough reviews.

See `agents/code-reviewer.md` for full subagent prompt.
