# Getting V.I.R.A.N.I. live

**No credit card. No payment details. No terminal. No commands to type.**
Everything below is done by clicking through free websites in a browser.

About 30 minutes end to end. After Part 1 (about 15 minutes) you have a working
assistant you can talk to.

---

## What you will sign up for

All four are free, and none of them asks for a card:

| Service | What it gives VIRANI | Cost |
|---|---|---|
| **Google AI Studio** | The brain that thinks | Free |
| **Back4App Containers** | The cloud that runs it 24/7 | Free |
| **Upstash** | Permanent memory | Free |
| **UptimeRobot** | Keeps it awake | Free |

> **If any page asks for card or payment details, stop and back out.** None of
> these four should. If one does, use the alternatives in
> [`NO-CREDIT-CARD.md`](NO-CREDIT-CARD.md) instead.
>
> Free plans do change. These were checked in August 2026, but you are the one
> looking at the signup page — trust what you see over what this document says.

---

# Part 1 — Get it talking

## Step 1 — The brain (3 min)

1. Open <https://aistudio.google.com/apikey>
2. Sign in with any Google account
3. Click **Create API key** → **Create API key in new project**
4. Copy the key. It starts with `AIza`. Keep the tab open — you need it shortly.

This is Google Gemini's free tier. No card, no billing.

---

## Step 2 — The memory (4 min)

Do this now rather than later, so VIRANI never forgets anything from day one.

1. Open <https://upstash.com> → **Sign Up** → continue with GitHub or Google
2. Click **Create Database**
3. Name it `virani`, pick the region closest to you, leave it on the free plan
4. Click **Create**
5. Scroll down to the **REST API** section
6. Copy these two values somewhere safe:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

> **Watch out for Upstash's copy button.** It copies the whole line, including
> the name and the quote marks:
>
> ```
> UPSTASH_REDIS_REST_URL="https://your-db-12345.upstash.io"
> ```
>
> When you paste into a hosting dashboard, the **Name** and **Value** are
> separate boxes. The Value box should contain only the address itself:
>
> ```
> https://your-db-12345.upstash.io
> ```
>
> VIRANI now strips a stray name and quotes automatically, so a whole pasted
> line still works — but clean values are easier to read back later.
>
> The **token is a password.** Keep it private; the URL on its own is harmless.

This is what makes VIRANI remember your name, your contacts and your reminders
permanently, even after the server restarts.

---

## Step 3 — The cloud (8 min)

**Go straight to the Containers dashboard**, not the main Back4App site. Back4App
sells two different products and it is easy to land in the wrong one:

> **<https://containers.back4app.com>**

Sign up there — **Continue with GitHub** is easiest, since your code is on GitHub.

### Screen by screen

The button you are looking for appears **one screen later** than you'd expect.
"Import from GitHub" is not on the first screen — you have to choose Container
and name the app first.

**Screen 1 — the dashboard**
Click **New App** (top right). Not "Create new app" — the button reads **New App**.

**Screen 2 — pick the type**
Choose **Container**. If you see two choices, the other one is *Backend as a
Service*, which is Back4App's database product — **not** what you want. If you
only ever see the database product, you are on the main `back4app.com` site
rather than `containers.back4app.com`.

Give the app a name: `virani`.

**Screen 3 — connect the code**
*Now* you will see **Import from GitHub**. Click it and authorise Back4App.

- When GitHub asks which repositories, choose **Only select repositories**
- Pick `teams-ai-agent`
- Back on Back4App, select `teams-ai-agent` from the list

**Screen 4 — configure**
This screen has the app name, **branch**, root directory, auto-deploy and
environment variables.

- **Branch** — change it from `main` to:

  ```
  claude/jarvis-ai-voice-agent-1xaoy5
  ```

- **Root directory** — leave blank
- Leave the build settings alone; Back4App finds the `Dockerfile` by itself
- If it asks for a **port**, enter `7860`

### Now add the settings

Find **Environment Variables** on that same screen. **You only need four** —
everything else (your name, timezone, city, wake word, which memory to use) is
already committed in `config/virani.json`, so there is nothing else to type.

| Name | Value |
|---|---|
| `OWNER_PIN` | Any number you'll remember — this is your password |
| `GEMINI_API_KEY` | The `AIza…` key from Step 1 |
| `UPSTASH_REDIS_REST_URL` | From Step 2 — the address only |
| `UPSTASH_REDIS_REST_TOKEN` | From Step 2 — the token only |

Then click **Deploy**. The first build takes three to five minutes.

> **Want to change your name, city or wake word later?** Edit
> `config/virani.json` in GitHub — click the pencil icon, change the text, commit.
> Back4App rebuilds automatically. No dashboard fiddling.

> **Your PIN is your password.** VIRANI can read your email and calendar once
> you connect Google, so anyone with this PIN has that access too. Don't use 1234.

---

## Step 4 — Tell it its own address (2 min)

1. When the deploy finishes, Back4App shows your app's URL. It looks something
   like `https://virani-abc123.b4a.run`. Copy it.
2. Go back to **Settings** → **Environment Variables**
3. Add one more:

   | Name | Value |
   |---|---|
   | `PUBLIC_URL` | Your URL, **with no slash on the end** |

4. Save. It redeploys automatically.

**Check it worked:** open your URL with `/health` on the end. You should see
`"status":"ok"` and `"tools":31`.

> A trailing slash here is the most common mistake in the whole setup — it
> breaks the Google connection later. `https://virani-abc123.b4a.run` is right.
> `https://virani-abc123.b4a.run/` is wrong.

---

## Step 5 — Open it and install it (3 min)

1. Open your URL on your phone — **Chrome** on Android, **Safari** on iPhone
2. Type your PIN → **Authenticate**
3. Tap the glowing core and say: *"What's the weather in Karachi tomorrow?"*
4. Allow the microphone when asked
5. Install it to your home screen so it behaves like a real app:
   - **Android:** menu **⋮** → *Add to Home screen* → *Install*
   - **iPhone:** Share **↑** → *Add to Home Screen*

**Wake word:** tap **WAKE WORD: OFF** at the top to turn it on, then start
sentences with *"Virani…"*. The app must be open on screen for this — no web app
can listen while closed. That is a browser rule, not a limit of your build.

---

# Part 2 — Make it a real 24/7 assistant

## Step 6 — Notifications (3 min)

This is what makes reminders arrive when the app is closed.

1. Open VIRANI **from its home-screen icon** — not a browser tab
2. **⚙ Settings** → **Notifications** → **Enable on this device** → allow
3. Tap **Send test notification**. It should appear on your phone.
4. Say: *"Virani, remind me in two minutes to test this."* Close the app fully
   and wait.

> **iPhone:** iOS only delivers notifications to apps added to the Home Screen.
> If you skipped that in Step 5, go back and do it first.

---

## Step 7 — Keep it awake (3 min)

Free containers go to sleep when nothing is talking to them, which would delay
your reminders. A free pinger keeps it awake.

1. Open <https://uptimerobot.com> → create a free account
2. **Add New Monitor**
3. Monitor Type: **HTTP(s)**
4. URL: your address with `/health` on the end
5. Monitoring Interval: **5 minutes**
6. **Create Monitor**

---

# Part 3 — Give it more reach

Optional. Each one unlocks a category of commands. Do them in any order.

## Step 8 — Gmail and Calendar (8 min)

**First, create the Google app:**

1. Open <https://console.cloud.google.com/projectcreate> → name it `VIRANI` → **Create**
2. **APIs & Services** → **Library**. Search for and **Enable** both:
   - **Gmail API**
   - **Google Calendar API**
3. **OAuth consent screen** → User type **External** → **Create**
   - App name `VIRANI`, your email in both support fields
   - **Save and continue** through the scopes page
4. **Test users** → **Add users** → add your own Gmail address → **Save**
5. **Credentials** → **Create credentials** → **OAuth client ID**
   - Application type: **Web application**, name `VIRANI`
   - **Authorised redirect URIs** → **Add URI** → paste your address with
     `/api/google/callback` on the end
   - **Create**, then copy the **Client ID** and **Client secret**

**Then hand them over:**

6. Back4App → **Settings** → **Environment Variables** → add:

   | Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | From step 5 |
   | `GOOGLE_CLIENT_SECRET` | From step 5 |

7. Once it redeploys: VIRANI → **⚙ Settings** → **Connect Google** → approve

Google warns that the app is unverified. That is normal for an app only you use:
**Advanced** → **Go to VIRANI (unsafe)** → **Continue**.

Now try: *"Do I have any unread email?"* or *"What's on my calendar tomorrow?"*

---

## Step 9 — A more realistic voice (4 min)

The device voice is fine. This one sounds like the film. Free tier is about
10,000 characters a month — roughly 150 spoken replies. No card required.

1. <https://elevenlabs.io> → free account
2. Profile menu → **API Keys** → create one and copy it
3. Optional: **Voice Library** → pick a voice → copy its **Voice ID**
4. Back4App → **Environment Variables**:

   | Name | Value |
   |---|---|
   | `TTS_PROVIDER` | `elevenlabs` |
   | `ELEVENLABS_API_KEY` | Your key |
   | `ELEVENLABS_VOICE_ID` | `pNInz6obpgDQGcFmaJgB` (deep, calm — or your own) |

If the quota runs out, VIRANI falls back to the device voice automatically. It
degrades, it never goes silent.

---

## Step 10 — Location and the morning briefing (2 min)

**Location:** VIRANI → **⚙ Settings** → **Awareness** → **Use my location** → allow.

Now *"what's the weather"* means where you actually are, and *"find a pharmacy
near me"* opens the map centred on you. Coordinates are sent with the message and
never stored.

Leave **Keep screen awake while listening** switched on, or the phone locks
mid-conversation and stops hearing you.

**Morning briefing:** just say *"Virani, brief me every morning at eight."*

Or set it server-side — Back4App → Environment Variables → `DAILY_BRIEFING_TIME`
= `08:00`. At that time it gathers your weather, calendar, unread email,
reminders and headlines and pushes the whole briefing to your phone, spoken.

---

# Try saying

```
Virani, what's the weather tomorrow?
Virani, remind me to call the bank at 4pm.
Virani, save Ali's number as 0328 263 2052.
Virani, WhatsApp Ali that I'm running twenty minutes late.
Virani, call Ali.
Virani, add milk, eggs and coffee to my shopping list.
Virani, note that the office wifi password is bluebird-42.
Virani, what's 17.5 percent of 240,000 split three ways?
Virani, how much is 500 dollars in rupees?
Virani, find a pharmacy near me.
Virani, remember that I prefer short answers.
Virani, what's happening in Pakistan today?
Virani, play the Interstellar soundtrack on YouTube.
Virani, do I have any unread email?
```

---

# Every setting

| Name | Value | Needed for |
|---|---|---|
| `OWNER_PIN` | Your number | Signing in — required |
| `GEMINI_API_KEY` | `AIza…` | Thinking — required |
| `SESSION_SECRET` | Long random string | Staying signed in |
| `PUBLIC_URL` | Your URL, no trailing slash | Google + notifications |
| `MEMORY_BACKEND` | `upstash` | Permanent memory |
| `UPSTASH_REDIS_REST_URL` | From Upstash | Permanent memory |
| `UPSTASH_REDIS_REST_TOKEN` | From Upstash | Permanent memory |
| `OWNER_NAME` | Maaz | How it addresses you |
| `OWNER_TIMEZONE` | `Asia/Karachi` | Getting "6pm" right |
| `OWNER_CITY` | Karachi | Default weather |
| `WAKE_WORD` | `virani` | What you say aloud |
| `GOOGLE_CLIENT_ID` | From Google Cloud | Gmail + Calendar |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud | Gmail + Calendar |
| `TTS_PROVIDER` | `browser` or `elevenlabs` | Voice quality |
| `ELEVENLABS_API_KEY` | From ElevenLabs | Cinematic voice |
| `DAILY_BRIEFING_TIME` | `08:00` | Automatic briefing |
| `AI_PROVIDER` | `gemini`, `groq`, `openai` | Switching brains |

---

Problems? → [`TROUBLESHOOTING.md`](TROUBLESHOOTING.md)
Host asking for a card? → [`NO-CREDIT-CARD.md`](NO-CREDIT-CARD.md)
