(() => {
  const shell = document.querySelector('.wiki-shell');
  if (!shell) return;

  const sourceRoot = new URL(shell.dataset.sourceRoot || '../../test_wiki_file/', document.baseURI);
  const entryPath = shell.dataset.entryPath || 'index.md';
  const manifestPath = shell.dataset.manifestPath || 'manifest.json';
  const article = document.getElementById('wiki-article');
  const search = document.getElementById('wiki-search');
  const status = document.getElementById('wiki-status');
  const noteList = document.getElementById('wiki-note-list');
  const localHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  let documents = new Map();
  let currentID = '';
  let sourceSignature = '';
  let refreshTimer;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
  const normalizePath = path => decodeURIComponent(path).replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  const noteID = path => normalizePath(path).replace(/\.md$/i, '');
  const titleFromID = id => id.split('/').pop().replace(/[-_]/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

  function splitTarget(raw) {
    let target = raw.trim();
    if (target.startsWith('<')) {
      const close = target.indexOf('>');
      target = close >= 0 ? target.slice(1, close) : target;
    } else {
      target = target.split(/\s+/)[0];
    }
    const hash = target.indexOf('#');
    return {
      path: hash >= 0 ? target.slice(0, hash) : target,
      fragment: hash >= 0 ? target.slice(hash + 1) : '',
    };
  }

  function extractLinks(markdown) {
    const links = [];
    const source = markdown.replace(/```[\s\S]*?```/g, '');
    const markdownPattern = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = markdownPattern.exec(source))) {
      if (match[1] !== '!') {
        const target = splitTarget(match[3]);
        links.push({ ...target, vaultRelative: false, label: match[2] });
      }
    }
    const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
    while ((match = wikilinkPattern.exec(source))) {
      const [rawTarget, label] = match[1].split('|');
      const target = splitTarget(rawTarget);
      if (target.path) links.push({ ...target, path: target.path.endsWith('.md') ? target.path : `${target.path}.md`, vaultRelative: true, label: label || rawTarget });
    }
    return links;
  }

  async function fetchText(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  function resolvePath(sourcePath, link, known = null) {
    const target = link.path;
    if (!target || !target.toLowerCase().endsWith('.md') || /^[a-z][a-z\d+.-]*:/i.test(target)) return null;
    if (link.vaultRelative) {
      const normalized = normalizePath(target).replace(/\.md$/i, '');
      const exact = `${normalized}.md`;
      if (known?.has(exact)) return exact;
      const matches = known ? [...known.keys()].filter(path => noteID(path).split('/').pop() === normalized) : [];
      return matches.length === 1 ? matches[0] : (known ? null : exact);
    }
    try {
      const absolute = new URL(target, new URL(sourcePath, sourceRoot));
      const prefix = sourceRoot.pathname.endsWith('/') ? sourceRoot.pathname : `${sourceRoot.pathname}/`;
      if (!absolute.pathname.startsWith(prefix)) return null;
      return normalizePath(absolute.pathname.slice(prefix.length));
    } catch {
      return null;
    }
  }

  async function discover() {
    const manifest = JSON.parse(await fetchText(new URL(manifestPath, sourceRoot)));
    if (!Array.isArray(manifest.files)) throw new Error('Wiki manifest must contain a files array.');
    const manifestPaths = manifest.files.filter(path => typeof path === 'string' && path.toLowerCase().endsWith('.md'));
    const found = new Map();
    const queue = [entryPath, ...manifestPaths];
    while (queue.length) {
      const path = normalizePath(queue.shift());
      if (found.has(path)) continue;
      let markdown;
      try {
        markdown = await fetchText(new URL(path, sourceRoot));
      } catch (error) {
        if (path === entryPath) throw error;
        continue;
      }
      found.set(path, { id: noteID(path), path, markdown });
      for (const link of extractLinks(markdown)) {
        const targetPath = resolvePath(path, link);
        if (targetPath && !found.has(targetPath)) queue.push(targetPath);
      }
    }
    return found;
  }

  function internalTarget(rawTarget, sourcePath) {
    const target = splitTarget(rawTarget);
    if (!target.path) return null;
    const link = { ...target, vaultRelative: false };
    let path = resolvePath(sourcePath, link, documents);
    if (!path && !target.path.includes('/')) {
      const normalized = `${target.path.replace(/\.md$/i, '')}`;
      const matches = [...documents.keys()].filter(candidate => noteID(candidate).split('/').pop() === normalized);
      if (matches.length === 1) path = matches[0];
    }
    if (!path) return null;
    return { id: noteID(path), fragment: target.fragment };
  }

  function safeExternalHref(rawTarget) {
    try {
      const url = new URL(rawTarget, document.baseURI);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  function inline(raw, sourcePath) {
    const tokens = [];
    const token = html => `\u0000${tokens.push(html) - 1}\u0000`;
    let text = String(raw);
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt) => escapeHTML(alt));
    text = text.replace(/\[\[([^\]]+)\]\]/g, (_, body) => {
      const [rawTarget, rawLabel] = body.split('|');
      const internal = internalTarget(rawTarget, sourcePath);
      if (!internal) return escapeHTML(rawLabel || rawTarget);
      const href = `wiki.html?note=${encodeURIComponent(internal.id)}${internal.fragment ? `#${encodeURIComponent(internal.fragment)}` : ''}`;
      return token(`<a href="${href}">${inline(rawLabel || rawTarget, sourcePath)}</a>`);
    });
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, rawTarget) => {
      const internal = internalTarget(rawTarget, sourcePath);
      if (internal) {
        const href = `wiki.html?note=${encodeURIComponent(internal.id)}${internal.fragment ? `#${encodeURIComponent(internal.fragment)}` : ''}`;
        return token(`<a href="${href}">${inline(label, sourcePath)}</a>`);
      }
      const external = safeExternalHref(splitTarget(rawTarget).path);
      return external ? token(`<a href="${escapeHTML(external)}" rel="noreferrer">${inline(label, sourcePath)}</a>`) : escapeHTML(label);
    });
    text = escapeHTML(text);
    text = text.replace(/`([^`]+)`/g, (_, value) => token(`<code>${escapeHTML(value)}</code>`));
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');
    return text.replace(/\u0000(\d+)\u0000/g, (_, index) => tokens[Number(index)]);
  }

  function headingID(raw, used) {
    const base = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section';
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}-${count + 1}` : base;
  }

  function renderMarkdown(markdown, sourcePath) {
    const text = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const html = [];
    const usedIDs = new Map();
    let paragraph = [];
    let listType = null;
    let listItems = [];
    let quote = [];
    let code = null;
    let table = null;
    const flushParagraph = () => {
      if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '), sourcePath)}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!listType) return;
      html.push(`<${listType}>${listItems.map(item => `<li>${inline(item, sourcePath)}</li>`).join('')}</${listType}>`);
      listType = null;
      listItems = [];
    };
    const flushQuote = () => {
      if (quote.length) html.push(`<blockquote>${renderMarkdown(quote.join('\n'), sourcePath)}</blockquote>`);
      quote = [];
    };
    const flushTable = () => {
      if (!table) return;
      const [header, ...rows] = table;
      const cells = row => row.split('|').slice(1, -1).map(cell => cell.trim());
      html.push(`<table><thead><tr>${cells(header).map(cell => `<th>${inline(cell, sourcePath)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${cells(row).map(cell => `<td>${inline(cell, sourcePath)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      table = null;
    };
    const flushAll = () => { flushParagraph(); flushList(); flushQuote(); flushTable(); };

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (code) {
        if (/^```/.test(line)) {
          html.push(`<pre><code${code.language ? ` class="language-${escapeHTML(code.language)}"` : ''}>${escapeHTML(code.lines.join('\n'))}</code></pre>`);
          code = null;
        } else code.lines.push(line);
        continue;
      }
      const fence = line.match(/^```\s*([\w-]*)\s*$/);
      if (fence) { flushAll(); code = { language: fence[1], lines: [] }; continue; }
      if (/^\s*<!--/.test(line)) continue;
      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (heading) {
        flushAll();
        const level = heading[1].length;
        html.push(`<h${level} id="${headingID(heading[2], usedIDs)}">${inline(heading[2], sourcePath)}</h${level}>`);
        continue;
      }
      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) { flushAll(); html.push('<hr>'); continue; }
      if (/^\s*>/.test(line)) { flushParagraph(); flushList(); flushTable(); quote.push(line.replace(/^\s*>\s?/, '')); continue; }
      if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        flushParagraph(); flushQuote(); flushTable();
        const type = /^\s*\d+\./.test(line) ? 'ol' : 'ul';
        if (listType && listType !== type) flushList();
        listType = type;
        listItems.push(line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, ''));
        continue;
      }
      if (/^\s*\|/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
        flushAll(); table = [line]; index += 1; continue;
      }
      if (table && /^\s*\|/.test(line)) { table.push(line); continue; }
      if (!line.trim()) { flushAll(); continue; }
      flushList(); flushQuote(); flushTable(); paragraph.push(line.trim());
    }
    if (code) html.push(`<pre><code>${escapeHTML(code.lines.join('\n'))}</code></pre>`);
    flushAll();
    return html.join('\n');
  }

  function renderList() {
    noteList.innerHTML = '';
    [...documents.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(entry => {
      const link = document.createElement('a');
      link.className = 'wiki-note-link';
      link.href = `wiki.html?note=${encodeURIComponent(entry.id)}`;
      link.dataset.noteID = entry.id;
      link.textContent = entry.id.split('/').join(' / ');
      noteList.append(link);
    });
    updateList();
  }

  function updateList() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    noteList.querySelectorAll('.wiki-note-link').forEach(link => {
      const shown = !query || link.textContent.toLowerCase().includes(query);
      link.classList.toggle('is-hidden', !shown);
      if (shown) visible += 1;
    });
    status.textContent = `${visible} of ${documents.size} notes`;
  }

  function markCurrent() {
    noteList.querySelectorAll('.wiki-note-link').forEach(link => {
      if (link.dataset.noteID === currentID) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderNote(entry) {
    const rawTitle = entry.markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/^#\s+(.+?)\s*$/m);
    const title = rawTitle ? rawTitle[1].replace(/[#*_`]/g, '').trim() : titleFromID(entry.id);
    article.innerHTML = `<div class="wiki-note-meta">${escapeHTML(entry.path)}</div>${renderMarkdown(entry.markdown, entry.path)}`;
    document.title = `${title} | Real-Time Manim Wiki`;
    markCurrent();
  }

  function entryByID(id) {
    return [...documents.values()].find(entry => entry.id === id);
  }

  async function loadNote(id) {
    const entry = entryByID(id) || entryByID('index');
    if (!entry) {
      article.innerHTML = '<p class="wiki-error">No Markdown notes were found.</p>';
      return;
    }
    currentID = entry.id;
    article.innerHTML = '<p class="wiki-loading">Loading note...</p>';
    try {
      if (!entry.markdown) entry.markdown = await fetchText(new URL(entry.path, sourceRoot));
      renderNote(entry);
      updateList();
    } catch (error) {
      console.error('wiki note:', error);
      article.innerHTML = '<p class="wiki-error">This note could not be loaded.</p>';
    }
  }

  function navigate(id, push = true) {
    const target = documents.has(id) ? id : 'index';
    if (push) history.pushState({}, '', `wiki.html?note=${encodeURIComponent(target)}`);
    loadNote(target);
  }

  async function refreshSource(renderCurrent = true) {
    const next = await discover();
    const signature = [...next.values()].map(entry => `${entry.path}:${entry.markdown}`).join('\u0001');
    const changed = signature !== sourceSignature;
    documents = next;
    sourceSignature = signature;
    if (changed) {
      renderList();
      if (renderCurrent) await loadNote(currentID || new URLSearchParams(location.search).get('note') || 'index');
    } else {
      updateList();
    }
    return changed;
  }

  async function init() {
    try {
      await refreshSource(false);
      search.addEventListener('input', updateList);
      noteList.addEventListener('click', event => {
        const link = event.target.closest('.wiki-note-link');
        if (!link) return;
        event.preventDefault();
        navigate(link.dataset.noteID);
      });
      article.addEventListener('click', event => {
        const link = event.target.closest('a');
        const match = link?.getAttribute('href')?.match(/^wiki\.html\?note=([^#]+)(?:#.*)?$/);
        if (!match) return;
        event.preventDefault();
        navigate(decodeURIComponent(match[1]));
      });
      window.addEventListener('popstate', () => navigate(new URLSearchParams(location.search).get('note') || 'index', false));
      await loadNote(new URLSearchParams(location.search).get('note') || 'index');
      if (localHost) refreshTimer = window.setInterval(() => refreshSource(true).catch(error => console.error('wiki refresh:', error)), 5000);
    } catch (error) {
      console.error('wiki:', error);
      article.innerHTML = '<p class="wiki-error">The wiki source could not be loaded. Serve the site over HTTP.</p>';
    }
  }

  init();
})();
