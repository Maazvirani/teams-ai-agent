'use strict';

/**
 * App control.
 *
 * VIRANI runs in the browser as an installed app, so it launches other apps the
 * way phones actually do it: deep links. "Play Interstellar on YouTube",
 * "message Ali on WhatsApp", "navigate to the airport", "call this number" —
 * each returns an action the front-end opens, handing off to the real app if
 * it is installed and the website if it is not.
 */

const APPS = {
  youtube: {
    label: 'YouTube',
    search: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,
    home: 'https://www.youtube.com',
  },
  whatsapp: {
    label: 'WhatsApp',
    // A bare number opens that chat; anything else opens a text search.
    search: (q) => {
      const digits = String(q).replace(/[^\d+]/g, '');
      return digits.length >= 7
        ? `https://wa.me/${digits.replace(/^\+/, '')}`
        : `https://web.whatsapp.com/`;
    },
    home: 'https://web.whatsapp.com',
  },
  maps: {
    label: 'Google Maps',
    search: (q) => `https://www.google.com/maps/search/${encodeURIComponent(q)}`,
    home: 'https://www.google.com/maps',
  },
  navigate: {
    label: 'Navigation',
    search: (q) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}`,
    home: 'https://www.google.com/maps',
  },
  spotify: {
    label: 'Spotify',
    search: (q) => `https://open.spotify.com/search/${encodeURIComponent(q)}`,
    home: 'https://open.spotify.com',
  },
  gmail: {
    label: 'Gmail',
    search: (q) => `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`,
    home: 'https://mail.google.com',
  },
  calendar: {
    label: 'Google Calendar',
    search: () => 'https://calendar.google.com',
    home: 'https://calendar.google.com',
  },
  drive: {
    label: 'Google Drive',
    search: (q) => `https://drive.google.com/drive/search?q=${encodeURIComponent(q)}`,
    home: 'https://drive.google.com',
  },
  translate: {
    label: 'Google Translate',
    search: (q) => `https://translate.google.com/?text=${encodeURIComponent(q)}`,
    home: 'https://translate.google.com',
  },
  google: {
    label: 'Google',
    search: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    home: 'https://www.google.com',
  },
  instagram: { label: 'Instagram', search: (q) => `https://www.instagram.com/explore/tags/${encodeURIComponent(String(q).replace(/\W/g, ''))}/`, home: 'https://www.instagram.com' },
  x: { label: 'X', search: (q) => `https://x.com/search?q=${encodeURIComponent(q)}`, home: 'https://x.com' },
  linkedin: { label: 'LinkedIn', search: (q) => `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}`, home: 'https://www.linkedin.com' },
  github: { label: 'GitHub', search: (q) => `https://github.com/search?q=${encodeURIComponent(q)}`, home: 'https://github.com' },
  amazon: { label: 'Amazon', search: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`, home: 'https://www.amazon.com' },
  netflix: { label: 'Netflix', search: (q) => `https://www.netflix.com/search?q=${encodeURIComponent(q)}`, home: 'https://www.netflix.com' },
  phone: {
    label: 'Phone',
    search: (q) => `tel:${String(q).replace(/[^\d+*#]/g, '')}`,
    home: 'tel:',
  },
  sms: {
    label: 'Messages',
    search: (q) => `sms:${String(q).replace(/[^\d+]/g, '')}`,
    home: 'sms:',
  },
};

const tools = [
  {
    name: 'open_app',
    description:
      'Open another app or website on the user\'s device — to play music or a video, ' +
      'start navigation, message someone, place a call, or search a site. ' +
      `Supported: ${Object.keys(APPS).join(', ')}. ` +
      'The app opens immediately, so confirm briefly in your reply ("Opening YouTube.").',
    parameters: {
      type: 'object',
      properties: {
        app: { type: 'string', enum: Object.keys(APPS), description: 'Which app to open.' },
        query: {
          type: 'string',
          description:
            'What to search/play/navigate to inside that app. For phone or sms, the number.',
        },
      },
      required: ['app'],
    },
    async handler({ app, query }, ctx) {
      const key = String(app || '').toLowerCase().trim();
      const entry = APPS[key];
      if (!entry) {
        return { error: `I don't have a shortcut for "${app}".`, supported: Object.keys(APPS) };
      }
      const url = query ? entry.search(query) : entry.home;
      ctx.actions.push({ type: 'open_url', url, label: entry.label });
      return { opened: entry.label, url, query: query || undefined };
    },
  },

  {
    name: 'open_url',
    description:
      'Open an exact URL on the user\'s device (a link you found with web_search, ' +
      'a document, a video). Use open_app when a well-known app fits better.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to open.' },
        label: { type: 'string', description: 'Short human label for the link.' },
      },
      required: ['url'],
    },
    async handler({ url, label }, ctx) {
      if (!/^(https?:|tel:|sms:|mailto:)/i.test(url)) {
        return { error: 'That link scheme is not allowed.' };
      }
      ctx.actions.push({ type: 'open_url', url, label: label || 'Link' });
      return { opened: label || url, url };
    },
  },
];

module.exports = { tools, APPS };
