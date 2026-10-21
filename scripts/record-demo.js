#!/usr/bin/env node
'use strict'

/**
 * Record a short walkthrough of a real game against a live deployment.
 *
 * Opens three browser pages (host + two guests), plays one round through the
 * real UI, and saves a webm per page. The game is real: same API and database
 * the site serves, no mocks.
 *
 * Usage: node scripts/record-demo.js [baseUrl] [outDir]
 */

const path = require('node:path')
const fs = require('node:fs')
const { chromium } = require('@playwright/test')

const BASE = process.argv[2] || 'https://quizknight.sotirios-k-goulas.workers.dev'
const OUT_DIR =
  process.argv[3] || path.join(process.env.HOME, 'Documents/grokbot_inventory/screenshots')

const VIEW = { width: 430, height: 860 }

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const browser = await chromium.launch()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)

  const mk = async (name) => {
    const ctx = await browser.newContext({
      viewport: VIEW,
      recordVideo: { dir: path.join(OUT_DIR, `_video_${name}_${stamp}`), size: VIEW },
    })
    const page = await ctx.newPage()
    return { ctx, page }
  }

  const host = await mk('host')
  const g2 = await mk('guest2')
  const g3 = await mk('guest3')

  try {
    console.log(`Recording against ${BASE}`)

    await host.page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await host.page.waitForTimeout(1500)
    await host.page.getByPlaceholder('Enter your name').fill('Host')
    await host.page.waitForTimeout(600)
    await host.page.getByRole('button', { name: /create game/i }).click()
    await host.page.waitForURL(/\/lobby\//, { timeout: 20000 })
    await host.page.waitForTimeout(1200)

    const roomCode = (await host.page.locator('p.text-5xl').first().innerText()).trim()
    console.log(`Room ${roomCode}`)

    for (const [guest, nick] of [
      [g2, 'Maria'],
      [g3, 'Nikos'],
    ]) {
      await guest.page.goto(`${BASE}/?join=${roomCode}`, { waitUntil: 'domcontentloaded' })
      await guest.page.waitForTimeout(900)
      await guest.page.getByPlaceholder('Enter your name').fill(nick)
      await guest.page.getByRole('button', { name: /^join$/i }).click()
      await guest.page.waitForURL(/\/lobby\//, { timeout: 20000 })
      await guest.page.waitForTimeout(900)
    }

    await host.page.waitForTimeout(2000)
    const startBtn = host.page.getByRole('button', { name: /start game/i })
    await startBtn.waitFor({ state: 'visible', timeout: 20000 })
    await host.page.waitForTimeout(800)
    await startBtn.click()
    console.log('Game started')

    for (const g of [host, g2, g3]) {
      await g.page.waitForURL(/\/game\//, { timeout: 20000 })
      await g.page.waitForTimeout(1200)
    }

    const submissions = [
      [g2, '42', 1800],
      [g3, '120', 1800],
      [host, '41', 1800],
    ]
    for (const [g, value, pause] of submissions) {
      await g.page.getByLabel('Your guess').fill(value)
      await g.page.waitForTimeout(400)
      await g.page.getByRole('button', { name: /lock it in/i }).click()
      await g.page.waitForTimeout(pause)
    }

    for (const g of [host, g2, g3]) {
      await g.page.getByText('The answer is').first().waitFor({ timeout: 40000 })
      await g.page.waitForTimeout(1500)
    }
    console.log('Reveal shown')

    await host.page.waitForTimeout(2500)
  } catch (err) {
    console.error(`Recording stopped early: ${err.message}`)
  } finally {
    const videos = []
    for (const [label, g] of [
      ['host', host],
      ['guest2', g2],
      ['guest3', g3],
    ]) {
      const v = g.page.video()
      await g.ctx.close()
      if (v) videos.push({ label, file: await v.path() })
    }
    await browser.close()

    for (const { label, file } of videos) {
      const dest = path.join(OUT_DIR, `quizknight-${label}-${stamp}.webm`)
      fs.renameSync(file, dest)
      console.log(`Saved ${dest}`)
    }
  }
}

main()
