/* ===========================================================================
   V.I.R.A.N.I. — front end
   Speech in, speech out, and a core that reacts to your voice.
   Everything here runs in the browser; the thinking happens on the server.
   ========================================================================= */

'use strict';

// ── State ────────────────────────────────────────────────────────────────
const S = {
  token: localStorage.getItem('virani.token') || '',
  wakeWord: 'virani',
  name: 'VIRANI',
  prefs: loadPrefs(),
  busy: false,
  micMode: 'off',        // 'off' | 'wake' | 'ptt'
  awaitingCommand: false, // wake word heard, command not yet spoken
  paused: false,          // recognition suspended while VIRANI talks
  voices: [],
  meterStream: null,
  meterRaf: 0,
};

function loadPrefs() {
  const defaults = {
    speak: true,
    premium: true,       // use the server's cinematic voice when it is available
    location: false,     // opt in — nothing is sent until you switch it on
    wakeLock: true,      // hold the screen on while listening
    voiceURI: '',
    rate: 1,
    wake: false,
    // An open microphone stream can upset speech recognition on some phones,
    // so the reactive meter defaults to desktop only.
    meter: !matchMedia('(pointer: coarse)').matches,
  };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem('virani.prefs') || '{}') };
  } catch (_) {
    return defaults;
  }
}

function savePrefs() {
  localStorage.setItem('virani.prefs', JSON.stringify(S.prefs));
}

// ── Elements ─────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = {
  lock: $('lock'), app: $('app'), loginForm: $('loginForm'), pin: $('pin'), lockError: $('lockError'),
  orb: $('orb'), status: $('status'), interim: $('interim'), log: $('log'),
  composer: $('composer'), text: $('text'), micBtn: $('micBtn'),
  wakeToggle: $('wakeToggle'), onlineDot: $('onlineDot'),
  settings: $('settings'), settingsBtn: $('settingsBtn'), closeSettings: $('closeSettings'), scrim: $('scrim'),
  speakToggle: $('speakToggle'), voiceSelect: $('voiceSelect'), rate: $('rate'), testVoice: $('testVoice'),
  premiumRow: $('premiumRow'), premiumToggle: $('premiumToggle'), voiceState: $('voiceState'),
  locationToggle: $('locationToggle'), wakeLockToggle: $('wakeLockToggle'), locationState: $('locationState'),
  contactList: $('contactList'),
  enablePush: $('enablePush'), testPush: $('testPush'), pushState: $('pushState'),
  googleSection: $('googleSection'), googleState: $('googleState'),
  googleConnect: $('googleConnect'), googleDisconnect: $('googleDisconnect'),
  reminderList: $('reminderList'), factList: $('factList'), sysInfo: $('sysInfo'),
  clearChat: $('clearChat'), signOut: $('signOut'),
};

// ── Server calls ─────────────────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(S.token ? { Authorization: `Bearer ${S.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) {
    signOut();
    throw new Error('Session expired — sign in again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ── Sign in ──────────────────────────────────────────────────────────────
el.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.lockError.textContent = '';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ pin: el.pin.value }),
    });
    S.token = data.token;
    localStorage.setItem('virani.token', S.token);
    el.pin.value = '';
    await enterApp();
  } catch (err) {
    el.lockError.textContent = err.message;
    navigator.vibrate?.(80);
  }
});

function signOut() {
  S.token = '';
  localStorage.removeItem('virani.token');
  stopListening();
  el.app.classList.add('hidden');
  el.lock.classList.remove('hidden');
  closeSettings();
}

async function enterApp() {
  el.lock.classList.add('hidden');
  el.app.classList.remove('hidden');
  await refreshState();
  registerServiceWorker();
  if (S.prefs.location) refreshCoords().catch(() => {});
  greet();
}

// ── Boot ─────────────────────────────────────────────────────────────────
(async function boot() {
  const hello = await fetch('/api/hello').then((r) => r.json()).catch(() => null);
  if (hello) {
    S.name = hello.name;
    S.wakeWord = (hello.wakeWord || 'virani').toLowerCase();
    if (!hello.pinRequired) {
      el.lockError.textContent = 'OWNER_PIN is not set on the server. Set it, then reload.';
    }
  }
  loadVoices();
  applyPrefsToUi();

  if (S.token) {
    try {
      await enterApp();
      return;
    } catch (_) {
      /* token no longer valid — fall through to the lock screen */
    }
  }
  el.pin.focus();
})();

// ── Conversation ─────────────────────────────────────────────────────────
function bubble(text, who, extra = {}) {
  const div = document.createElement('div');
  div.className = `bubble ${who}${extra.failed ? ' failed' : ''}`;
  div.textContent = text;

  if (extra.tools?.length) {
    const tag = document.createElement('span');
    tag.className = 'tools';
    tag.textContent = `▸ ${[...new Set(extra.tools)].join(' · ')}`;
    div.appendChild(tag);
  }
  if (extra.links?.length) {
    for (const link of extra.links) {
      const a = document.createElement('a');
      a.href = link.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.className = 'tools';
      a.textContent = `↗ Open ${link.label || 'link'}`;
      div.appendChild(a);
    }
  }
  el.log.appendChild(div);
  el.log.scrollTop = el.log.scrollHeight;
  return div;
}

function setState(state, message) {
  el.orb.className = `reactor${state ? ` ${state}` : ''}`;
  el.onlineDot.className = `dot${state === 'thinking' ? ' busy' : ''}`;
  if (message !== undefined) el.status.textContent = message;
}

async function send(message, { spoken = false } = {}) {
  const text = String(message || '').trim();
  if (!text || S.busy) return;

  S.busy = true;
  el.interim.textContent = '';
  bubble(text, 'you');
  setState('thinking', 'Processing');

  try {
    const data = await api('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message: text,
        channel: spoken ? 'voice' : 'text',
        coords: freshCoords(),
      }),
    });

    const links = [];
    for (const action of data.actions || []) {
      if (action.type === 'open_url') {
        // Popup blockers stop async window.open, so always leave a tappable link too.
        const opened = window.open(action.url, '_blank', 'noopener');
        if (!opened) links.push(action);
      }
    }

    bubble(data.reply, 'virani', { tools: data.tools, links });
    setState('', 'Ready');
    speak(data.reply);
    refreshState().catch(() => {});
  } catch (err) {
    bubble(err.message, 'virani', { failed: true });
    setState('error', 'Fault');
    setTimeout(() => setState('', 'Ready'), 2500);
  } finally {
    S.busy = false;
  }
}

el.composer.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = el.text.value;
  el.text.value = '';
  send(value);
});

function greet() {
  if (el.log.childElementCount > 0) return;
  const hour = new Date().getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  bubble(`${part}. ${S.name} online — say "${S.wakeWord}" or tap the core.`, 'system');
}

// ── Speech synthesis ─────────────────────────────────────────────────────
function loadVoices() {
  const apply = () => {
    S.voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    el.voiceSelect.innerHTML = '';
    if (S.voices.length === 0) {
      el.voiceSelect.innerHTML = '<option>System default</option>';
      return;
    }
    for (const voice of S.voices) {
      const option = document.createElement('option');
      option.value = voice.voiceURI;
      option.textContent = `${voice.name} (${voice.lang})`;
      el.voiceSelect.appendChild(option);
    }
    if (!S.prefs.voiceURI) S.prefs.voiceURI = pickJarvisVoice()?.voiceURI || '';
    el.voiceSelect.value = S.prefs.voiceURI;
  };
  apply();
  speechSynthesis.onvoiceschanged = apply;
}

/** Prefer a deep, natural English voice — closest thing to the film. */
function pickJarvisVoice() {
  const wanted = [
    /google uk english male/i, /daniel/i, /arthur/i, /oliver/i, /james/i,
    /microsoft (guy|ryan|george)/i, /google us english/i, /male/i,
  ];
  for (const pattern of wanted) {
    const hit = S.voices.find((v) => pattern.test(v.name));
    if (hit) return hit;
  }
  return S.voices.find((v) => v.lang === 'en-GB') || S.voices[0];
}

function speak(text) {
  if (!S.prefs.speak || !text) return;
  stopSpeaking();

  if (S.premiumAvailable && S.prefs.premium) {
    speakPremium(text).catch((err) => {
      // Quota gone, network blip, bad key — never go silent, just drop back.
      console.warn('[voice] premium failed, using the browser voice:', err.message);
      el.voiceState.textContent = `Cinematic voice unavailable (${err.message}) — using the device voice.`;
      speakLocally(text);
    });
    return;
  }
  speakLocally(text);
}

/** Server-synthesised speech (ElevenLabs), played as one audio clip. */
async function speakPremium(text) {
  const res = await fetch('/api/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${S.token}` },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error(detail.error || `HTTP ${res.status}`);
  }

  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  S.audio = audio;

  audio.onplay = () => {
    setState('speaking', 'Speaking');
    suspendListening();
  };
  const finish = () => {
    URL.revokeObjectURL(url);
    S.audio = null;
    setState('', 'Ready');
    resumeListening();
  };
  audio.onended = finish;
  audio.onerror = finish;

  await audio.play();
}

/** Stop whichever engine is currently talking. */
function stopSpeaking() {
  speechSynthesis.cancel();
  if (S.audio) {
    S.audio.pause();
    S.audio = null;
  }
}

function speakLocally(text) {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(String(text).replace(/[*_`#]/g, ''));
  const voice = S.voices.find((v) => v.voiceURI === S.prefs.voiceURI);
  if (voice) utterance.voice = voice;
  utterance.rate = Number(S.prefs.rate) || 1;
  utterance.pitch = 0.9;

  // The microphone must not hear VIRANI's own voice, or it answers itself.
  utterance.onstart = () => {
    setState('speaking', 'Speaking');
    suspendListening();
  };
  utterance.onend = () => {
    setState('', 'Ready');
    resumeListening();
  };
  utterance.onerror = () => {
    setState('', 'Ready');
    resumeListening();
  };

  speechSynthesis.speak(utterance);
}

// ── Speech recognition ───────────────────────────────────────────────────
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let restartTimer = 0;

function buildRecognition() {
  if (!Recognition) return null;
  const rec = new Recognition();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = navigator.language?.startsWith('ur') ? 'ur-PK' : 'en-US';
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = result[0].transcript.trim();
      if (result.isFinal) handleFinal(transcript);
      else interim += transcript;
    }
    el.interim.textContent = interim;
  };

  rec.onerror = (event) => {
    if (event.error === 'no-speech' || event.error === 'aborted') return;
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      S.micMode = 'off';
      updateMicUi();
      bubble('Microphone access is blocked. Allow it in your browser settings to use voice.', 'system');
      return;
    }
    if (event.error === 'audio-capture' && S.prefs.meter) {
      // Some devices only allow one consumer of the microphone — drop the
      // visualiser and keep the thing that actually matters.
      S.prefs.meter = false;
      savePrefs();
      stopMeter();
    }
    console.warn('[speech]', event.error);
  };

  rec.onend = () => {
    // The engine stops on its own every so often; restart while we still want it.
    if (S.micMode !== 'off' && !S.paused) {
      clearTimeout(restartTimer);
      restartTimer = setTimeout(() => startRecognition(), 350);
    }
  };
  return rec;
}

function handleFinal(transcript) {
  if (!transcript) return;
  const lower = transcript.toLowerCase();

  if (S.micMode === 'ptt') {
    stopListening();
    send(transcript, { spoken: true });
    return;
  }

  if (S.awaitingCommand) {
    S.awaitingCommand = false;
    setState('', 'Ready');
    send(transcript, { spoken: true });
    return;
  }

  const index = lower.indexOf(S.wakeWord);
  if (index === -1) return;

  const rest = transcript.slice(index + S.wakeWord.length).replace(/^[\s,.:;!?-]+/, '').trim();
  navigator.vibrate?.(40);
  if (rest.length > 1) {
    send(rest, { spoken: true });
  } else {
    S.awaitingCommand = true;
    setState('listening', 'Listening');
    chime();
  }
}

function startRecognition() {
  if (!recognition) recognition = buildRecognition();
  if (!recognition) return;
  try {
    recognition.start();
  } catch (_) {
    /* already started — harmless */
  }
}

function startListening(mode) {
  if (!Recognition) {
    bubble('This browser has no speech recognition. Use Chrome on Android or desktop, or type instead.', 'system');
    return;
  }
  S.micMode = mode;
  S.paused = false;
  S.awaitingCommand = false;
  startRecognition();
  startMeter();
  requestWakeLock();
  updateMicUi();
  setState('listening', mode === 'wake' ? `Standing by for "${S.wakeWord}"` : 'Listening');
}

function stopListening() {
  S.micMode = 'off';
  S.awaitingCommand = false;
  clearTimeout(restartTimer);
  try {
    recognition?.stop();
  } catch (_) { /* not running */ }
  stopMeter();
  releaseWakeLock();
  updateMicUi();
  el.interim.textContent = '';
  setState('', 'Ready');
}

/** Pause while VIRANI speaks, so it does not transcribe itself. */
function suspendListening() {
  if (S.micMode === 'off') return;
  S.paused = true;
  clearTimeout(restartTimer);
  try {
    recognition?.stop();
  } catch (_) { /* not running */ }
  stopMeter();
}

function resumeListening() {
  if (S.micMode === 'off' || !S.paused) return;
  S.paused = false;
  setTimeout(() => {
    startRecognition();
    startMeter();
    setState('listening', S.micMode === 'wake' ? `Standing by for "${S.wakeWord}"` : 'Listening');
  }, 300);
}

function updateMicUi() {
  const on = S.micMode !== 'off';
  el.micBtn.classList.toggle('on', on);
  const wake = S.micMode === 'wake';
  el.wakeToggle.setAttribute('aria-pressed', String(wake));
  el.wakeToggle.textContent = `Wake word: ${wake ? 'on' : 'off'}`;
}

el.orb.addEventListener('click', () => {
  if (S.micMode === 'ptt') stopListening();
  else if (S.micMode === 'wake') { S.awaitingCommand = true; setState('listening', 'Listening'); chime(); }
  else startListening('ptt');
});

el.micBtn.addEventListener('click', () => {
  if (S.micMode === 'off') startListening('ptt');
  else stopListening();
});

el.wakeToggle.addEventListener('click', () => {
  if (S.micMode === 'wake') {
    stopListening();
    S.prefs.wake = false;
  } else {
    startListening('wake');
    S.prefs.wake = true;
  }
  savePrefs();
});

// ── Microphone level → the glow of the core ──────────────────────────────
async function startMeter() {
  if (!S.prefs.meter || S.meterStream || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    S.meterStream = stream;

    const context = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    context.createMediaStreamSource(stream).connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);
    let smoothed = 0;
    const tick = () => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (const v of data) sum += v;
      const level = Math.min(1, sum / data.length / 90);
      smoothed = smoothed * 0.75 + level * 0.25;
      el.orb.style.setProperty('--level', smoothed.toFixed(3));
      S.meterRaf = requestAnimationFrame(tick);
    };
    tick();
    S.meterContext = context;
  } catch (_) {
    S.prefs.meter = false; // no permission, or the device only allows one reader
  }
}

function stopMeter() {
  cancelAnimationFrame(S.meterRaf);
  S.meterStream?.getTracks().forEach((t) => t.stop());
  S.meterContext?.close?.();
  S.meterStream = null;
  S.meterContext = null;
  el.orb.style.setProperty('--level', 0);
}

/** A short rising tone, so you know the wake word landed. */
function chime() {
  try {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1320, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.22);
    osc.connect(gain).connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.24);
    setTimeout(() => context.close(), 400);
  } catch (_) { /* audio not available */ }
}

// ── Settings ─────────────────────────────────────────────────────────────
function openSettings() {
  el.settings.classList.remove('hidden');
  el.scrim.classList.remove('hidden');
  refreshState().catch(() => {});
}
function closeSettings() {
  el.settings.classList.add('hidden');
  el.scrim.classList.add('hidden');
}
el.settingsBtn.addEventListener('click', openSettings);
el.closeSettings.addEventListener('click', closeSettings);
el.scrim.addEventListener('click', closeSettings);

function applyPrefsToUi() {
  el.speakToggle.checked = S.prefs.speak;
  el.premiumToggle.checked = S.prefs.premium;
  el.locationToggle.checked = S.prefs.location;
  el.wakeLockToggle.checked = S.prefs.wakeLock;
  el.rate.value = S.prefs.rate;
}

// ── Location ─────────────────────────────────────────────────────────────
/** Coordinates are only attached to a message if they are recent. */
function freshCoords() {
  if (!S.prefs.location || !S.coords) return undefined;
  if (Date.now() - S.coords.at > 5 * 60 * 1000) {
    refreshCoords().catch(() => {});          // refresh in the background
  }
  return { lat: S.coords.lat, lon: S.coords.lon, accuracy: S.coords.accuracy };
}

function refreshCoords() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      el.locationState.textContent = 'This device has no location support.';
      reject(new Error('no geolocation'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        S.coords = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          at: Date.now(),
        };
        el.locationState.textContent = `Location on, accurate to about ${S.coords.accuracy} metres.`;
        resolve(S.coords);
      },
      (err) => {
        el.locationState.textContent = `Location unavailable: ${err.message}`;
        reject(err);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// ── Screen wake lock ─────────────────────────────────────────────────────
// Hands-free only works if the phone does not lock itself mid-sentence.
async function requestWakeLock() {
  if (!S.prefs.wakeLock || !('wakeLock' in navigator) || S.wakeLock) return;
  try {
    S.wakeLock = await navigator.wakeLock.request('screen');
    S.wakeLock.addEventListener('release', () => { S.wakeLock = null; });
  } catch (_) {
    /* denied or unsupported — listening still works, the screen just sleeps */
  }
}

function releaseWakeLock() {
  S.wakeLock?.release().catch(() => {});
  S.wakeLock = null;
}

el.speakToggle.addEventListener('change', () => {
  S.prefs.speak = el.speakToggle.checked;
  if (!S.prefs.speak) stopSpeaking();
  savePrefs();
});
el.voiceSelect.addEventListener('change', () => {
  S.prefs.voiceURI = el.voiceSelect.value;
  savePrefs();
});
el.rate.addEventListener('change', () => {
  S.prefs.rate = Number(el.rate.value);
  savePrefs();
});
el.testVoice.addEventListener('click', () => {
  const previous = S.prefs.speak;
  S.prefs.speak = true;
  speak(`All systems nominal. ${S.name} standing by.`);
  S.prefs.speak = previous;
});

el.premiumToggle.addEventListener('change', () => {
  S.prefs.premium = el.premiumToggle.checked;
  savePrefs();
});

el.locationToggle.addEventListener('change', async () => {
  S.prefs.location = el.locationToggle.checked;
  savePrefs();
  if (S.prefs.location) await refreshCoords();
  else {
    S.coords = null;
    el.locationState.textContent = 'Location off.';
  }
});

el.wakeLockToggle.addEventListener('change', () => {
  S.prefs.wakeLock = el.wakeLockToggle.checked;
  savePrefs();
  if (!S.prefs.wakeLock) releaseWakeLock();
  else if (S.micMode !== 'off') requestWakeLock();
});

el.clearChat.addEventListener('click', async () => {
  await api('/api/reset', { method: 'POST' });
  el.log.innerHTML = '';
  bubble('Conversation cleared. Long-term memory is untouched.', 'system');
  closeSettings();
});
el.signOut.addEventListener('click', signOut);

// ── Server state → settings panel ────────────────────────────────────────
async function refreshState() {
  const state = await api('/api/state');
  S.name = state.name;
  S.wakeWord = (state.wakeWord || 'virani').toLowerCase();
  S.pushKey = state.pushPublicKey;
  S.premiumAvailable = Boolean(state.voice?.premium);

  el.premiumRow.hidden = !S.premiumAvailable;
  if (S.premiumAvailable) {
    el.voiceState.textContent = 'Cinematic voice is available on this server.';
  } else {
    el.voiceState.textContent = 'Using your device voice. Add an ElevenLabs key for the cinematic one.';
  }

  el.sysInfo.textContent =
    `Brain: ${state.aiProvider} · Timezone: ${state.timezone} · ` +
    `${state.tools.length} tools · ${state.devices} device(s) subscribed`;

  // Reminders
  el.reminderList.innerHTML = '';
  if (state.reminders.length === 0) {
    el.reminderList.innerHTML = '<li class="empty">Nothing scheduled</li>';
  }
  for (const reminder of state.reminders) {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.textContent = reminder.text;
    const when = document.createElement('span');
    when.className = 'when';
    when.textContent = reminder.due + (reminder.repeat ? ` · repeats ${reminder.repeat}` : '');
    body.appendChild(when);

    const del = document.createElement('button');
    del.textContent = 'Cancel';
    del.addEventListener('click', async () => {
      await api(`/api/reminders/${reminder.id}`, { method: 'DELETE' });
      refreshState();
    });
    li.append(body, del);
    el.reminderList.appendChild(li);
  }

  // Contacts
  el.contactList.innerHTML = '';
  if (!state.contacts || state.contacts.length === 0) {
    el.contactList.innerHTML = '<li class="empty">No contacts saved</li>';
  }
  for (const contact of state.contacts || []) {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.textContent = contact.name;
    const detail = document.createElement('span');
    detail.className = 'when';
    detail.textContent = [contact.phone, contact.email].filter(Boolean).join(' · ') || 'no details';
    body.appendChild(detail);

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      await api(`/api/contacts/${contact.id}`, { method: 'DELETE' });
      refreshState();
    });
    li.append(body, del);
    el.contactList.appendChild(li);
  }

  // Long-term memory
  el.factList.innerHTML = '';
  if (state.facts.length === 0) {
    el.factList.innerHTML = '<li class="empty">Nothing remembered yet</li>';
  }
  for (const fact of state.facts.slice().reverse()) {
    const li = document.createElement('li');
    const body = document.createElement('div');
    body.textContent = fact.fact;
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = fact.category || 'general';
    body.appendChild(tag);

    const del = document.createElement('button');
    del.textContent = 'Forget';
    del.addEventListener('click', async () => {
      await api(`/api/facts/${fact.id}`, { method: 'DELETE' });
      refreshState();
    });
    li.append(body, del);
    el.factList.appendChild(li);
  }

  // Google
  if (!state.google.available) {
    el.googleState.textContent = 'Not configured on the server (GOOGLE_CLIENT_ID / SECRET).';
    el.googleConnect.classList.add('hidden');
  } else if (state.google.connected) {
    el.googleState.textContent = `Connected as ${state.google.email || 'your account'}.`;
    el.googleConnect.classList.add('hidden');
    el.googleDisconnect.classList.remove('hidden');
  } else {
    el.googleState.textContent = 'Not connected yet.';
    el.googleConnect.classList.remove('hidden');
    el.googleDisconnect.classList.add('hidden');
  }

  updatePushState();

  // Anything that fired while the app was closed gets spoken now.
  if (state.inbox?.length) {
    for (const item of state.inbox) bubble(item.text, 'virani');
    speak(state.inbox.map((i) => i.text).join('. '));
    api('/api/inbox/spoken', { method: 'POST' }).catch(() => {});
  }

  // Restore always-listening if it was on last time.
  if (S.prefs.wake && S.micMode === 'off') startListening('wake');
  updateMicUi();
}

// ── Google connection ────────────────────────────────────────────────────
el.googleConnect.addEventListener('click', async () => {
  try {
    const { url } = await api('/api/google/connect');
    window.location.href = url;
  } catch (err) {
    el.googleState.textContent = err.message;
  }
});
el.googleDisconnect.addEventListener('click', async () => {
  await api('/api/google/disconnect', { method: 'POST' });
  refreshState();
});

// ── Push notifications ───────────────────────────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('[sw]', err.message));
  }
}

async function updatePushState() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    el.pushState.textContent = 'This browser cannot receive background notifications.';
    return;
  }
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  el.pushState.textContent = subscription
    ? 'Enabled on this device.'
    : `Not enabled here (permission: ${Notification.permission}).`;
}

el.enablePush.addEventListener('click', async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      el.pushState.textContent = 'Permission denied — allow notifications in browser settings.';
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(S.pushKey),
      }));

    await api('/api/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });
    el.pushState.textContent = 'Enabled. Reminders will reach you even when this is closed.';
    refreshState();
  } catch (err) {
    el.pushState.textContent = err.message;
  }
});

el.testPush.addEventListener('click', async () => {
  try {
    const result = await api('/api/push/test', { method: 'POST' });
    el.pushState.textContent = result.sent
      ? `Sent to ${result.sent} device(s).`
      : `Nothing sent (${result.reason || 'no devices'}).`;
  } catch (err) {
    el.pushState.textContent = err.message;
  }
});

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// ── Housekeeping ─────────────────────────────────────────────────────────
document.addEventListener('visibilitychange', () => {
  // Mobile browsers suspend recognition — and drop the wake lock — in the
  // background, so both are re-established when the app comes back.
  if (document.hidden || S.micMode === 'off') return;
  if (!S.paused) startRecognition();
  requestWakeLock();
});

window.addEventListener('beforeunload', () => {
  stopSpeaking();
  stopMeter();
  releaseWakeLock();
});
