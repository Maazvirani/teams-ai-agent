# ============================================================================
#  V.I.R.A.N.I. — container image
#
#  Lets VIRANI run on any host that speaks Docker, which matters because some
#  free platforms ask for a credit card and others do not. Build once, deploy
#  to Hugging Face Spaces, Fly, Railway, a Raspberry Pi — same image.
#
#  Port 7860 is the default Hugging Face Spaces expects; every host that sets
#  its own PORT variable overrides it automatically.
# ============================================================================

FROM node:20-alpine

WORKDIR /app

# Install dependencies first so this layer is cached between code changes.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional && npm cache clean --force

COPY . .

# The file memory backend writes here. Hosts that run as an unprivileged user
# (Hugging Face Spaces runs as uid 1000) need the directory to exist and be
# writable before the process starts.
RUN mkdir -p /app/data && chown -R node:node /app

USER node

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

# The health endpoint is the same one an uptime pinger uses.
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||7860)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
