# 🤖 Teams AI Support Agent

A **professional, 24/7 customer-support AI agent for Microsoft Teams** that you can
rebrand and **sell to clients**. It runs on the internet by itself, remembers your
customers, and answers their questions in a polished, professional tone.

Built to be **free to run** (Google Gemini's free AI + free hosting) and deployable
**without ever using a terminal** — you set it up by clicking through free websites.

---

## ✨ What it does

- **Answers customer questions 24/7** about your services, prices, hours, policies — using only the facts you give it (no making things up).
- **Has real memory** — remembers each customer's name and your recent conversation, so replies feel personal and consistent.
- **Sends professional, on-brand messages** — tone, greeting, and contact details are all configurable.
- **Speaks your customer's language** (English, Urdu, and more — it replies in whatever language they write in).
- **Escalates to a human** with your contact details whenever it isn't sure — so it never gives wrong information.

## 🧰 What's inside (you don't need to code)

| You edit this file | To change |
|---|---|
| `config/business.json` | The business name, agent name, greeting, tone, and contact details |
| `config/knowledge.md` | The facts/FAQ the agent answers from (prices, services, hours, policies) |
| `appPackage/` | The Teams app icons and name customers see |

Everything else (`src/`) is the working code — you normally never touch it.

## 🚀 Get it live

👉 **Follow [`docs/SETUP.md`](docs/SETUP.md)** — a click-by-click guide, no terminal needed.

The short version:
1. Get **free** Microsoft Teams (Microsoft 365 Developer Program).
2. **Deploy** this code to **Render.com** (free) straight from GitHub.
3. **Register the bot** in the Teams Developer Portal (no credit card, no Azure).
4. Get a **free Google Gemini** API key (the AI brain).
5. **Add** the app to Teams and start chatting.
6. Keep it awake 24/7 with a **free uptime pinger** (UptimeRobot).

## 💼 Selling these agents

This is a **reusable template**. To make a new agent for a new client, you mostly
just edit the two config files and re-deploy. See [`docs/RESELLING.md`](docs/RESELLING.md)
for a step-by-step playbook, pricing ideas, and how to keep each client separate.

## 🧠 Switching the AI brain

Default is **Google Gemini** (free). You can switch to **Groq** (also free, very fast)
or **OpenAI** (paid) by changing one setting — see `.env.example` and `docs/SETUP.md`.

## 🆘 Something not working?

See [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md).
