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
  const sidebarToggle = document.getElementById('wiki-sidebar-toggle');
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
    text = text.replace(/`([^`]+)`/g, (_, value) => token(`<code>${escapeHTML(value)}</code>`));
    text = text.replace(/\\\$/g, () => token('$'));
    text = escapeHTML(text);
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

  // ---- Code highlighting (VS Code dark+ palette, zero-dependency tokenizer) ----
  const COPY_ICON_SVG = '<svg class="copy-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M15 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/></svg>';
  const CHECK_ICON_SVG = '<svg class="check-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const CODE_LANGS = {
    python: {
      com: '#',
      strings: ["'''", '"""'],
      kw: ['if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally', 'with', 'return', 'yield', 'break', 'continue', 'pass', 'raise', 'import', 'from', 'as', 'lambda', 'assert', 'del', 'global', 'nonlocal', 'in', 'is', 'not', 'and', 'or', 'async', 'await'],
      key: ['def', 'class'],
      cnst: ['True', 'False', 'None', 'self', 'cls'],
    },
    js: {
      com: '//', block: true, backtick: true,
      kw: ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'try', 'catch', 'finally', 'return', 'break', 'continue', 'throw', 'new', 'typeof', 'instanceof', 'in', 'of', 'delete', 'void', 'yield', 'await'],
      key: ['function', 'class', 'const', 'let', 'var', 'import', 'export', 'default', 'extends', 'implements', 'interface', 'enum', 'type', 'namespace', 'public', 'private', 'protected', 'static', 'async', 'get', 'set'],
      cnst: ['true', 'false', 'null', 'undefined', 'NaN', 'this', 'super'],
    },
    c: {
      com: '//', block: true,
      kw: ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'try', 'catch', 'return', 'break', 'continue', 'goto', 'sizeof'],
      key: ['struct', 'union', 'enum', 'typedef', 'static', 'const', 'volatile', 'inline', 'extern', 'register', 'signed', 'unsigned'],
      cnst: ['true', 'false', 'NULL'],
    },
    cpp: {
      com: '//', block: true,
      kw: ['if', 'else', 'for', 'while', 'do', 'switch', 'case', 'try', 'catch', 'return', 'break', 'continue', 'goto', 'sizeof', 'new', 'delete', 'throw'],
      key: ['struct', 'union', 'enum', 'typedef', 'class', 'template', 'typename', 'namespace', 'using', 'public', 'private', 'protected', 'static', 'const', 'volatile', 'inline', 'extern', 'friend', 'operator', 'virtual', 'override', 'final'],
      cnst: ['true', 'false', 'nullptr', 'NULL', 'this'],
    },
    sh: {
      com: '#',
      kw: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'in', 'case', 'esac', 'return', 'echo', 'source', 'shift'],
      key: ['function', 'export', 'local'],
      cnst: ['true', 'false'],
    },
    json: { kw: [], key: [], cnst: ['true', 'false', 'null'] },
    yaml: { com: '#', kw: [], key: [], cnst: ['true', 'false', 'null', 'yes', 'no', 'on', 'off'] },
  };
  CODE_LANGS.jsx = CODE_LANGS.js;
  CODE_LANGS.tsx = CODE_LANGS.js;
  CODE_LANGS.ts = CODE_LANGS.js;
  CODE_LANGS.cc = CODE_LANGS.cpp;
  CODE_LANGS.h = CODE_LANGS.c;
  CODE_LANGS.hpp = CODE_LANGS.cpp;
  CODE_LANGS.bash = CODE_LANGS.sh;
  CODE_LANGS.shell = CODE_LANGS.sh;
  CODE_LANGS.zsh = CODE_LANGS.sh;
  CODE_LANGS.yml = CODE_LANGS.yaml;

  function highlightTokens(raw, language) {
    const entry = CODE_LANGS[language];
    const src = String(raw);
    if (!entry) return escapeHTML(src);
    const kwSet = new Set(entry.kw || []);
    const keySet = new Set(entry.key || []);
    const cnstSet = new Set(entry.cnst || []);
    let out = '';
    let i = 0;
    const emit = (cls, text) => { out += `<span class="tok-${cls}">${escapeHTML(text)}</span>`; };
    while (i < src.length) {
      const ch = src[i];
      if (entry.block && ch === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end < 0 ? src.length : end + 2;
        emit('com', src.slice(i, stop));
        i = stop;
        continue;
      }
      if (entry.com && src.startsWith(entry.com, i)) {
        const end = src.indexOf('\n', i);
        emit('com', src.slice(i, end < 0 ? src.length : end));
        i = end < 0 ? src.length : end;
        continue;
      }
      let matched = false;
      for (const quote of entry.strings || []) {
        if (src.startsWith(quote, i)) {
          const end = src.indexOf(quote, i + quote.length);
          const stop = end < 0 ? src.length : end + quote.length;
          emit('str', src.slice(i, stop));
          i = stop;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      if (ch === '"' || ch === "'" || (ch === '`' && entry.backtick)) {
        let j = i + 1;
        while (j < src.length) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === ch) { j += 1; break; }
          j += 1;
        }
        emit('str', src.slice(i, j));
        i = j;
        continue;
      }
      if (/\d/.test(ch)) {
        const m = /^(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/.exec(src.slice(i));
        if (m) { emit('num', m[0]); i += m[0].length; continue; }
      }
      if (/[A-Za-z_]/.test(ch)) {
        const m = /^[A-Za-z_]\w*/.exec(src.slice(i));
        const word = m[0];
        i += word.length;
        let cls = null;
        if (kwSet.has(word)) cls = 'kw';
        else if (keySet.has(word)) cls = 'key';
        else if (cnstSet.has(word)) cls = 'cnst';
        else {
          let j = i;
          while (j < src.length && /\s/.test(src[j])) j += 1;
          if (src[j] === '(') cls = 'fn';
        }
        if (cls) emit(cls, word);
        else out += escapeHTML(word);
        continue;
      }
      out += escapeHTML(ch);
      i += 1;
    }
    return out;
  }

  const copyTimers = new Map();
  function copyWithSelection(text, button) {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    try {
      if (!document.execCommand('copy')) throw new Error('Copy unavailable');
    } finally {
      field.remove();
      button.focus({ preventScroll: true });
    }
  }
  function handleCopyClick(button) {
    const block = button.closest('.wiki-codeblock');
    const codeEl = block && block.querySelector('pre code');
    const text = codeEl ? codeEl.textContent.replace(/\n$/, '') : '';
    const previous = copyTimers.get(button);
    if (previous) window.clearTimeout(previous);
    button.disabled = true;
    button.dataset.copied = 'false';
    const setCopied = () => {
      button.dataset.copied = 'true';
      button.setAttribute('aria-label', 'Code copied');
      button.title = 'Copied';
    };
    const reset = () => {
      button.dataset.copied = 'false';
      button.setAttribute('aria-label', 'Copy code');
      button.title = 'Copy code';
    };
    (async () => {
      try {
        try {
          if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
          await navigator.clipboard.writeText(text);
        } catch {
          copyWithSelection(text, button);
        }
        setCopied();
      } catch {
        reset();
      } finally {
        button.disabled = false;
      }
      copyTimers.set(button, window.setTimeout(() => { reset(); copyTimers.delete(button); }, 3000));
    })();
  }

  function renderMarkdown(markdown, sourcePath) {
    const codeContents = [];
    const codeSpans = [];
    let text = markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
    text = text.replace(/```[\s\S]*?```/g, (block) => {
      const blockLines = block.split('\n');
      const open = blockLines.shift();
      const close = blockLines.pop();
      codeContents.push({
        language: ((open.match(/^```\s*([\w-]*)\s*$/) || [])[1] || ''),
        code: blockLines.join('\n'),
      });
      return `${open}\n\u0002${codeContents.length - 1}\u0002\n${close}`;
    });
    text = text.replace(/`([^`\n]+)`/g, (_, value) => {
      codeSpans.push(value);
      return `\u0003${codeSpans.length - 1}\u0003`;
    });
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
      const hasTask = listItems.some(item => item && typeof item === 'object' && 'checked' in item);
      const items = listItems.map(item => {
        if (item && typeof item === 'object' && 'checked' in item) {
          return `<li class="task-list-item"><input type="checkbox" disabled${item.checked ? ' checked' : ''}> ${inline(item.text, sourcePath)}</li>`;
        }
        return `<li>${inline(item, sourcePath)}</li>`;
      });
      html.push(`<${listType}${hasTask ? ' class="contains-task-list"' : ''}>${items.join('')}</${listType}>`);
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
          html.push(`<div class="wiki-codeblock"><pre><code${code.language ? ` class="language-${escapeHTML(code.language)}"` : ''}>${escapeHTML(code.lines.join('\n'))}</code></pre><button class="wiki-code-copy" type="button" aria-label="Copy code" title="Copy code">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button></div>`);
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
        const content = line.replace(/^\s*(?:[-*+]\s+|\d+\.\s+)/, '');
        const task = content.match(/^\[([ xX])\]\s*/);
        listItems.push(task ? { checked: task[1] !== ' ', text: content.slice(task[0].length) } : content);
        continue;
      }
      if (/^\s*\|/.test(line) && index + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[index + 1])) {
        flushAll(); table = [line]; index += 1; continue;
      }
      if (table && /^\s*\|/.test(line)) { table.push(line); continue; }
      if (!line.trim()) { flushAll(); continue; }
      flushList(); flushQuote(); flushTable(); paragraph.push(line.trim());
    }
    if (code) html.push(`<div class="wiki-codeblock"><pre><code${code.language ? ` class="language-${escapeHTML(code.language)}"` : ''}>${escapeHTML(code.lines.join('\n'))}</code></pre><button class="wiki-code-copy" type="button" aria-label="Copy code" title="Copy code">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button></div>`);
    flushAll();
    return html.join('\n')
      .replace(/\u0002(\d+)\u0002/g, (_, index) => {
        const entry = codeContents[Number(index)];
        return highlightTokens(entry.code, entry.language);
      })
      .replace(/\u0003(\d+)\u0003/g, (_, index) => `<code>${escapeHTML(codeSpans[Number(index)])}</code>`);
  }

  const ARROW_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  const folderOverrides = new Map();

  function buildTree() {
    const root = { folders: new Map(), notes: [] };
    [...documents.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(entry => {
      const segments = entry.id.split('/');
      let node = root;
      for (let index = 0; index < segments.length; index += 1) {
        if (index === segments.length - 1) {
          node.notes.push({ name: segments[index], entry });
        } else {
          if (!node.folders.has(segments[index])) {
            node.folders.set(segments[index], { name: segments[index], path: segments.slice(0, index + 1).join('/'), folders: new Map(), notes: [] });
          }
          node = node.folders.get(segments[index]);
        }
      }
    });
    return root;
  }

  function isFolderOpen(path) {
    if (folderOverrides.has(path)) return folderOverrides.get(path);
    return currentID ? currentID.startsWith(`${path}/`) : false;
  }

  function toggleFolder(path) {
    const folder = noteList.querySelector(`.wiki-folder[data-path="${CSS.escape(path)}"]`);
    const open = !isFolderOpen(path);
    folderOverrides.set(path, open);
    if (folder) {
      folder.classList.toggle('is-collapsed', !open);
      const arrow = folder.querySelector('.wiki-folder-arrow');
      if (arrow) {
        arrow.setAttribute('aria-expanded', String(open));
        arrow.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${folder.dataset.name}`);
      }
    }
  }

  function syncFolderStates() {
    noteList.querySelectorAll('.wiki-folder').forEach(folder => {
      const open = isFolderOpen(folder.dataset.path);
      folder.classList.toggle('is-collapsed', !open);
      const arrow = folder.querySelector('.wiki-folder-arrow');
      if (arrow) {
        arrow.setAttribute('aria-expanded', String(open));
        arrow.setAttribute('aria-label', `${open ? 'Collapse' : 'Expand'} ${folder.dataset.name}`);
      }
    });
  }

  function revealNote(id) {
    const segments = id.split('/');
    for (let index = 0; index < segments.length - 1; index += 1) {
      folderOverrides.set(segments.slice(0, index + 1).join('/'), true);
    }
    syncFolderStates();
  }

  function renderFolderNode(node, container) {
    [...node.folders.values()].sort((a, b) => a.name.localeCompare(b.name)).forEach(folder => {
      const folderEntry = documents.get(`${folder.path}/index.md`);
      const folderEl = document.createElement('div');
      folderEl.className = 'wiki-folder';
      folderEl.dataset.path = folder.path;
      folderEl.dataset.name = folder.name;
      const row = document.createElement('div');
      row.className = 'wiki-folder-row';
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'wiki-folder-arrow';
      arrow.setAttribute('aria-label', `Expand ${folder.name}`);
      arrow.innerHTML = ARROW_SVG;
      let name;
      if (folderEntry) {
        name = document.createElement('a');
        name.className = 'wiki-folder-name wiki-note-link';
        name.href = `wiki.html?note=${encodeURIComponent(folderEntry.id)}`;
        name.dataset.noteId = folderEntry.id;
        name.dataset.searchText = folder.path;
        name.title = folderEntry.id;
        name.textContent = folder.name;
      } else {
        name = document.createElement('span');
        name.className = 'wiki-folder-name';
        name.textContent = folder.name;
      }
      row.append(arrow, name);
      const children = document.createElement('div');
      children.className = 'wiki-folder-children';
      const inner = document.createElement('div');
      inner.className = 'wiki-folder-children-inner';
      renderFolderNode(folder, inner);
      folder.notes.sort((a, b) => a.name.localeCompare(b.name)).forEach(note => {
        if (note.entry.id === `${folder.path}/index`) return;
        const link = document.createElement('a');
        link.className = 'wiki-note-link';
        link.href = `wiki.html?note=${encodeURIComponent(note.entry.id)}`;
        link.dataset.noteId = note.entry.id;
        link.dataset.searchText = note.entry.id;
        link.title = note.entry.id;
        link.textContent = note.name;
        inner.append(link);
      });
      children.append(inner);
      folderEl.append(row, children);
      container.append(folderEl);
    });
  }

  function renderList() {
    noteList.innerHTML = '';
    const tree = buildTree();
    renderFolderNode(tree, noteList);
    tree.notes.sort((a, b) => a.name.localeCompare(b.name)).forEach(note => {
      if (note.entry.id === 'index') return;
      const link = document.createElement('a');
      link.className = 'wiki-note-link';
      link.href = `wiki.html?note=${encodeURIComponent(note.entry.id)}`;
      link.dataset.noteId = note.entry.id;
      link.dataset.searchText = note.entry.id;
      link.title = note.entry.id;
      link.textContent = note.name;
      noteList.append(link);
    });
    syncFolderStates();
    updateList();
  }

  function updateList() {
    const query = search.value.trim().toLowerCase();
    let visible = 0;
    let total = 0;
    noteList.querySelectorAll('.wiki-note-link').forEach(link => {
      total += 1;
      const shown = !query || (link.dataset.searchText || link.textContent).toLowerCase().includes(query);
      link.classList.toggle('is-hidden', !shown);
      if (shown) visible += 1;
    });
    noteList.querySelectorAll('.wiki-folder').forEach(folder => {
      if (!query) { folder.classList.remove('is-hidden'); return; }
      const subtreeMatch = folder.querySelectorAll('.wiki-note-link:not(.is-hidden)').length > 0;
      folder.classList.toggle('is-hidden', !subtreeMatch);
      folder.classList.remove('is-collapsed');
    });
    if (!query) syncFolderStates();
    status.textContent = query ? `${visible} of ${total} notes` : `${visible} notes`;
  }

  function markCurrent() {
    noteList.querySelectorAll('.wiki-note-link').forEach(link => {
      if (link.dataset.noteId === currentID) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  function renderNote(entry) {
    const rawTitle = entry.markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/^#\s+(.+?)\s*$/m);
    const title = rawTitle ? rawTitle[1].replace(/[#*_`]/g, '').trim() : titleFromID(entry.id);
    article.innerHTML = `<div class="wiki-note-meta">${escapeHTML(entry.path)}</div>${renderMarkdown(entry.markdown, entry.path)}`;
    document.title = `${title} | Real-Time Manim Wiki`;
    markCurrent();
    revealNote(entry.id);
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
    const target = entryByID(id) ? id : 'index';
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
      if (sidebarToggle) {
        const setTocState = (collapsed) => {
          shell.classList.toggle('is-toc-collapsed', collapsed);
          sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
          sidebarToggle.setAttribute('aria-label', collapsed ? 'Show notes' : 'Hide notes');
        };
        setTocState(localStorage.getItem('wiki-toc-collapsed') === '1');
        sidebarToggle.addEventListener('click', () => {
          const collapsed = shell.classList.toggle('is-toc-collapsed');
          sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
          sidebarToggle.setAttribute('aria-label', collapsed ? 'Show notes' : 'Hide notes');
          try { localStorage.setItem('wiki-toc-collapsed', collapsed ? '1' : '0'); } catch { /* private mode */ }
        });
      }
      search.addEventListener('input', updateList);
      noteList.addEventListener('click', event => {
        const link = event.target.closest('.wiki-note-link');
        if (link) {
          event.preventDefault();
          navigate(link.dataset.noteId);
          return;
        }
        const arrow = event.target.closest('.wiki-folder-arrow');
        if (arrow) {
          toggleFolder(arrow.closest('.wiki-folder').dataset.path);
          return;
        }
        const plainName = event.target.closest('.wiki-folder-name');
        if (plainName) toggleFolder(plainName.closest('.wiki-folder').dataset.path);
      });
      article.addEventListener('click', event => {
        const copyButton = event.target.closest('.wiki-code-copy');
        if (copyButton) {
          handleCopyClick(copyButton);
          return;
        }
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
