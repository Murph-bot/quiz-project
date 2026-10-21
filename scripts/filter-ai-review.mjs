#!/usr/bin/env node

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

/**
 * Drop AI review findings that do not cite a file in the pushed diff.
 *
 * The reviewer is given only the diff but regularly reports on files it was
 * never shown, so its findings point at untouched code and describe behaviour
 * the diff cannot have changed. Filtering is deterministic: a finding either
 * names a changed file or it does not.
 */

const FINDING_RE = /^\*\*\[?(Blocker|Should fix|Nit)\]?\*\*\s+`([^`]+)`\s*[-–]\s*(.*)$/

function parseFindings(text) {
  const findings = []
  let current = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd()
    const match = FINDING_RE.exec(line.trim())

    if (match) {
      if (current) findings.push(current)
      current = { severity: match[1], location: match[2], title: match[3], body: [] }
      continue
    }

    if (!current) continue

    if (/^---$/.test(line.trim())) {
      findings.push(current)
      current = null
      continue
    }

    current.body.push(line)
  }

  if (current) findings.push(current)
  return findings
}

/** `src/a.ts:12-18` and `src/a.ts:12` both name `src/a.ts`. */
function fileOf(location) {
  return location.replace(/:\d+(?:-\d+)?$/, '').replace(/^\.\//, '').trim()
}

function normalizeChanged(paths) {
  const set = new Set()
  for (const entry of paths) {
    const cleaned = entry.replace(/^\.\//, '').trim()
    if (cleaned) set.add(cleaned)
  }
  return set
}

function filterReview(text, changed) {
  if (!text.trim()) return ''
  if (/^LGTM\s*$/i.test(text.trim())) return 'LGTM'
  // The workflow's own "too large" notice is not a finding list.
  if (/^\*\*AI Review skipped:\*\*/i.test(text.trim())) return text.trim()

  const kept = parseFindings(text).filter((f) => changed.has(fileOf(f.location)))
  if (kept.length === 0) return 'LGTM'

  return kept
    .map((f) => {
      const body = f.body.join('\n').trim()
      const header = `**[${f.severity}]** \`${f.location}\` - ${f.title}`
      return body ? `${header}\n${body}` : header
    })
    .join('\n\n---\n\n')
}

export { parseFindings, fileOf, filterReview, normalizeChanged }

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (isMain) {
  const args = process.argv.slice(2)
  const readArg = (name) => {
    const i = args.indexOf(name)
    return i === -1 ? null : args[i + 1]
  }

  const changedPath = readArg('--changed')
  const reviewPath = readArg('--review')
  if (!reviewPath) {
    process.stderr.write('Usage: filter-ai-review.js --review <file> [--changed <file>]\n')
    process.exit(2)
  }

  const changedRaw = changedPath ? fs.readFileSync(changedPath, 'utf8').split('\n') : []
  const review = fs.readFileSync(reviewPath, 'utf8')
  process.stdout.write(filterReview(review, normalizeChanged(changedRaw)))
}
