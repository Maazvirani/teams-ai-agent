# Hosting VIRANI without a credit card

Free-hosting policies change often, and several platforms now ask for a card
"just to verify you" before they will run anything. You do not need to give one.

Work down this list — the first option that works is the one to use.

---

## 1. Render, without the Blueprint  ← try this first

The card prompt on Render comes from the **Blueprint** flow specifically, not
from free hosting. Creating the web service by hand avoids it and produces an
identical deployment.

Full instructions are **Step 2B** in [`SETUP.md`](SETUP.md). In short:

**New +** → **Web Service** (not Blueprint) → pick the repo → Runtime **Node**,
Build `npm install`, Start `npm start`, Instance Type **Free** → paste the
environment variables → **Create Web Service**.

This works for almost everyone. Only carry on down this page if Render still
demands a card for a manual Free web service.

---

## 2. Hugging Face Spaces (Docker)

Free, genuinely no card, and it will run a Node server continuously. It is meant
for hosting demos rather than production backends, so treat it as personal-use
hosting — which is exactly what VIRANI is.

1. Sign up at <https://huggingface.co/join> — no payment details requested
2. **New** → **Space**
   - Space name: `virani`
   - License: MIT
   - Space SDK: **Docker** → **Blank**
   - Visibility: **Private** ← important, this is your assistant
3. **Create Space**
4. In the Space, click **Files** → **Add file** → **Upload files**, and upload
   this repository's contents (download it from GitHub with **Code** → **Download
   ZIP**, unzip, then drag the files in). The `Dockerfile` in the root is already
   written for this.
5. Go to the Space's **Settings** → **Variables and secrets**. Add each value as
   a **Secret** (not a variable — secrets are hidden):

   | Name | Value |
   |---|---|
   | `OWNER_PIN` | your chosen number |
   | `GEMINI_API_KEY` | your `AIza…` key |
   | `SESSION_SECRET` | any long random string |
   | `OWNER_NAME` | Maaz |
   | `OWNER_TIMEZONE` | `Asia/Karachi` |
   | `OWNER_CITY` | Karachi |
   | `PUBLIC_URL` | your Space URL (added after step 6) |

6. The Space builds and gives you a URL like
   `https://your-name-virani.hf.space`. Put that in `PUBLIC_URL` and let it
   rebuild.

**Worth knowing:** free Spaces pause after about 48 hours with no traffic. The
UptimeRobot pinger in SETUP Step 8 prevents that — set it up and the Space stays
awake. Use the Upstash memory backend (SETUP Step 7) so nothing is lost if it
ever does restart.

---

## 3. Your own computer, with a free tunnel

If you have a laptop or a spare phone that is usually on, you can host VIRANI
yourself and expose it with a free tunnel. No card anywhere, and the fastest
possible responses.

```bash
git clone https://github.com/Maazvirani/teams-ai-agent.git
cd teams-ai-agent
git checkout claude/jarvis-ai-voice-agent-1xaoy5
npm install
cp .env.example .env      # fill in OWNER_PIN and GEMINI_API_KEY
npm start
```

Then expose it (Cloudflare Tunnel is free and needs no account for a quick URL):

```bash
npx cloudflared tunnel --url http://localhost:3978
```

It prints an `https://…trycloudflare.com` address. Use that as `PUBLIC_URL` and
open it on your phone.

**The catch:** it only works while that computer is on and awake, so reminders
stop when it sleeps. Good for trying VIRANI out today; not a real 24/7 home.

---

## 4. Any other Docker host

The repository ships a `Dockerfile`, so anything that runs a container will run
VIRANI. Point the host at the repo, and set the environment variables from
[`.env.example`](../.env.example). The container listens on `$PORT`, defaulting
to 7860.

---

## What VIRANI actually needs from a host

Use this to judge any platform you find:

| Requirement | Why |
|---|---|
| Node 18 or newer | The code uses built-in `fetch` |
| A long-running process | The reminder scheduler ticks every 30 seconds |
| An inbound HTTPS URL | Microphone and notifications need a secure origin |
| ~256 MB RAM | It is a small server; that is plenty |
| Outbound internet | To reach Gemini, Google, weather and news |

Serverless-only platforms — Vercel, Netlify, Cloudflare Workers — are free and
excellent, but they run functions rather than a continuous process, so scheduled
reminders would not fire reliably. That is why they are not on this list.

---

## However you host it

Once it is live, come back to [`SETUP.md`](SETUP.md) and continue from **Step 3**.
Everything after deployment is identical on every platform.
