# Running VIRANI without a credit card

If Render asks you for billing details — including for a manual Free web
service — **stop there**. Render's card checks vary by account and country, and
arguing with them wastes an afternoon. Nothing about VIRANI needs Render.

Pick from the routes below. They are ordered by how quickly they get you talking
to VIRANI, not by how permanent they are.

---

## Route 1 — Your own computer, in about 10 minutes

Zero signups, zero cards, and the fastest responses you will ever get, because
the server is in the same room. **This is the one to do today.**

You need [Node.js 18 or newer](https://nodejs.org) installed — the big green
button on that page.

```bash
git clone https://github.com/Maazvirani/teams-ai-agent.git
cd teams-ai-agent
git checkout claude/jarvis-ai-voice-agent-1xaoy5
npm install
```

Copy `.env.example` to `.env` and fill in just two lines:

```
OWNER_PIN=246810
GEMINI_API_KEY=your-AIza-key
```

Then:

```bash
npm run tunnel
```

That starts VIRANI **and** opens a free Cloudflare tunnel in front of it. After
about thirty seconds it prints something like:

```
==================================================================
  VIRANI is live on the internet
==================================================================
  Open this on your phone : https://something-random.trycloudflare.com
  On this computer        : http://localhost:3978
```

Open that address on your phone, sign in with your PIN, and add it to your home
screen. Everything works — voice, memory, reminders, notifications.

**What you're trading:** VIRANI is online only while that computer is awake, and
the address changes each time you run it. Fine for using it every day at your
desk; not a 24/7 assistant yet.

> A free Cloudflare account (no card) lets you create a *named* tunnel with a
> permanent address, which fixes the changing-URL problem. Worth doing once you
> know you like VIRANI.

---

## Route 2 — Back4App Containers

A free container host that takes your GitHub repo directly and asks for no card.
The repository already contains the `Dockerfile` it needs.

1. Sign up at <https://www.back4app.com/> — choose **Containers as a Service**
2. **Create new app** → **Deploy from GitHub** → authorise → pick `teams-ai-agent`
3. Branch: `claude/jarvis-ai-voice-agent-1xaoy5`
4. It detects the `Dockerfile` automatically — leave the build settings alone
5. Add your environment variables (the same list as in [`SETUP.md`](SETUP.md) step 2B)
6. Deploy, then take the URL it gives you and continue from **SETUP.md step 3**

**What you're trading:** the free tier includes a monthly allowance of active
hours rather than unlimited running, and a small amount of RAM. VIRANI is a
small server, so it fits — but check your usage in their dashboard.

---

## Route 3 — Hugging Face Spaces

Free, no card, and it will run a Node container continuously.

1. Sign up at <https://huggingface.co/join>
2. **New** → **Space** → name `virani`, SDK **Docker** → **Blank**,
   visibility **Private** ← important, this is your assistant
3. Download this repo from GitHub (**Code** → **Download ZIP**) and unzip it
4. In the Space → **Files** → **Add file** → **Upload files**, then drag the
   whole unzipped folder in. The `Dockerfile` is already set up for Spaces,
   including the port they expect.
5. **Settings** → **Variables and secrets** → add each value as a **Secret**:
   `OWNER_PIN`, `GEMINI_API_KEY`, `SESSION_SECRET`, `OWNER_NAME`,
   `OWNER_TIMEZONE`, `OWNER_CITY`
6. It builds and gives you `https://your-name-virani.hf.space`. Put that in a
   `PUBLIC_URL` secret and continue from **SETUP.md step 3**.

**What you're trading:** Spaces are meant for demos, so there is no uptime
promise, and a free Space pauses after roughly two days with no traffic. The
UptimeRobot pinger in SETUP step 8 keeps it awake. Use the Upstash memory
backend so nothing is lost if it does restart.

---

## Route 4 — An old Android phone, forever free

The most reliable no-card 24/7 option, and the cheapest: a spare Android phone
on your WiFi, plugged in, acting as the server.

1. Install **Termux** from [F-Droid](https://f-droid.org/packages/com.termux/)
   (the Play Store version is outdated and will not work)
2. In Termux:

```bash
pkg update && pkg install nodejs git -y
git clone https://github.com/Maazvirani/teams-ai-agent.git
cd teams-ai-agent
git checkout claude/jarvis-ai-voice-agent-1xaoy5
npm install
cp .env.example .env
nano .env          # fill in OWNER_PIN and GEMINI_API_KEY
npm run tunnel
```

3. Run `termux-wake-lock` so Android does not suspend it, and turn off battery
   optimisation for Termux in the phone's settings.

An old phone draws about two watts. It is a genuinely permanent, genuinely free
home for VIRANI.

---

## What VIRANI needs from any host

Use this to judge any platform you come across:

| Requirement | Why |
|---|---|
| Node 18 or newer | The code relies on built-in `fetch` |
| A continuously running process | The reminder scheduler ticks every 30 seconds |
| An inbound HTTPS address | Microphone and notifications both require a secure origin |
| About 256 MB of RAM | It is a small server |
| Outbound internet | To reach Gemini, Google, weather and news |

**Serverless platforms will not work.** Vercel, Netlify and Cloudflare Workers
are free and card-free, but they run short-lived functions rather than a
continuous process, so scheduled reminders would not fire reliably. That is why
they are not listed above.

---

## Once it is running

Whichever route you took, go back to [`SETUP.md`](SETUP.md) and continue from
**Step 3**. Everything after deployment is identical everywhere.

Two notes that matter more when self-hosting:

- **Memory:** set up Upstash (SETUP step 7) so your memories, contacts and
  reminders survive a restart. On a home machine this matters even more than in
  the cloud.
- **Google sign-in:** the Gmail and Calendar connection needs a stable
  `PUBLIC_URL`, so do that step after you have a permanent address, not while
  you are on a throwaway tunnel URL.
