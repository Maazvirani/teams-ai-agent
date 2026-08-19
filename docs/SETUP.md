# Getting V.I.R.A.N.I. live — click by click

No terminal required. Around 15 minutes. Everything here is free.

Work through it in order. After **Step 4** you already have a talking assistant;
steps 5–8 make it a proper 24/7 one.

---

## Step 1 — Get the AI brain (2 min, free)

1. Go to <https://aistudio.google.com/apikey>
2. Sign in with any Google account → **Create API key**
3. Copy the key (it starts with `AIza…`) and keep it somewhere safe for a minute

> This is Google Gemini's free tier. No card, no billing. It is generous enough
> for daily personal use.

---

## Step 2 — Deploy it (5 min, free)

> ### ⚠ If Render asks for a credit card
>
> **Don't enter one.** The card prompt comes from the *Blueprint* flow, not from
> free hosting. Creating the service by hand skips it entirely and gives you the
> identical result — the only difference is that you type the settings in rather
> than Render reading them from `render.yaml`.
>
> Use **Step 2B** below instead of Step 2A. It takes about three minutes longer.
> If Render still insists on a card even for a manual Free web service, jump to
> [`NO-CREDIT-CARD.md`](NO-CREDIT-CARD.md) for hosts that never ask for one.

---

## Step 2A — Deploy with a Blueprint (fastest, may ask for a card)

1. Go to <https://render.com> → **Get Started** → sign in **with GitHub**
2. **New +** → **Blueprint**
3. Pick this repository (`teams-ai-agent`) and the branch
   `claude/jarvis-ai-voice-agent-1xaoy5`
4. Render finds `render.yaml` and shows a service called **virani** → **Apply**
5. It now asks for the values it does not know. Fill in:

| Field | What to put |
|---|---|
| `OWNER_PIN` | Any number you'll remember, e.g. `246810`. This is your password. |
| `GEMINI_API_KEY` | The key from Step 1 |
| `OWNER_NAME` | Your first name — VIRANI addresses you by it |
| `PUBLIC_URL` | Leave blank for now; you fill it in at Step 3 |

Everything else can keep its default. Click **Create / Deploy** and wait for the
build to go green (1–2 minutes).

---

## Step 2B — Deploy by hand (no credit card)

Use this if Step 2A asked you for payment details.

1. Render dashboard → **New +** → **Web Service** (*not* Blueprint)
2. **Connect a repository** → authorise GitHub → pick `teams-ai-agent`
3. Fill in the form:

| Field | Value |
|---|---|
| Name | `virani` |
| Branch | `claude/jarvis-ai-voice-agent-1xaoy5` |
| Region | whichever is nearest you |
| Root Directory | *leave blank* |
| Runtime / Language | **Node** |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Instance Type | **Free** ← make sure this is selected |

4. Scroll to **Environment Variables**. Rather than adding them one at a time,
   click **Add from .env** and paste this whole block, editing the two lines
   marked `CHANGE ME`:

```
OWNER_PIN=246810
GEMINI_API_KEY=paste-your-AIza-key-here
AI_PROVIDER=gemini
GEMINI_MODEL=gemini-2.0-flash
OWNER_NAME=Maaz
OWNER_TIMEZONE=Asia/Karachi
OWNER_CITY=Karachi
WAKE_WORD=virani
MEMORY_BACKEND=file
TTS_PROVIDER=browser
SESSION_SECRET=change-this-to-any-long-random-string
```

   `OWNER_PIN` and `SESSION_SECRET` are the two `CHANGE ME` lines — pick your own
   PIN, and make the secret any long random string.

5. **Create Web Service**. Wait for the build to go green.

Then carry on with Step 3 exactly as written. `PUBLIC_URL` gets added there.

> **Why this works:** `render.yaml` is only a convenience — it pre-fills the same
> form. Nothing in VIRANI needs Blueprints, so a hand-made Free web service is
> functionally identical.

---

## Step 3 — Tell it its own address (1 min)

1. At the top of the Render service page, copy your URL —
   something like `https://virani.onrender.com`
2. Go to **Environment** in the left sidebar
3. Set `PUBLIC_URL` to that URL, **with no trailing slash**
4. **Save changes** — Render redeploys automatically

---

## Step 4 — Open it and say hello (2 min)

1. Open your URL **in Chrome on Android**, **Safari on iPhone**, or Chrome on a laptop
2. Type your `OWNER_PIN` → **Authenticate**
3. Tap the glowing core and say: *"What's the weather in Karachi tomorrow?"*
4. Allow the microphone when the browser asks

**Install it as an app:**

- **Android / Chrome:** menu **⋮** → *Add to Home screen* → *Install*
- **iPhone / Safari:** Share **↑** → *Add to Home Screen*
- **Desktop Chrome:** the ⊕ install icon in the address bar

It now has its own icon and opens full-screen, with no browser chrome.

> **Wake word:** tap **WAKE WORD: OFF** at the top to switch it on. VIRANI then
> listens continuously and answers whenever you start a sentence with *"Virani…"*.
> Keep the app open (or on-screen) for this — a browser cannot listen while closed.

---

## Step 5 — Turn on notifications (2 min)

This is what makes reminders work when the app is closed.

1. Open **⚙ Settings** → **Notifications**
2. **Enable on this device** → allow the permission prompt
3. **Send test notification** — it should appear on your phone
4. Now try: *"Virani, remind me in two minutes to test this"* — then close the app
   completely. The reminder will still arrive.

> **iPhone note:** iOS only delivers web push to apps added to the Home Screen.
> Do Step 4's *Add to Home Screen* first, then open it from the icon and enable
> notifications there.

---

## Step 6 — Connect Gmail and Calendar (5 min, optional)

Skip this if you don't want VIRANI touching your email.

**6a. Create the Google app**

1. Go to <https://console.cloud.google.com/projectcreate> → create a project
   called `VIRANI` → **Create**
2. Left menu → **APIs & Services** → **Library**. Search for and **Enable**:
   - **Gmail API**
   - **Google Calendar API**
3. Left menu → **OAuth consent screen**
   - User type: **External** → **Create**
   - App name `VIRANI`, your email in both support fields → **Save and continue**
   - Scopes: **Save and continue** (VIRANI asks for them at runtime)
   - **Test users** → **Add users** → add your own Gmail address → **Save**
4. Left menu → **Credentials** → **Create credentials** → **OAuth client ID**
   - Type: **Web application**, name `VIRANI`
   - Under **Authorised redirect URIs** → **Add URI**, paste exactly:
     `https://YOUR-URL.onrender.com/api/google/callback`
   - **Create**, then copy the **Client ID** and **Client secret**

**6b. Give them to VIRANI**

1. Render → your service → **Environment**
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` → **Save changes**
3. Once it redeploys, open VIRANI → **⚙ Settings** → **Connect Google**
4. Approve the access. Google will warn the app is unverified — that is normal
   for an app only you use: **Advanced** → **Go to VIRANI (unsafe)** → **Continue**

Now try: *"Do I have any unread email?"* or *"What's on my calendar tomorrow?"*

---

## Step 7 — Make memory permanent (3 min, recommended)

Render's free disk is wiped on every redeploy. Upstash keeps your memories,
reminders and Google connection forever.

1. Go to <https://upstash.com> → sign in with GitHub → **Create Database**
2. Any name, pick the region nearest you, free tier → **Create**
3. Scroll to **REST API** and copy the two values:
   `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
4. Render → **Environment** → paste both, and change `MEMORY_BACKEND` to
   `upstash` → **Save changes**

---

## Step 8 — Keep it awake 24/7 (2 min)

Render's free tier sleeps after 15 idle minutes, which would delay reminders.

1. Go to <https://uptimerobot.com> → free account
2. **Add New Monitor** → type **HTTP(s)**
3. URL: `https://YOUR-URL.onrender.com/health`, interval **5 minutes** → **Create**

VIRANI is now genuinely always on.

---

## Step 9 — The cinematic voice (3 min, optional)

The free device voice is fine. This one sounds like the film.

1. Sign up at <https://elevenlabs.io> (free tier: ~10,000 characters a month —
   roughly 150 spoken replies)
2. Profile menu → **API Keys** → create one and copy it
3. Optional: browse the **Voice Library**, pick a voice you like, and copy its
   **Voice ID**. The default is *Adam* — deep and calm.
4. Render → **Environment**:
   - `TTS_PROVIDER` → `elevenlabs`
   - `ELEVENLABS_API_KEY` → your key
   - `ELEVENLABS_VOICE_ID` → the voice id (skip to keep Adam)
5. **Save changes**. In VIRANI → ⚙ Settings → **Voice**, a **Cinematic voice**
   switch now appears.

If the quota runs out or the key stops working, VIRANI silently drops back to
your device's voice — it never goes mute.

---

## Step 10 — Location awareness (30 seconds, optional)

⚙ Settings → **Awareness** → **Use my location** → allow the browser prompt.

Now *"what's the weather"* means where you actually are, and *"find a pharmacy
near me"* opens the map centred on you. Coordinates are sent with the message
and never stored.

**Keep screen awake while listening** is on by default — without it the phone
locks mid-conversation and stops hearing you.

---

## Optional extras

**A spoken morning briefing.** Either say *"Virani, brief me every morning at
eight"*, or set `DAILY_BRIEFING_TIME=08:00` in Render's Environment. At that time
it gathers your weather, calendar, unread email, reminders and headlines, and
pushes the whole briefing to your phone.

**Keep your login across redeploys.** Render generates `SESSION_SECRET` for you.
If you ever change it, every device has to type the PIN again.

**Change its name or wake word.** Set `ASSISTANT_NAME` and `WAKE_WORD` in
Environment. Pick a wake word that is easy for a speech engine — two or three
syllables, and not a common English word.

**Microsoft Teams as well.** Set `MicrosoftAppId` and `MicrosoftAppPassword`, and
point your bot's messaging endpoint at `https://YOUR-URL.onrender.com/api/messages`.
The Teams app package is in `appPackage/`.

---

## Checking it yourself

Open `https://YOUR-URL.onrender.com/health` in a browser. You should see the
assistant name, the AI provider, and how many tools loaded (31 without Google,
37 with it).

Something not working? → [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
