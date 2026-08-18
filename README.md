<div align="center">

# V.I.R.A.N.I.

**V**irtual **I**ntelligent **R**esponse **A**ssistant & **N**etwork **I**nterface

*A real Jarvis. Speaks, listens, thinks with live data, and does things.*

</div>

---

## What this actually is

Not a chatbot demo. VIRANI is an **agent**: it decides which of its tools to use,
runs them on a server in the cloud, and reports back in a voice you hear. It runs
24/7 whether or not your phone is on, and installs to your home screen like a
normal app.

| It really does | How |
|---|---|
| **Hears you** | Say *"Virani, what's the weather"* — wake-word listening, or tap the core |
| **Talks back** | Speaks every answer aloud; you pick the voice and speed |
| **Knows today** | Live web search, weather, news — not just what a model memorised |
| **Remembers you** | Permanent memory of your name, work, people, preferences, across devices |
| **Wakes you up** | Reminders and alarms fire as phone notifications with the app closed |
| **Reads your inbox** | *"Any important email?"* — searches, summarises, drafts and sends Gmail |
| **Runs your diary** | *"What's on tomorrow?"*, *"Book a call Friday at four"* — Google Calendar |
| **Opens apps** | *"Play Interstellar on YouTube"*, *"Navigate to the airport"*, *"Call Ali"* |
| **Briefs you** | A spoken morning briefing: weather, diary, inbox, headlines, in one go |

**Cost: $0/month.** Free AI (Google Gemini), free hosting (Render), free memory
(Upstash), free voice (built into your browser), free notifications (Web Push).

---

## Get it running

**→ Follow [`docs/SETUP.md`](docs/SETUP.md).** It is click-by-click, no terminal
needed, about 15 minutes.

The short version:

1. Get a free **Gemini API key** — <https://aistudio.google.com/apikey>
2. **Deploy** this repo to **Render.com** (free) — it reads `render.yaml` for you
3. Set your **`OWNER_PIN`** and paste the Gemini key
4. Open your new URL on your phone → **Add to Home Screen**
5. Turn on **notifications** and (optionally) **connect Google**
6. Point a free **UptimeRobot** ping at `/health` so it never sleeps

---

## Try saying

```
Virani, what's the weather tomorrow?
Virani, remind me to call the bank at 4pm.
Virani, brief me every morning at eight.
Virani, do I have any unread email from clients?
Virani, what's on my calendar this week?
Virani, book a meeting with Ali on Thursday at 3.
Virani, remember that I prefer short answers.
Virani, what's happening in Pakistan today?
Virani, play the Interstellar soundtrack on YouTube.
Virani, navigate to Dolmen Mall.
```

---

## How it is built

```
public/           the app you see and talk to (installable PWA)
  app.js            speech in/out, wake word, the reactive core
  sw.js             service worker: offline shell + push notifications

src/
  index.js          HTTP server and API
  core/
    brain.js        the agent loop — model decides, server executes, repeat
    persona.js      who VIRANI is and how it speaks
    tools/          ↓
    store.js        memory (file or Upstash Redis)
    scheduler.js    the 24/7 heartbeat that fires reminders
    push.js         Web Push delivery
    google.js       OAuth for Gmail + Calendar
    auth.js         PIN login
    icon.js         the app icon, drawn in code
  tools/
    search.js       live web search (Google grounding → DuckDuckGo → Wikipedia)
    world.js        time, weather, news
    reminders.js    scheduling
    knowledge.js    long-term memory
    apps.js         deep links into other apps
    google.js       Gmail + Calendar
  channels/
    teams.js        optional Microsoft Teams front door (same brain)
```

**The agent loop** is the important part. Every message goes to the model with the
full tool catalogue attached. The model replies with tool calls; the server runs
them for real (hits Google, reads your inbox, writes a reminder), feeds the
results back, and loops until the model has enough to answer. Up to six rounds,
several tools per round.

### Check it works before spending anything

```bash
npm install
node scripts/selftest.js     # runs the whole agent loop against a fake model
```

### Run it locally

```bash
cp .env.example .env         # fill in OWNER_PIN and GEMINI_API_KEY
npm start                    # → http://localhost:3978
```

Voice needs **Chrome** (desktop or Android) or **Safari** on iOS 17+.

---

## Swapping parts

| Change | How |
|---|---|
| Different brain | `AI_PROVIDER=groq` or `openai` + that provider's key |
| Better memory | `MEMORY_BACKEND=upstash` + the two Upstash values |
| Different name | `ASSISTANT_NAME`, `ASSISTANT_FULL_NAME`, `WAKE_WORD` |
| Different personality | Edit `src/core/persona.js` |
| A new skill | Add a tool file in `src/tools/`, register it in `src/tools/index.js` |

---

## Security

VIRANI reaches your email and calendar, so it is locked behind `OWNER_PIN` and a
signed session token. Without a PIN set, the server refuses to sign anyone in.
Google tokens live in your own store and are never sent anywhere but Google.
Sending an email or deleting a calendar event always requires an explicit
spoken confirmation first.

---

Problems? → [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)
