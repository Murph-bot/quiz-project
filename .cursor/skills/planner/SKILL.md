---
name: planner
description: >-
  Plan before implementing multi-file features, refactors, or ambiguous work.
  Use when the user asks to plan, design an approach, or before large changes.
  Waits for user confirmation before coding.
---
# Planner Workflow (Cursor)

Adapted for Cursor — no slash commands required.

## When to activate

- New feature spanning multiple files
- Architectural or schema changes
- Refactors with risk
- Unclear requirements

## Process

1. **Restate requirements** in plain language
2. **Explore codebase** — Grep, Glob, SemanticSearch, read key files
3. **Identify risks** — breaking changes, migrations, realtime edge cases
4. **Break into phases** — small, testable steps with file paths
5. **Present plan** — numbered list, complexity estimate
6. **Wait for approval** — do not write code until user confirms

## Output format

```markdown
## Plan: [title]

### Requirements
- ...

### Phases
1. ...
2. ...

### Risks
- ...

### Test plan
- ...

Ready to implement?
```

## Delegate

For very large exploration, use Task `subagent_type="planner"` or `"architect"` with full context.

## QuizKnight-specific

- Game logic changes need Jest tests
- Realtime flows: close → reveal → next — trace both API and GameScreen
- Supabase migrations for schema changes

See also: `agents/planner.md` for full subagent prompt.
