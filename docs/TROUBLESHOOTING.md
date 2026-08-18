# Troubleshooting

Find your symptom. Each fix is the whole fix.

---

## Signing in

**"OWNER_PIN is not set on the server yet."**
The server has no PIN, so it refuses to let anyone in — that is deliberate.
Render → your service → **Environment** → add `OWNER_PIN` → **Save changes**.

**"Wrong PIN" but the PIN is right.**
Check for a space at the end of the value in Render. The comparison is exact.

**It logs me out every time it redeploys.**
`SESSION_SECRET` is changing. Set a fixed one (Render → Environment), or use
`node scripts/generate-keys.js` to make one.

---

## Voice

**The microphone button does nothing / "no speech recognition".**
Speech recognition needs **Chrome** (Android or desktop) or **Safari on iOS 17+**.
Firefox does not support it. Everything still works by typing.

**It hears me but never answers.**
Check the microphone permission: browser address bar → the padlock → Microphone →
Allow. On Android also check Settings → Apps → Chrome → Permissions.

**The wake word doesn't trigger.**
- Wake-word mode has to be switched on — the chip at the top must read **WAKE WORD: ON**.
- The app must be open and on-screen. No web app can listen while closed; that is
  a browser rule, not a bug.
- Start the sentence with the wake word: *"Virani, what's the time"*, not
  *"What's the time, Virani"*.
- If your accent trips it up, pick an easier `WAKE_WORD` — try `jarvis` or `vira`.

**It answers itself / hears its own voice.**
It already pauses listening while speaking. If it still loops, use headphones or
turn off **Speak replies** in Settings while you work out the volume.

**The voice sounds robotic.**
Settings → **Voice** → pick a different one. On Android install *Google Speech
Services* voices; on Windows add voices in Settings → Time & Language → Speech.
The list only shows what your device has.

**No voices in the list at all.**
Some devices load them late — close and reopen the app once.

---

## Reminders and notifications

**Reminders don't arrive when the app is closed.**
1. Settings → **Notifications** → **Enable on this device**, then **Send test
   notification**. If the test doesn't arrive, the problem is permissions, not
   reminders.
2. **iPhone:** you must add VIRANI to the Home Screen and open it from that icon.
   Safari tabs cannot receive push.
3. Make sure the server is awake — see the UptimeRobot step in SETUP.

**Reminders fire late by a few minutes.**
The free host sleeps when idle. UptimeRobot pinging `/health` every 5 minutes
fixes it. The scheduler itself checks every 30 seconds.

**Everything I set is gone after a redeploy.**
You are on the `file` memory backend and Render wiped the disk. Switch to Upstash
— SETUP Step 7. Five minutes, permanent fix.

**A reminder set for the wrong time.**
Check `OWNER_TIMEZONE` in Render (e.g. `Asia/Karachi`). The server clock is UTC;
that variable is what translates "6pm" into your 6pm.

---

## Gmail and Calendar

**"The Google account is not connected yet."**
Settings → **Connect Google**. If the button is missing, `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are not set in Render.

**"redirect_uri_mismatch" from Google.**
The URI in your Google Cloud credentials must match *exactly*, including https
and no trailing slash:
`https://YOUR-URL.onrender.com/api/google/callback`
Also check `PUBLIC_URL` in Render has no trailing slash.

**"Access blocked: VIRANI has not completed verification."**
Your Google account isn't a test user yet. Google Cloud → **OAuth consent
screen** → **Test users** → **Add users** → your own address.

**"Google did not return a refresh token."**
Google only issues one on a fresh approval. Go to
<https://myaccount.google.com/permissions>, remove VIRANI, then connect again.

**It can read email but not send.**
The Gmail *send* scope was added after you connected. Disconnect in Settings and
connect again to re-approve.

---

## The brain

**"API key not valid."**
`GEMINI_API_KEY` is wrong or has a stray space. Make a fresh one at
<https://aistudio.google.com/apikey>.

**"429" or "quota exceeded".**
You hit Gemini's free-tier rate limit. Wait a minute, or switch to Groq:
`AI_PROVIDER=groq` plus a free key from <https://console.groq.com/keys>.

**It makes things up instead of searching.**
Ask more explicitly — *"search the web for…"*. If it happens constantly, the
model may be ignoring instructions; try `GEMINI_MODEL=gemini-2.5-flash`.

**"The model returned an empty answer."**
Usually a safety filter on the phrasing. Rephrase and try again.

**Answers are too long for speech.**
Tell it once: *"Virani, remember I want answers under two sentences."* It saves
that permanently.

---

## Deployment

**The Render build fails.**
Open the log. Almost always Node's version — this needs Node 18+, which Render's
default already is. If it complains about `package-lock.json`, delete the lock
file in GitHub and redeploy.

**The page loads but every request 500s.**
Check the Render log for the real error. A missing `GEMINI_API_KEY` is the usual
cause.

**Changes to the app don't show on my phone.**
The service worker cached the old version. Pull down to refresh, or uninstall the
home-screen app and add it again.

---

## Still stuck?

Run the self-test — it exercises the whole agent loop without touching the
network or spending any quota:

```bash
node scripts/selftest.js
```

If those ten pass, the code is sound and the problem is configuration: check
`/health` and the Render environment variables.
