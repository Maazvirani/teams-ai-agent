'use strict';

/**
 * Renders a document VIRANI wrote into a clean, printable web page.
 *
 * Deliberately small and dependency-free: a focused Markdown subset covering
 * what the model actually writes — headings, lists, tables, bold, italic, code,
 * quotes, links and rules. Everything is escaped before any formatting is
 * applied, so a document can never inject markup into the page.
 */

const { config } = require('./config');

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bold, italic, code and links — applied to already-escaped text. */
function inline(text) {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

function markdownToHtml(markdown) {
  const lines = escapeHtml(markdown).split('\n');
  const out = [];
  let list = null;      // 'ul' | 'ol'
  let inTable = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inline(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const closeTable = () => {
    if (inTable) {
      out.push('</tbody></table></div>');
      inTable = false;
    }
  };
  const closeAll = () => {
    flushParagraph();
    closeList();
    closeTable();
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { closeAll(); continue; }

    // Table — a header row followed by a |---|---| separator.
    if (/^\|.*\|$/.test(trimmed)) {
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
      const next = (lines[i + 1] || '').trim();

      if (!inTable && /^\|[\s:|-]+\|$/.test(next)) {
        flushParagraph();
        closeList();
        inTable = true;
        out.push('<div class="tablewrap"><table><thead><tr>');
        out.push(cells.map((c) => `<th>${inline(c)}</th>`).join(''));
        out.push('</tr></thead><tbody>');
        i += 1; // skip the separator row
        continue;
      }
      if (inTable) {
        out.push(`<tr>${cells.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`);
        continue;
      }
    } else {
      closeTable();
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) { closeAll(); out.push('<hr>'); continue; }

    // Escaping has already run, so a quote marker arrives as "&gt;".
    if (/^&gt;\s?/.test(trimmed)) {
      closeAll();
      out.push(`<blockquote>${inline(trimmed.replace(/^&gt;\s?/, ''))}</blockquote>`);
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || numbered) {
      flushParagraph();
      const wanted = bullet ? 'ul' : 'ol';
      if (list !== wanted) { closeList(); out.push(`<${wanted}>`); list = wanted; }
      out.push(`<li>${inline((bullet || numbered)[1])}</li>`);
      continue;
    }
    closeList();

    paragraph.push(trimmed);
  }
  closeAll();
  return out.join('\n');
}

/** The full standalone page: readable on a phone, tidy on paper. */
function documentPage(doc) {
  const title = escapeHtml(doc.title);
  const written = new Date(doc.createdAt).toLocaleDateString(config.locale, {
    timeZone: config.timezone,
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root {
    --ink: #16202e; --soft: #5b6b80; --rule: #e2e8ef;
    --accent: #0b6e8c; --ground: #ffffff;
  }
  @media (prefers-color-scheme: dark) {
    :root { --ink: #e2ecf7; --soft: #93a5b8; --rule: #253141; --accent: #4fe3ff; --ground: #0d141d; }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 3rem 1.25rem 5rem;
    background: var(--ground); color: var(--ink);
    font: 17px/1.7 "Iowan Old Style", Georgia, "Times New Roman", serif;
    -webkit-text-size-adjust: 100%;
  }
  main { max-width: 42rem; margin: 0 auto; }
  .meta {
    margin-bottom: 2.5rem; padding-bottom: 1rem; border-bottom: 2px solid var(--ink);
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: .74rem;
    letter-spacing: .16em; text-transform: uppercase; color: var(--soft);
    display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap;
  }
  h1, h2, h3, h4 { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.25; text-wrap: balance; }
  h1 { font-size: 2rem; margin: 0 0 1.5rem; letter-spacing: -.02em; }
  h2 { font-size: 1.3rem; margin: 2.5rem 0 .75rem; }
  h3 { font-size: 1.08rem; margin: 1.75rem 0 .5rem; }
  h4 { font-size: .95rem; margin: 1.5rem 0 .4rem; color: var(--soft); }
  p, li { margin: 0 0 1rem; }
  ul, ol { padding-left: 1.4rem; }
  li { margin-bottom: .4rem; }
  a { color: var(--accent); }
  code {
    font: .88em ui-monospace, "SF Mono", Menlo, monospace;
    background: color-mix(in srgb, var(--rule) 60%, transparent);
    padding: .1em .35em; border-radius: 3px;
  }
  blockquote {
    margin: 1.25rem 0; padding: .25rem 0 .25rem 1.1rem;
    border-left: 3px solid var(--accent); color: var(--soft); font-style: italic;
  }
  hr { margin: 2.5rem 0; border: none; border-top: 1px solid var(--rule); }
  .tablewrap { overflow-x: auto; margin: 1.25rem 0; }
  table { border-collapse: collapse; width: 100%; font-family: ui-sans-serif, system-ui, sans-serif; font-size: .92rem; }
  th, td { padding: .55rem .7rem; text-align: left; border-bottom: 1px solid var(--rule); }
  th { font-size: .74rem; letter-spacing: .1em; text-transform: uppercase; color: var(--soft); }
  td { font-variant-numeric: tabular-nums; }
  footer {
    margin-top: 4rem; padding-top: 1rem; border-top: 1px solid var(--rule);
    font-family: ui-sans-serif, system-ui, sans-serif; font-size: .78rem; color: var(--soft);
  }
  @media print {
    body { padding: 0; background: #fff; color: #000; }
    a { color: #000; text-decoration: none; }
    footer, .meta { color: #555; }
  }
</style>
</head><body>
<main>
  <div class="meta"><span>${escapeHtml(config.name)}</span><span>${written}</span></div>
  <h1>${title}</h1>
  ${markdownToHtml(doc.markdown)}
  <footer>Written by ${escapeHtml(config.name)} for ${escapeHtml(config.ownerName)} &middot; print or save as PDF from your browser's print menu</footer>
</main>
</body></html>`;
}

module.exports = { documentPage, markdownToHtml, escapeHtml };
