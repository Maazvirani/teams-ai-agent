'use strict';

/**
 * Premium speech.
 *
 * By default VIRANI speaks with the voice engine built into your browser —
 * free, instant, no key. If you want the cinematic version, set an ElevenLabs
 * key and the server synthesises the audio instead.
 *
 * The browser always keeps its own engine as a fallback, so a missing key, a
 * spent quota or a network blip degrades the voice rather than silencing it.
 */

const { config } = require('./config');
const { request } = require('./http');

function available() {
  return config.tts.provider === 'elevenlabs' && Boolean(config.tts.apiKey);
}

async function synthesize(text) {
  if (!available()) throw new Error('Premium voice is not configured.');

  const clean = String(text || '')
    .replace(/[*_`#]/g, '')
    .trim()
    .slice(0, config.tts.maxChars);
  if (!clean) throw new Error('Nothing to say.');

  const url =
    `https://api.elevenlabs.io/v1/text-to-speech/${config.tts.voiceId}` +
    '?output_format=mp3_44100_128';

  const res = await request(url, {
    method: 'POST',
    timeout: 30000,
    headers: {
      'xi-api-key': config.tts.apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: clean,
      model_id: config.tts.model,
      voice_settings: {
        stability: config.tts.stability,
        similarity_boost: config.tts.similarity,
        speed: config.tts.speed,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

module.exports = { available, synthesize };
