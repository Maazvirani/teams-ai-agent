'use strict';

/**
 * Where you are right now.
 *
 * The browser offers coordinates (with your permission) and sends them with
 * each message. That turns vague requests into precise ones: "what's the
 * weather" means *here*, "find a pharmacy near me" searches around you.
 *
 * Coordinates are used for the request and never stored.
 */

const { getJson } = require('../core/http');

async function describe(coords) {
  const data = await getJson(
    'https://api.bigdatacloud.net/data/reverse-geocode-client' +
      `?latitude=${coords.lat}&longitude=${coords.lon}&localityLanguage=en`
  );
  const place = [data.locality, data.city, data.principalSubdivision, data.countryName]
    .filter(Boolean)
    .filter((part, i, arr) => arr.indexOf(part) === i);
  return {
    place: place.join(', ') || 'an unnamed location',
    city: data.city || data.locality || undefined,
    country: data.countryName || undefined,
  };
}

const tools = [
  {
    name: 'get_location',
    description:
      "Find out where the owner is right now, as a place name. Use for 'where am " +
      "I', or before answering anything that depends on their current location. " +
      'Only works if they have allowed location access in the app.',
    parameters: { type: 'object', properties: {} },
    async handler(_args, ctx) {
      if (!ctx.coords) {
        return {
          error:
            'Location is not shared. Tell the owner to allow location access when ' +
            'the app asks, then try again.',
        };
      }
      try {
        const described = await describe(ctx.coords);
        return {
          ...described,
          latitude: ctx.coords.lat,
          longitude: ctx.coords.lon,
          accuracyMetres: ctx.coords.accuracy,
        };
      } catch (err) {
        // Coordinates are still useful even when the name lookup fails.
        return {
          place: 'unknown',
          latitude: ctx.coords.lat,
          longitude: ctx.coords.lon,
          note: `Could not name the place: ${err.message}`,
        };
      }
    },
  },

  {
    name: 'find_nearby',
    description:
      'Search for places around the owner right now — restaurants, pharmacies, ' +
      'petrol stations, ATMs — and open the results on a map.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for, e.g. "pharmacy", "biryani".' },
      },
      required: ['query'],
    },
    async handler({ query }, ctx) {
      const what = String(query || '').trim();
      if (!what) return { error: 'What should I look for?' };

      const url = ctx.coords
        ? `https://www.google.com/maps/search/${encodeURIComponent(what)}/@${ctx.coords.lat},${ctx.coords.lon},15z`
        : `https://www.google.com/maps/search/${encodeURIComponent(`${what} near me`)}`;

      ctx.actions.push({ type: 'open_url', url, label: `${what} nearby` });
      return {
        searched: what,
        usedLiveLocation: Boolean(ctx.coords),
        note: ctx.coords
          ? 'Map is open, centred on the owner.'
          : 'Location is not shared, so the map searched "near me" instead.',
      };
    },
  },
];

module.exports = { tools, describe };
