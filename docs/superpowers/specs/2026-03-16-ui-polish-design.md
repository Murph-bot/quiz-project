# UI Polish Design Spec
**Date:** 2026-03-16
**Status:** Approved

---

## Overview

A visual polish pass across all QuizKnight screens. The approach is direct component edits (no new abstractions, no extracted design system). Every screen gets the new background; components are updated in priority order.

---

## Design Decisions

### Visual Direction
**Crisp & Bold** — white solid cards on a gradient background, strong contrast, bold typography. No glassmorphism. Readable on small mobile screens in any lighting.

### Background
**Sunset Blaze** — a slow animated gradient that shifts between orange, amber, and magenta. Applied on `<body>` via `globals.css`.

```css
@keyframes gradientShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

body {
  background: linear-gradient(135deg, #ff4500, #ff6b00, #ff8c42, #ffa500, #e84393);
  background-size: 400% 400%;
  animation: gradientShift 16s ease infinite;
  background-attachment: fixed;
}
```

### Urgent State Background
When `secondsLeft <= 4`, `QuestionPanel`'s outer wrapper div switches from no background to a full-screen Warm Red gradient by toggling a CSS class directly on that div (which already fills `min-h-dvh`). Because the div covers the entire viewport, it visually overrides the body background — no `<body>` mutation or `GameScreen` state lifting required.

```css
/* Applied as a className on QuestionPanel's outer div when secondsLeft <= 4 */
.urgent-bg {
  background: linear-gradient(135deg, #c0160a, #e02010, #ff4500, #c0200a, #8b0000) !important;
  background-size: 400% 400% !important;
  animation: gradientShift 2s ease infinite !important;
}
```

In `QuestionPanel.tsx`:
```tsx
const isUrgent = secondsLeft <= 4 && secondsLeft > 0

<div className={`flex flex-col items-center justify-center min-h-dvh p-4 ${isUrgent ? 'urgent-bg' : ''}`}>
```

### Animations
**Subtle fade-in only.** No sliding, bouncing, or dramatic entrance animations.

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes timerPulse {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.1); }
}

@keyframes trophy {
  0%, 100% { transform: rotate(-8deg) scale(1); }
  50%       { transform: rotate(8deg) scale(1.15); }
}
```

Reveal rows fade in with a stagger using an inline `style` prop:
```tsx
// index is the row's position in the answers array
style={{ opacity: 0, animation: 'fadeIn 0.3s ease forwards', animationDelay: `${index * 50}ms` }}
```

### Cards
All cards are solid white, `rounded-2xl`, with a subtle shadow. Replace all `bg-white/15 backdrop-blur border border-white/30` with `bg-white rounded-2xl shadow-md`.

### Colour Palette
| Use | Value |
|-----|-------|
| Primary button / accents | `linear-gradient(135deg, #ff6b00, #e84393)` |
| Correct answer number | `#ff6b00` (orange) |
| Timer — normal | `#ff6b00` (orange) |
| Timer — urgent (≤ 4s) | `#dc2626` (red), `timerPulse` animation |
| Progress bar — normal | `linear-gradient(90deg, #ff6b00, #e84393)` |
| Progress bar — urgent | `#dc2626` |
| Eliminated row bg | `#fee2e2` (Tailwind `bg-red-100`) |
| Eliminated text | `#991b1b` / `#dc2626` |
| Host badge text | `#ff6b00` |
| Divider line (inside white card) | `bg-gray-200` |
| Divider "or join" text (inside white card) | `text-gray-400` |
| Winner banner | `bg-yellow-400` — unchanged from current |

---

## Component Changes (Priority Order)

### 1. `globals.css`
- Replace static purple-pink gradient with Sunset Blaze animated gradient.
- Add keyframes: `gradientShift`, `fadeIn`, `timerPulse`, `trophy`.
- Add `.urgent-bg` class.

### 2. `QuestionPanel.tsx`
- Derive `isUrgent = secondsLeft <= 4 && secondsLeft > 0` from the existing `useCountdown` hook result.
- Apply `urgent-bg` class to the outer `min-h-dvh` wrapper div when `isUrgent` is true (overrides body background for the full viewport).
- **Timer card** (`wcard`): White card. Timer number is `text-orange-500 font-black text-6xl` normally; when `isUrgent`, switch to `text-red-600` and apply `timerPulse` via inline style: `style={{ animation: 'timerPulse 0.6s ease infinite' }}`.
- **"seconds left" label**: `text-gray-400 text-xs uppercase tracking-widest` normally; `text-red-600` when urgent.
- **Progress bar**: Orange→pink gradient normally; solid `bg-red-600` when urgent.
- **Question card**: White card (`bg-white rounded-2xl shadow-md p-5`), dark text (`text-gray-900 font-bold text-lg`).
- **Answer input**: `bg-white border-2 border-gray-200 rounded-xl px-4 py-3 text-gray-900 font-bold text-lg text-center`.
- **Submit button**: `bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-xl px-5`. Disabled: `opacity-40`. Shows "Sent!" when `isWaiting`.
- **Round / category pills**: Keep existing `bg-white/20 text-white` pill style — they work on both gradient backgrounds.

### 3. `RevealPanel.tsx`
- **Correct answer card**: White card. Small `text-xs font-bold text-gray-400 uppercase tracking-widest` label "Correct Answer". Answer number: `text-5xl font-black` in `#ff6b00` (inline style or `text-orange-500`).
- **Answer rows**: Replace current `bg-white/15 backdrop-blur border` rows with white cards (`bg-white rounded-xl shadow-sm px-4 py-3`). Apply stagger fade-in via inline `animationDelay` (see Animations section). Eliminated rows: `bg-red-100` instead.
- **Eliminated text**: `text-red-800 font-bold` for nickname, `text-red-600 font-black` for value, `text-red-400 text-xs` for delta.
- **Delta text**: `text-gray-400 text-xs` normally; `exact!` in `text-green-600 text-xs font-bold`.
- **Winner banner** (when `winner` is truthy): Keep existing `bg-yellow-400 rounded-2xl py-3 text-center` — fits the warm palette.
- **Spectator banner** (when `spectatorBanner` is set): Replace glassmorphism with `bg-white/20 rounded-xl px-4 py-2 text-center text-white/80 text-xs`.
- **"Next question in Xs" / "Game over" text**: `text-white/70 text-xs text-center`, bold countdown in `text-white`.
- **Round badge pill**: Keep `bg-white/20 text-white` pill unchanged.

### 4. `WinnerScreen.tsx`
- **Trophy**: `text-7xl` with `animation: trophy 1.8s ease-in-out infinite` (add inline `style` or a Tailwind `animate-` class via arbitrary value).
- **Winner card**: White card. Small `text-xs font-bold text-gray-400 uppercase tracking-widest` label "Winner". Nickname: `text-2xl font-black text-orange-500`. Tagline: `text-sm text-gray-500 mt-1` — "Last one standing! 🎉".
- **Nobody won variant**: 😶 emoji (no animation). Copy: "Nobody won this time." Same card structure.
- **Redirect countdown**: `text-white/70 text-sm` with `font-bold text-white` for the number.

### 5. `SpectatorScreen.tsx`
- **Skull**: `text-6xl` — unchanged.
- **Card**: White card. Heading `text-lg font-black text-gray-900` — "You've been eliminated". Body `text-sm text-gray-500 mt-1` — "Hang tight — a resurrection could bring you back every 5 rounds."
- **Round label**: `text-white/70 text-sm mt-2` — "Spectating Round {roundNumber}…"
- **New prop required**: Add `roundNumber: number` to `SpectatorScreen`'s Props interface. Pass `roundNumber` from `GameScreen.tsx` (which already has `roundNumber` in state) when rendering `<SpectatorScreen>`.
- Remove old copy ("You lost the game, you are {nickname}. Do not worry you can come back later. Maybe.").

### 6. `HomeScreen.tsx`
- **Title**: `text-4xl font-black text-white tracking-tight` unchanged. Subtitle `text-white/70 text-sm mt-1` unchanged.
- **Form card**: Replace `bg-white/15 backdrop-blur border border-white/30 rounded-2xl p-5` with `bg-white rounded-2xl shadow-md p-5`.
- **Nickname input**: `bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 font-bold text-sm focus:outline-none focus:border-orange-400`.
- **Create button**: `w-full bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full py-3 disabled:opacity-50 active:scale-95 transition-transform`.
- **Divider line**: `flex-1 h-px bg-gray-200`. Divider text: `text-gray-400 text-xs` (divider is inside the white card).
- **Room code input**: `flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 font-black text-sm uppercase tracking-widest focus:outline-none focus:border-orange-400`.
- **Join button**: `bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full px-5 disabled:opacity-50 active:scale-95 transition-transform`.
- **Error text**: `text-red-500 text-xs text-center font-semibold` — unchanged position.

### 7. `LobbyScreen.tsx` + `PlayerList.tsx`
- **Room code section**: Remove the existing `bg-white/15 backdrop-blur border border-white/30 rounded-2xl py-5` wrapper div entirely. Render the room code directly on the gradient: label `text-white/60 text-xs font-semibold uppercase tracking-widest mb-1`, code `text-white text-5xl font-black tracking-[0.3em]`, hint `text-white/50 text-xs mt-2` — all unchanged text, just remove the wrapping card.
- **Players section**: Section label `text-white/60 text-xs font-semibold uppercase tracking-widest` unchanged. Update `PlayerList.tsx` (or inline if `PlayerList` renders rows directly): each player row becomes `bg-white rounded-xl shadow-sm px-4 py-3 flex items-center gap-3 mb-2`. Add a colored initial avatar: `w-8 h-8 rounded-full flex items-center justify-center font-black text-sm text-white` with `background: linear-gradient(135deg, #ff6b00, #e84393)` (use a fixed gradient — no per-player color logic needed). Nickname: `font-bold text-sm text-gray-900`. Host badge: `ml-auto text-xs font-bold text-orange-500 uppercase` showing "Host".
- **Category selector** (host only): Wrap `<select>` in a white card `bg-white rounded-2xl shadow-md px-4 py-1`. Select: `bg-transparent border-none text-gray-900 font-bold text-sm focus:outline-none capitalize w-full py-2`.
- **Start button**: `w-full bg-gradient-to-br from-orange-500 to-pink-500 text-white font-black text-sm rounded-full py-4 disabled:opacity-40 active:scale-95 transition-transform`.
- **Waiting text** (non-host): `text-center text-white/60 text-sm` — unchanged.

### 8. `GameScreen.tsx`
- Pass `roundNumber` to `<SpectatorScreen roundNumber={roundNumber} />` (was only passing `nickname` before).
- No other changes to `GameScreen.tsx`.

---

## What Is Not Changing

- All game logic, API calls, Supabase Realtime subscriptions, state management — untouched.
- Component file structure — no new files, no extracted primitives.
- `useCountdown.ts` hook — untouched.
- All test files — no changes needed (logic unchanged).
- `roomCode.ts` — untouched.

---

## Implementation Order

1. `globals.css` — background + keyframes + `.urgent-bg`
2. `QuestionPanel.tsx` — urgent background wiring + card styles
3. `RevealPanel.tsx` — white cards + stagger fade + eliminated styling
4. `WinnerScreen.tsx` — trophy animation + winner card
5. `SpectatorScreen.tsx` — new copy + `roundNumber` prop
6. `GameScreen.tsx` — pass `roundNumber` to `SpectatorScreen`
7. `HomeScreen.tsx` — white card form, gradient buttons
8. `LobbyScreen.tsx` + `PlayerList.tsx` — room code on gradient, player row cards, avatar initials
