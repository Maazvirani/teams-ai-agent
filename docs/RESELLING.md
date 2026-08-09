# 💼 Reselling Playbook — Turn This Into a Business

This template is designed so you can sell the **same agent, rebranded**, to many
clients. Here's how to run it as a small business from Pakistan (or anywhere).

---

## The two ways to deliver to a client

### Option A — "Managed for you" (recommended, most profitable)
You host and run the agent; the client just uses it and pays you monthly.

1. Create a **separate Render service** per client (or a separate free Render account per client to stay well inside free limits).
2. Deploy this repo, then edit **`config/business.json`** and **`config/knowledge.md`** with *their* business details.
3. Register a bot for them in the Teams Developer Portal, add it to **their** Teams.
4. Charge a **monthly fee** (see pricing below). You keep control; they can't walk off with your setup.

### Option B — "One-time build & handover"
You set everything up in the client's own accounts and hand it over for a one-time fee.
Simpler for you long-term, but no recurring income and less control.

> **Recommendation:** Lead with **Option A**. Recurring revenue is the whole point.

---

## Rebranding checklist (per client) — ~10–15 minutes

For each new client, change only these:

1. **`config/business.json`**
   - `businessName`, `agentName`, `industry`, `country`, `languages`
   - `greeting` (their welcome message)
   - `tone` (match their brand voice)
   - `supportEmail`, `supportPhone`, `websiteUrl`, `businessHours`
2. **`config/knowledge.md`** — replace with their real services, prices, policies, FAQ. **This is the most important step** — it's what makes the agent smart about *their* business.
3. **`appPackage/`** icons — swap `color.png` (192×192) and `outline.png` (32×32, white on transparent) for their logo, and update the name/description in the Teams Developer Portal app.
4. **Register a new bot** for them (Step 5 of `docs/SETUP.md`) so each client is isolated with their own credentials.
5. **Add their Gemini key** (or reuse yours if within free limits — but a key per client keeps usage separate and safer).

That's it. Everything else stays the same.

---

## Keep clients separate (important)

- **One Render service per client.** Never share one deployment between businesses — their knowledge bases and memories must not mix.
- **One bot registration per client.** Separate App ID / password each time.
- **One config per client.** The `business.json` + `knowledge.md` pair *is* the client's brain.
- Consider a **naming convention**: `acme-support-agent`, `zainab-clinic-agent`, etc.

---

## What to charge (ideas for the Pakistan / SMB market)

These are starting points — adjust to your market.

| Package | One-time setup | Monthly |
|---|---|---|
| **Starter** (FAQ bot, their info) | PKR 8,000–15,000 | PKR 3,000–5,000 |
| **Business** (bigger knowledge base, monthly updates, permanent memory via Upstash) | PKR 20,000–35,000 | PKR 6,000–12,000 |
| **Premium** (custom tone, multiple languages, priority updates, reporting) | PKR 40,000+ | PKR 15,000+ |

Your running costs on the free tiers are **near zero**, so most of this is profit.
When a client grows past the free limits, move them to a paid Render plan
(~$7/month) or a paid AI plan and price that into their monthly fee.

---

## A simple sales pitch

> "I'll set up a professional AI assistant inside your Microsoft Teams that answers
> your customers' questions 24/7 — prices, hours, services, anything you want — in a
> polished, on-brand tone. It remembers your customers and never sleeps. Setup is a
> one-time fee, then a small monthly fee to host and keep it updated."

**Great first clients:** clinics, salons, real-estate agents, IT/software shops,
coaching centers, online stores, travel agencies — anyone who answers the same
customer questions again and again.

---

## Staying inside "free" as you grow

- **Render free plan:** fine for low/medium traffic. Keep it awake with UptimeRobot (see SETUP Step 9). Upgrade a client to the $7 plan when they need always-on speed or more resources — and bill them for it.
- **Gemini free tier:** has daily limits. For many small businesses this is plenty. Give heavy clients their own key, or move them to a paid tier.
- **Upstash free tier:** enough for thousands of messages of memory. Upgrade only for very busy clients.

Start free, upgrade only the clients who out-grow it — and pass that cost on with margin.
