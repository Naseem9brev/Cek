<p align="center">
  <img src="public/icons/icon128.png" alt="cek logo" width="96" height="96" />
</p>

<h1 align="center">cek</h1>

<p align="center">
  <strong>A quiet co-pilot for ChatGPT and Claude.</strong><br/>
  Track your context window, log every prompt, and stay ahead of message limits — without leaving the tab.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-2D6A2D?style=flat-square" alt="MIT License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Chrome-Manifest%20V3-FAF3E0?style=flat-square&logo=googlechrome&logoColor=1A3A1A" alt="Chrome MV3" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" alt="Vite" /></a>
</p>

---

## What is cek?

**cek** is a personal Chrome extension that sits quietly beside your AI workflows. While you chat on ChatGPT or Claude, it runs in the background and does three things well:

1. **Remembers what you asked** — every prompt you send is captured automatically and organized by session.
2. **Shows how much context you've burned** — a live token estimate and progress bar for the conversation you're in right now.
3. **Counts toward your limits** — tier-aware message tracking so you know when you're running low before the platform tells you.

No account. No cloud dashboard. Everything lives in your browser unless you opt into optional smart features powered by [Groq](https://groq.com).

> **Gemini support is on the way.** The codebase is scaffolded; content-script integration is coming in a future release.

---

## Architecture

cek follows a classic Manifest V3 layout: lightweight content scripts on each AI site, a central service worker for all logic, and a popup for at-a-glance status.

<p align="center">
  <img src="docs/architecture.svg" alt="cek system architecture diagram" width="860" />
</p>

| Layer | Role |
|-------|------|
| **Content scripts** | Inject into `chatgpt.com` and `claude.ai`. Listen for send events, scrape conversation length, detect the active model. |
| **Service worker** | Single source of truth. Handles prompt capture, deduplication, token math, limit windows, session titles, and semantic search. |
| **Popup & Settings** | Read state via `GET_STATE`. Search, pin, export prompts. Configure tiers and optional Groq features. |
| **Local storage** | `chrome.storage.local` holds prompts, sessions, embeddings, message counts, and context usage — up to 500 prompts (pinned prompts are never pruned). |
| **Groq (optional)** | When enabled with your own API key, prompt text is sent to Groq for embeddings, auto-titles, and near-duplicate detection. |

### Data flow

```
You send a prompt on ChatGPT or Claude
        │
        ▼
Content script captures text + session ID
        │
        ▼
Service worker stores prompt, increments limit counter,
optionally embeds via Groq, groups into session
        │
        ▼
Popup reflects updated history, context bar, and remaining messages
```

---

## Features

### Prompt history

Every prompt you send is logged automatically — no copy-paste, no manual saving. History is grouped by conversation session, searchable by keyword, and pin-worthy for prompts you want to keep forever.

- Auto-capture on Enter or Send button click
- Session grouping with optional AI-generated titles (Groq)
- Pin, delete, and export pinned prompts as JSON
- Exact deduplication within 2 seconds; near-duplicate detection via embeddings (Groq)

### Context tracker

See how full your current conversation is before you hit the wall.

- Scrapes visible message blocks and estimates tokens (`chars ÷ 4`)
- Progress bar turns amber at 70%, red at 90%
- Model-aware limits (GPT-4o → 128k, Claude Sonnet/Opus → 200k)
- Optional floating badge on the page (Settings → Advanced)

### Daily & rolling limits

Set your subscription tier once; cek tracks messages against platform-specific windows.

| Platform | Tier | Window | Approx. limit |
|----------|------|--------|---------------|
| ChatGPT | Free | 24 h | 10 messages |
| ChatGPT | Plus | 3 h | 80 messages |
| Claude | Free | 24 h | 20 messages |
| Claude | Pro | 5 h | 45 messages |

Remaining counts appear in the popup platform strip (`~12 left`). Windows reset automatically via a 15-minute background alarm.

### Smart features (optional, Groq)

Bring your own [Groq API key](https://console.groq.com). Prompt text is only sent to Groq when smart features are enabled.

| Feature | What it does |
|---------|--------------|
| **Semantic search** | Find past prompts by meaning, not just keywords |
| **Auto session titles** | First prompt in a thread gets a 4–7 word title |
| **Near-duplicate detection** | Flags or skips prompts too similar to recent ones (configurable threshold) |

---

## Example use cases

### 1. Long research thread — don't lose context

You're deep in a 40-message ChatGPT research session about market sizing. The context bar shows you're at ~85k of 128k tokens. You pause, switch to Claude for a second opinion, then come back — cek's popup still has every prompt from the ChatGPT thread, grouped under an auto-titled session like *"SaaS market sizing assumptions"*.

**Without cek:** Scroll forever or re-ask questions you already explored.  
**With cek:** Glance at the popup, search "pricing model", copy the exact prompt you used two hours ago.

---

### 2. Hitting ChatGPT Plus limits before a deadline

You're on ChatGPT Plus with an 80-message / 3-hour window. The popup shows `ChatGPT ~6 left`. You batch your remaining questions, save the important ones as pinned prompts, and switch to Claude for the rest — without accidentally burning your last messages on near-identical rephrases (Groq near-duplicate detection can skip or flag those).

**Without cek:** Hit the limit mid-task with no warning.  
**With cek:** Plan around the counter and avoid redundant sends.

---

### 3. Reusing your best prompts across platforms

You crafted a great system-style prompt on Claude for code review. A week later you want something similar on ChatGPT. You open cek, search "code review checklist", find the original, pin it, and adapt it — or use semantic search (Groq) to find prompts about "reviewing pull requests" even if you never used those exact words.

**Without cek:** Dig through browser history or re-write from memory.  
**With cek:** Your prompt library travels with you across AI tabs.

---

### 4. Debugging a flaky conversation

A Claude thread starts giving weird answers. You toggle debug mode in Settings, enable the on-page context badge, and watch token usage climb as you paste in large files. You export pinned prompts as JSON for your notes and start a fresh thread with a cleaner, shorter opener pulled from history.

**Without cek:** Guess whether context overflow is the problem.  
**With cek:** See estimated token usage in real time and keep an audit trail.

---

## Quick start

### Install

```bash
git clone https://github.com/Naseem9brev/Cek.git
cd Cek
npm install
npm run build
```

Load in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `dist` folder

### First-run setup

1. Click the cek icon (or press **Alt+Shift+C**)
2. Open **Settings** (gear icon)
3. Set your ChatGPT and Claude subscription tiers
4. Optionally add a Groq API key for smart features

---

## Development

```bash
npm run dev    # Vite dev server with @crxjs/vite-plugin hot reload
npm run build  # Generate icons, typecheck, production bundle
```

After code changes, reload the extension at `chrome://extensions`.

### Project structure

```
src/
├── background/       service-worker.ts — core logic & message routing
├── content/          chatgpt.ts, claude.ts, shared.ts — DOM capture
├── popup/            extension popup UI
├── settings/         options page (tiers, Groq, advanced)
└── lib/              storage, tokens, windows, groq, embeddings, duplicates
```

---

## Privacy

- **Default:** All data stays in `chrome.storage.local` on your machine. cek does not phone home.
- **With Groq enabled:** Prompt text is sent to Groq's API for embeddings and title generation. Your API key is stored locally and never shared with the cek project.
- **Permissions:** `storage`, `alarms`, `activeTab`, `tabs`, plus host access to `chatgpt.com`, `claude.ai`, and `api.groq.com`.

---

## License

[MIT](LICENSE) © 2026 Naseem9brev
