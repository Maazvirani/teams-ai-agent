# 🛠️ Setup Guide — Go Live in About an Hour (No Terminal Needed)

This guide takes you from zero to a working, 24/7 AI support agent inside Microsoft
Teams. **You do not need to write code or use a terminal.** You'll click through a
few free websites. Do the steps **in order** and copy the values it tells you to
copy into a notepad as you go — you'll need them near the end.

> 💡 **Do this once for yourself first.** After you've done it once, repeating it for
> paying clients takes 10–15 minutes. See `docs/RESELLING.md`.

Here's a map of what we'll set up:

```
 Your code (GitHub)  ──►  Render.com (free host, runs 24/7)  ──►  the agent lives at
                                                                   https://YOUR-APP.onrender.com
        │                                                                 ▲
        │ Google Gemini (free AI brain) ──────────────────────────────────┘
        │
 Teams Developer Portal registers the bot and points Teams at that URL
        │
 Microsoft Teams  ──►  customers chat with your agent
```

Values you'll collect along the way (keep them in a notepad):
- ✅ Render app URL — `https://YOUR-APP.onrender.com`
- ✅ Bot App ID
- ✅ Bot client secret (password)
- ✅ Gemini API key

---

## Step 1 — Get Microsoft Teams for free

You need a Teams account where you're allowed to **add custom apps**. The free
**Microsoft 365 Developer Program** gives you exactly that: a full Teams workspace
with custom-app uploading already switched on.

1. Go to **https://developer.microsoft.com/microsoft-365/dev-program**.
2. Click **Join now / Sign up** and sign in with any Microsoft account (or create one — it's free).
3. Follow the prompts to set up your **instant sandbox**. You'll get a new email address like `you@yourname.onmicrosoft.com` and an admin password. **Save these.**
4. Open **https://teams.microsoft.com** and sign in with that new `onmicrosoft.com` account.

> **Already have a work/school Teams?** You can use it **only if** your IT admin allows
> "custom app upload / sideloading." Many companies block it. If you're not sure, use
> the free Developer Program account above — it always works.
>
> **Can't get into the Developer Program?** (Microsoft sometimes limits eligibility.)
> Alternative: start a free **Microsoft 365 Business Basic** 1-month trial, which
> includes Teams. For selling, most business clients already have Teams.

---

## Step 2 — Put this code on GitHub (it already is 🎉)

This project already lives in your GitHub repository. You just need it on a branch
Render can read.

- Your code is on branch **`claude/teams-ai-agent-builder-03u1xu`**.
- Easiest option: on GitHub, open the Pull Request for that branch and **merge it into `main`** (or your default branch). Render deploys nicely from `main`.
- Or you can point Render directly at the branch in Step 3 — both work.

*(You don't need to download anything or use Git on your computer.)*

---

## Step 3 — Deploy to Render.com (free, runs on the internet)

Render will run your agent and give it a public web address.

1. Go to **https://render.com** and **Sign up** — choose **"Sign in with GitHub"** so it can see your repositories.
2. Click **New +** → **Blueprint**.
3. Select your **`teams-ai-agent`** repository. Render finds the included `render.yaml` and shows a service called **teams-ai-support-agent**.
4. Click **Apply** / **Create**. Render starts building. (First build takes 2–4 minutes.)
5. When it's done, open the service and copy its URL at the top — it looks like
   **`https://teams-ai-support-agent-xxxx.onrender.com`**. ✅ **Save this URL.**
6. Test it: open `https://YOUR-APP.onrender.com/health` in your browser. You should
   see `{"status":"ok", ...}`. That means the agent is alive. (The AI and Teams parts
   come next.)

> Don't worry that some settings are empty — we fill in the secret values in Step 6.
> If the "No Blueprint" option confuses you, you can instead choose **New + → Web
> Service**, pick the repo, and Render will still read `render.yaml`.

---

## Step 4 — Get your free Google Gemini API key (the AI brain)

1. Go to **https://aistudio.google.com/apikey** and sign in with a Google account.
2. Click **Create API key** → **Create API key in new project**.
3. Copy the key (a long string starting with `AIza...`). ✅ **Save it.**

> Gemini's free tier is generous and works from Pakistan. If Google AI Studio isn't
> available for you, use **Groq** instead (also free) — see "Switching the AI brain"
> at the bottom of this guide.

---

## Step 5 — Register the bot in the Teams Developer Portal (no credit card, no Azure)

This is how Teams learns *where* your agent lives. We use the **Teams Developer
Portal**, which does this without any Azure subscription or payment card.

1. Go to **https://dev.teams.microsoft.com** and sign in with your **Teams account from Step 1** (the `onmicrosoft.com` one).
2. In the left menu, open **Tools** → **Bot management**.
3. Click **＋ New Bot**. Give it a name (e.g. *Acme Support Bot*) and click **Add**.
4. Open the bot you just created. Under **Configure → Endpoint address**, paste:
   ```
   https://YOUR-APP.onrender.com/api/messages
   ```
   (use your real Render URL from Step 3) and **Save**.
5. Copy the **Bot ID** shown on this page — it's a long code like `12345678-abcd-...`. ✅ **Save it as your "App ID".**
6. Go to **Client secrets** → **Add a client secret for your bot** → **Add**. A secret
   value appears **once** — copy it immediately. ✅ **Save it as your "Bot password".**

---

## Step 6 — Put your secrets into Render, then redeploy

Now we hand Render the keys it needs.

1. In Render, open your **teams-ai-support-agent** service → **Environment** (left menu).
2. Set / confirm these values (click **Edit** and fill the blanks):

   | Key | Value |
   |---|---|
   | `MicrosoftAppId` | your **Bot ID** from Step 5 |
   | `MicrosoftAppPassword` | your **Bot password** from Step 5 |
   | `MicrosoftAppType` | `MultiTenant` |
   | `MicrosoftAppTenantId` | *(leave blank for MultiTenant)* |
   | `AI_PROVIDER` | `gemini` |
   | `GEMINI_API_KEY` | your **Gemini key** from Step 4 |
   | `GEMINI_MODEL` | `gemini-2.0-flash` |
   | `MEMORY_BACKEND` | `file` (or `upstash` — see the box below) |

3. Click **Save Changes**. Render automatically **redeploys** (1–2 minutes).

> 🧠 **Want memory that never forgets, even after updates?** The `file` setting is fine
> to start, but on Render's free plan the memory resets when you redeploy. For
> permanent memory, sign up free at **https://upstash.com**, create a **Redis** database,
> copy its **REST URL** and **REST TOKEN**, paste them into Render as
> `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, and set `MEMORY_BACKEND=upstash`.

---

## Step 7 — Customize your agent (the fun part)

Before showing it to customers, give it the real business info. You can edit these two
files **right on GitHub** (open the file → click the ✏️ pencil → make changes → **Commit**).
Render redeploys automatically after each commit.

- **`config/business.json`** — business name, agent name, greeting, tone, phone, email, hours.
- **`config/knowledge.md`** — everything the agent should know: services, prices, policies, FAQ.

> The agent will **only** state facts that are in these files, so the more you add, the
> more helpful (and safe) it is. Keep it accurate.

---

## Step 8 — Add the agent to Teams and test it

1. Back in **https://dev.teams.microsoft.com** → **Apps** → **＋ New app**. Give it a name.
2. Fill in **Basic information** (short/long description, developer name, website — anything valid).
3. Go to **App features** → **Bot** → choose **Select an existing bot** → pick the bot from Step 5.
   Tick the scopes **Personal**, **Team**, and **Group Chat**, then **Save**.
4. Click **Preview in Teams** (top right). Teams opens with your agent in a personal chat.
5. Say hello! Try: *"What are your prices?"*, *"What are your hours?"*, *"How do I get started?"*
6. Type **help** to see commands, or **reset** to clear the conversation memory.

🎉 **That's your AI agent, live in Teams.**

*(Prefer to build the app package by hand instead of the portal? This repo already
includes `appPackage/manifest.json` and icons — replace `<<MICROSOFT_APP_ID>>` in the
manifest with your Bot ID in both places, zip the three files in `appPackage/`, and
upload the zip in Teams via **Apps → Manage your apps → Upload a custom app**.)*

---

## Step 9 — Keep it awake 24/7 (free)

Render's free plan puts your agent to sleep after 15 minutes of no traffic, which would
make the first message slow. A free "uptime pinger" keeps it awake around the clock.

1. Go to **https://uptimerobot.com** and sign up (free).
2. **Add New Monitor** → type **HTTP(s)** → URL: `https://YOUR-APP.onrender.com/health` → interval **5 minutes** → **Create**.

Now something pings your agent every 5 minutes, so it stays awake and responds instantly, 24/7. ✅

---

## ✅ You're done

Your professional AI support agent now:
- lives on the internet and runs 24/7,
- answers customers in Teams with memory and a professional tone,
- costs **PKR 0** to run on these free tiers,
- and is ready to be rebranded and sold — see **`docs/RESELLING.md`**.

---

## Switching the AI brain (optional)

In Render → Environment:
- **Groq (free, very fast):** set `AI_PROVIDER=groq`, add `GROQ_API_KEY` (get one at
  https://console.groq.com/keys), optionally `GROQ_MODEL=llama-3.3-70b-versatile`.
- **OpenAI (paid):** set `AI_PROVIDER=openai`, add `OPENAI_API_KEY`, optionally
  `OPENAI_MODEL=gpt-4o-mini`.

Save Changes → Render redeploys → done. No code edits needed.
