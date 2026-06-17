# cek

Personal Chrome extension — quiet co-pilot for ChatGPT and Claude.

Tracks prompt history, estimates context window usage, and monitors daily message limits.

## Features

- **Prompt history** — auto-captures every prompt you send
- **Context tracker** — token estimate with progress bar on active AI tabs
- **Daily limits** — tier-based message counting (Free/Plus/Pro)
- **Smart features (optional, Groq)** — semantic search, auto session titles, near-duplicate detection

## Setup

```bash
npm install
node scripts/generate-icons.mjs
npm run build
```

Load in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `dist` folder

## Settings

Click the gear icon in the popup (or right-click extension → Options):

- Set your ChatGPT / Claude subscription tiers
- Optionally add a [Groq API key](https://console.groq.com) for smart features

## Development

```bash
npm run dev
```

Uses Vite + `@crxjs/vite-plugin`. Reload the extension after changes.
