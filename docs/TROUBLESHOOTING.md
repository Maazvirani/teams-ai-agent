# 🆘 Troubleshooting

Work through the symptom that matches yours. Most problems are a missing value in
Render's **Environment** tab or a wrong URL.

---

### The agent doesn't reply in Teams at all

1. **Check it's alive:** open `https://YOUR-APP.onrender.com/health`. If you don't see
   `{"status":"ok"...}`, the host is down — check Render → your service → **Logs**.
2. **Check the endpoint URL:** in the Teams Developer Portal → Bot management → your
   bot → **Endpoint address** must be exactly
   `https://YOUR-APP.onrender.com/api/messages` (note the `/api/messages` at the end).
3. **Check the credentials match:** `MicrosoftAppId` in Render must equal the **Bot ID**,
   and `MicrosoftAppPassword` must be the **client secret** you created. If you lost the
   secret, create a new one and update Render.
4. **First message is slow?** On Render's free plan the app sleeps. Set up UptimeRobot
   (SETUP Step 9) so it stays awake.

---

### It replies "I ran into a problem answering that"

This is the AI brain failing. In Render → **Logs**, look for a line starting with `[bot] AI error`.

- **`GEMINI_API_KEY is not set`** → add your Gemini key in Render → Environment.
- **`API error (400/403)`** → the key is wrong, or the model name is unavailable in your
  region. Try `GEMINI_MODEL=gemini-1.5-flash`. Or switch to Groq (below).
- **`429` / quota** → you've hit the free daily limit. Wait, or add a second key / switch provider.
- **Timed out** → the AI took too long. Usually temporary; try again.

---

### Gemini isn't available in my country

Switch to **Groq** (free, global, very fast). In Render → Environment:
- `AI_PROVIDER` = `groq`
- `GROQ_API_KEY` = *(get one free at https://console.groq.com/keys)*
- `GROQ_MODEL` = `llama-3.3-70b-versatile`

Save Changes → Render redeploys. No code changes needed.

---

### The agent "forgets" everything after I update it

You're on `MEMORY_BACKEND=file`, which resets when Render redeploys. For permanent
memory, switch to **Upstash** (free): create a Redis database at https://upstash.com,
then in Render set `MEMORY_BACKEND=upstash`, `UPSTASH_REDIS_REST_URL`, and
`UPSTASH_REDIS_REST_TOKEN`. (See SETUP Step 6.)

---

### The agent gives wrong or made-up answers

It can only be as accurate as **`config/knowledge.md`**. If it's guessing:
- Add the missing facts to `config/knowledge.md` (edit on GitHub → Commit → Render redeploys).
- The stricter you make the rules in `config/business.json` → `rules`, the less it improvises.

---

### I can't upload / add the app in Teams

- Use the **Microsoft 365 Developer Program** account (SETUP Step 1) — custom apps are
  enabled there by default.
- On a work/school account, an admin must allow **custom app upload (sideloading)**.
- Using the **Developer Portal → Preview in Teams** button avoids manual uploading entirely.

---

### I want to change the agent's name, greeting, or tone

Edit **`config/business.json`** on GitHub (pencil ✏️ → Commit). Render redeploys in a
minute or two. No code needed.

---

### Render build failed

Open Render → your service → **Logs / Events** and read the error. Most common cause is
deploying the wrong branch — make sure Render is building the branch that has this code
(merge it into `main`, or point Render at the correct branch in **Settings**).

---

### Still stuck?

Copy the relevant lines from Render → **Logs** (they usually name the exact problem) and
work from there. The log line that starts with `[bot]`, `[adapter]`, `[memory]`, or
`[prompt]` tells you which part failed.
