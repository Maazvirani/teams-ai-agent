# If your host asks for a credit card

The main guide, [`SETUP.md`](SETUP.md), uses **Back4App Containers** — free, no
card, and every step is done in a browser. This page is the backup list for if
Back4App does not work out for you.

**A warning learned the hard way:** Render was the original recommendation, and
it demands billing details on some accounts even for a free service, and even
when you create the service by hand instead of using a Blueprint. Card checks
vary by account and by country. If a signup page asks for payment details, back
out and try the next option rather than fighting it.

Free plans change too. Everything here was checked in August 2026 — trust the
signup page in front of you over this document.

---

## Route 1 — Hugging Face Spaces (no terminal, no card)

The closest alternative to Back4App: free, no card, runs a Node container, and
everything happens in the browser.

1. Sign up at <https://huggingface.co/join>
2. **New** → **Space**
   - Space name: `virani`
   - Space SDK: **Docker** → **Blank**
   - Visibility: **Private** ← important, this is your assistant
3. **Create Space**
4. Get the code onto it without a terminal:
   - On GitHub, open the repository, switch to the branch
     `claude/jarvis-ai-voice-agent-1xaoy5`, then **Code** → **Download ZIP**
   - Unzip it (double-click on Windows or Mac — no software needed)
   - In your Space → **Files** → **Add file** → **Upload files**, then drag the
     unzipped folder's contents in
5. **Settings** → **Variables and secrets** → add each setting from SETUP.md
   Step 3 as a **Secret**
6. It builds and gives you `https://your-name-virani.hf.space`. Add that as the
   `PUBLIC_URL` secret, then continue from **SETUP.md Step 4**.

**What you're trading:** Spaces are meant for demos, so there is no uptime
promise, and a free Space pauses after roughly two days of no traffic. The
UptimeRobot pinger in SETUP Step 7 prevents that.

---

## Route 2 — Your own computer, in about 10 minutes

**This one does need a few typed commands**, unlike everything above. It is here
because it is the fastest way to try VIRANI with no signups at all.

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

## Route 3 — An old Android phone, forever free

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
