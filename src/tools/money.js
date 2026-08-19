'use strict';

/**
 * Numbers: arithmetic, currency and crypto.
 *
 * The calculator is a real recursive-descent parser rather than eval(), so a
 * mis-heard command can never execute code on the server. Currency and crypto
 * rates come from free, key-less public APIs.
 */

const { getJson } = require('../core/http');

// ---------------------------------------------------------------------------
// A small, safe expression evaluator
// ---------------------------------------------------------------------------
const FUNCTIONS = {
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, round: Math.round,
  floor: Math.floor, ceil: Math.ceil, exp: Math.exp,
  ln: Math.log, log: Math.log10, log2: Math.log2,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTANTS = { pi: Math.PI, e: Math.E };

function tokenize(input) {
  const tokens = [];
  const source = String(input).toLowerCase().replace(/,/g, ' , ').replace(/\s+/g, ' ');
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ') { i += 1; continue; }

    if (/[0-9.]/.test(ch)) {
      let number = '';
      while (i < source.length && /[0-9.]/.test(source[i])) number += source[i++];
      if (Number.isNaN(Number(number))) throw new Error(`"${number}" is not a number.`);
      tokens.push({ type: 'number', value: Number(number) });
      continue;
    }
    if (/[a-z_]/.test(ch)) {
      let name = '';
      while (i < source.length && /[a-z0-9_]/.test(source[i])) name += source[i++];
      tokens.push({ type: 'name', value: name });
      continue;
    }
    if ('+-*/%^(),'.includes(ch)) {
      tokens.push({ type: ch });
      i += 1;
      continue;
    }
    // "×" and "÷" turn up when a phone transcribes speech.
    if (ch === '×') { tokens.push({ type: '*' }); i += 1; continue; }
    if (ch === '÷') { tokens.push({ type: '/' }); i += 1; continue; }
    throw new Error(`I cannot use the character "${ch}" in a calculation.`);
  }
  return tokens;
}

function evaluate(expression) {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (type) => {
    if (!peek() || peek().type !== type) throw new Error(`Expected "${type}" in the expression.`);
    return tokens[pos++];
  };

  function parseExpression() {
    let left = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = tokens[pos++].type;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  }

  function parseTerm() {
    let left = parsePower();
    while (peek() && ['*', '/', '%'].includes(peek().type)) {
      const op = tokens[pos++].type;
      const right = parsePower();
      if ((op === '/' || op === '%') && right === 0) throw new Error('Division by zero.');
      left = op === '*' ? left * right : op === '/' ? left / right : left % right;
    }
    return left;
  }

  function parsePower() {
    const base = parseUnary();
    if (peek() && peek().type === '^') {
      pos += 1;
      return base ** parsePower(); // right-associative
    }
    return base;
  }

  function parseUnary() {
    if (peek() && peek().type === '-') { pos += 1; return -parseUnary(); }
    if (peek() && peek().type === '+') { pos += 1; return parseUnary(); }
    return parsePrimary();
  }

  function parsePrimary() {
    const token = peek();
    if (!token) throw new Error('The expression ends too early.');

    if (token.type === 'number') { pos += 1; return token.value; }

    if (token.type === '(') {
      pos += 1;
      const value = parseExpression();
      eat(')');
      return value;
    }

    if (token.type === 'name') {
      pos += 1;
      if (token.value in CONSTANTS) return CONSTANTS[token.value];

      const fn = FUNCTIONS[token.value];
      if (!fn) throw new Error(`I don't know "${token.value}".`);

      eat('(');
      const args = [parseExpression()];
      while (peek() && peek().type === ',') { pos += 1; args.push(parseExpression()); }
      eat(')');

      const result = fn(...args);
      if (!Number.isFinite(result)) throw new Error(`${token.value} is undefined for that input.`);
      return result;
    }
    throw new Error(`Unexpected "${token.type}" in the expression.`);
  }

  const value = parseExpression();
  if (pos !== tokens.length) throw new Error('There is something extra at the end of the expression.');
  if (!Number.isFinite(value)) throw new Error('That does not give a finite answer.');
  return value;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const tools = [
  {
    name: 'calculate',
    description:
      'Work out an arithmetic expression exactly. Use for any sum, percentage, ' +
      'split bill, rate or conversion maths — never do arithmetic in your head. ' +
      'Supports + - * / % ^, brackets, and sqrt, abs, round, floor, ceil, min, ' +
      'max, pow, log, ln, sin, cos, tan, plus pi and e.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: 'The expression, e.g. "(2400 * 0.175) / 3" or "sqrt(2) * 10".',
        },
      },
      required: ['expression'],
    },
    async handler({ expression }) {
      try {
        const value = evaluate(expression);
        return {
          expression,
          result: value,
          // A rounded form is easier to read aloud than 17.000000000000004.
          spoken: Number(value.toFixed(6)).toLocaleString('en-US'),
        };
      } catch (err) {
        return { expression, error: err.message };
      }
    },
  },

  {
    name: 'convert_currency',
    description:
      'Convert money between currencies at today\'s rate. Use three-letter codes ' +
      '(PKR, USD, GBP, EUR, AED, SAR…).',
    parameters: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'How much to convert.' },
        from: { type: 'string', description: 'Currency code to convert from.' },
        to: { type: 'string', description: 'Currency code to convert to.' },
      },
      required: ['amount', 'from', 'to'],
    },
    async handler({ amount, from, to }) {
      const source = String(from || '').toUpperCase().trim();
      const target = String(to || '').toUpperCase().trim();
      const value = Number(amount);
      if (!Number.isFinite(value)) return { error: 'That amount is not a number.' };

      try {
        const data = await getJson(`https://open.er-api.com/v6/latest/${encodeURIComponent(source)}`);
        if (data.result === 'error') {
          return { error: `I don't recognise the currency "${source}".` };
        }
        const rate = data.rates?.[target];
        if (!rate) return { error: `I don't recognise the currency "${target}".` };

        return {
          from: source,
          to: target,
          amount: value,
          rate,
          result: Number((value * rate).toFixed(2)),
          rateUpdated: data.time_last_update_utc,
        };
      } catch (err) {
        return { error: err.message };
      }
    },
  },

  {
    name: 'get_crypto_price',
    description: 'Current price of a cryptocurrency, e.g. bitcoin, ethereum, solana.',
    parameters: {
      type: 'object',
      properties: {
        coin: { type: 'string', description: 'Coin name in lowercase, e.g. "bitcoin".' },
        currency: { type: 'string', description: 'Price currency code. Default USD.' },
      },
      required: ['coin'],
    },
    async handler({ coin, currency }) {
      const id = String(coin || '').toLowerCase().trim().replace(/\s+/g, '-');
      const vs = String(currency || 'usd').toLowerCase().trim();
      try {
        const data = await getJson(
          `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(id)}` +
            `&vs_currencies=${encodeURIComponent(vs)}&include_24hr_change=true`
        );
        const entry = data[id];
        if (!entry) return { error: `I could not find a coin called "${coin}".` };
        return {
          coin: id,
          currency: vs.toUpperCase(),
          price: entry[vs],
          change24hPercent: entry[`${vs}_24h_change`] != null
            ? Number(entry[`${vs}_24h_change`].toFixed(2))
            : undefined,
        };
      } catch (err) {
        return { error: err.message };
      }
    },
  },
];

module.exports = { tools, evaluate };
