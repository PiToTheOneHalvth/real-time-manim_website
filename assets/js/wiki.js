(() => {
  const shell = document.querySelector('.wiki-shell');
  if (!shell) return;

  // The manual lives in another repository, served through a public CDN. CDN
  // reachability varies by network — raw.githubusercontent.com is blocked on
  // some, cdn.jsdelivr.net on others — so the page lists a primary source plus
  // any mirrors in data-source-mirror (whitespace/comma separated). A source
  // that cannot be read falls through to the next one (see loadSource).
  const DEFAULT_SOURCE = 'https://cdn.jsdelivr.net/gh/BEGINWITHF/real-time-manim@main/RTM-Wiki/en_US/';
  let sourceRootRaw = shell.dataset.sourceRoot || DEFAULT_SOURCE;
  const SOURCES = [sourceRootRaw, ...((shell.dataset.sourceMirror || '').match(/[^\s,]+/g) || [])];
  let sourceIndex = 0;
  let sourceRoot = new URL(sourceRootRaw, document.baseURI);
  const entryPath = shell.dataset.entryPath || 'index.md';
  const manifestPath = shell.dataset.manifestPath || 'manifest.json';
  const article = document.getElementById('wiki-article');
  const search = document.getElementById('wiki-search');
  const status = document.getElementById('wiki-status');
  const noteList = document.getElementById('wiki-note-list');
  const sidebarToggle = document.getElementById('wiki-sidebar-toggle');
  const listToggle = document.getElementById('wiki-list-toggle');
  const mobileLayout = window.matchMedia('(max-width: 720px)');
  const localHost = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let catalog = new Map();
  const markdownCache = new Map();
  let currentID = '';
  let noteRequest = 0;
  let sourceSignature = '';
  let refreshTimer;

  const UI_STRINGS = {
    en: {
      notes: count => `${count} notes`,
      ofNotes: (visible, total) => `${visible} of ${total} notes`,
      noMatches: 'No matching notes',
      loadingNote: 'Loading note...',
      noNotes: 'No Markdown notes were found.',
      noteError: 'This note could not be loaded.',
      sourceError: 'The wiki source could not be loaded. Serve the site over HTTP.',
      copied: 'Code copied',
      copyCode: 'Copy code',
      showNotes: 'Show notes',
      hideNotes: 'Hide notes',
      expand: name => `Expand ${name}`,
      collapse: name => `Collapse ${name}`,
    },
    zh: {
      notes: count => `${count} 篇笔记`,
      ofNotes: (visible, total) => `${total} 篇中 ${visible} 篇`,
      noMatches: '没有匹配的笔记',
      loadingNote: '正在加载笔记…',
      noNotes: '未找到任何 Markdown 笔记。',
      noteError: '无法加载该笔记。',
      sourceError: '无法加载 Wiki 源。请通过 HTTP 提供本站点。',
      copied: '已复制',
      copyCode: '复制代码',
      showNotes: '显示笔记',
      hideNotes: '隐藏笔记',
      expand: name => `展开 ${name}`,
      collapse: name => `折叠 ${name}`,
    },
  };
  const ui = UI_STRINGS[shell.dataset.ui === 'zh' ? 'zh' : 'en'];

  // On a phone the drawer is a bar and the note list hangs out of it as an
  // overlay. This chevron, and focusing the search field, open it; picking a
  // note, tapping anywhere else or resizing the window closes it. On a wide
  // screen the chevron is hidden and none of this runs.
  function setListOpen(open) {
    if (!listToggle) return;
    shell.classList.toggle('is-list-open', open);
    listToggle.setAttribute('aria-expanded', String(open));
    listToggle.setAttribute('aria-label', open ? ui.hideNotes : ui.showNotes);
    listToggle.title = open ? ui.hideNotes : ui.showNotes;
  }

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
      target = target.replace(/\s+(['"])[^'"]*\1\s*$/, '');
    }
    const hash = target.indexOf('#');
    return {
      path: hash >= 0 ? target.slice(0, hash) : target,
      fragment: hash >= 0 ? target.slice(hash + 1) : '',
    };
  }

  // A remote source (e.g. GitHub raw) is worth caching; the localhost dev
  // server keeps no-store so the 5s live-reload still sees edits.
  const FETCH_CACHE = localHost ? 'no-store' : 'default';

  async function fetchText(url) {
    const response = await fetch(url, { cache: FETCH_CACHE });
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

  function resolveAssetPath(sourcePath, link) {
    const target = link.path;
    if (!target || /^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('/') || target.startsWith('#')) return null;
    try {
      const absolute = new URL(target, new URL(sourcePath, sourceRoot));
      const prefix = sourceRoot.pathname.endsWith('/') ? sourceRoot.pathname : `${sourceRoot.pathname}/`;
      if (!absolute.pathname.startsWith(prefix)) return null;
      const asset = normalizePath(absolute.pathname.slice(prefix.length));
      return asset || null;
    } catch {
      return null;
    }
  }

  function resolveMediaSrcs(raw, sourcePath) {
    return raw.replace(/(src\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, src) => {
      if (/^[a-z][a-z\d+.-]*:/i.test(src) || src.startsWith('/') || src.startsWith('#')) return match;
      const asset = resolveAssetPath(sourcePath, { path: src, vaultRelative: false });
      return asset ? `${prefix}${quote}${sourceRootRaw}${asset}${quote}` : match;
    });
  }

  // Only the manifest is fetched up front: it lists every note path, which is
  // all the sidebar tree and search need. A note's Markdown is fetched on
  // demand (see loadNote), so the first paint costs one small request instead
  // of the whole vault.
  async function loadCatalog() {
    const manifest = JSON.parse(await fetchText(new URL(manifestPath, sourceRoot)));
    if (!Array.isArray(manifest.files)) throw new Error('Wiki manifest must contain a files array.');
    const entries = new Map();
    const add = path => {
      if (typeof path !== 'string') return;
      const normalized = normalizePath(path);
      if (!normalized.toLowerCase().endsWith('.md') || entries.has(normalized)) return;
      entries.set(normalized, { id: noteID(normalized), path: normalized });
    };
    add(entryPath);
    manifest.files.forEach(add);
    return entries;
  }

  function internalTarget(rawTarget, sourcePath) {
    const target = splitTarget(rawTarget);
    if (!target.path) return null;
    const link = { ...target, vaultRelative: false };
    let path = resolvePath(sourcePath, link, catalog);
    if (!path && !target.path.includes('/')) {
      const normalized = `${target.path.replace(/\.md$/i, '')}`;
      const matches = [...catalog.keys()].filter(candidate => noteID(candidate).split('/').pop() === normalized);
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
      const assetPath = resolveAssetPath(sourcePath, { path: splitTarget(rawTarget).path, vaultRelative: false });
      if (assetPath) return token(`<a href="${escapeHTML(sourceRootRaw + assetPath)}" rel="noreferrer">${inline(label, sourcePath)}</a>`);
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
    const base = raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'section';
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
      button.setAttribute('aria-label', ui.copied);
      button.title = ui.copied;
    };
    const reset = () => {
      button.dataset.copied = 'false';
      button.setAttribute('aria-label', ui.copyCode);
      button.title = ui.copyCode;
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
          if (code.language === 'mermaid') {
            html.push(`<div class="wiki-mermaid">${code.lines.join('\n')}</div>`);
          } else {
            html.push(`<div class="wiki-codeblock"><pre><code${code.language ? ` class="language-${escapeHTML(code.language)}"` : ''}>${escapeHTML(code.lines.join('\n'))}</code></pre><button class="wiki-code-copy" type="button" aria-label="${ui.copyCode}" title="${ui.copyCode}">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button></div>`);
          }
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
      if (/^<video\b/i.test(line)) {
        flushAll();
        let videoHTML = line;
        while (!/<\/video\s*>\s*$/i.test(videoHTML) && index + 1 < lines.length) {
          index += 1;
          videoHTML += `\n${lines[index]}`;
        }
        html.push(`<div class="wiki-video">${resolveMediaSrcs(videoHTML, sourcePath)}</div>`);
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
    if (code) {
      if (code.language === 'mermaid') {
        html.push(`<div class="wiki-mermaid">${code.lines.join('\n')}</div>`);
      } else {
        html.push(`<div class="wiki-codeblock"><pre><code${code.language ? ` class="language-${escapeHTML(code.language)}"` : ''}>${escapeHTML(code.lines.join('\n'))}</code></pre><button class="wiki-code-copy" type="button" aria-label="${ui.copyCode}" title="${ui.copyCode}">${COPY_ICON_SVG}${CHECK_ICON_SVG}</button></div>`);
      }
    }
    flushAll();
    return html.join('\n')
      .replace(/\u0002(\d+)\u0002/g, (_, index) => {
        const entry = codeContents[Number(index)];
        if (entry.language === 'mermaid') return `<div class="wiki-mermaid-source" hidden>${escapeHTML(entry.code)}</div>`;
        return highlightTokens(entry.code, entry.language);
      })
      .replace(/\u0003(\d+)\u0003/g, (_, index) => `<code>${escapeHTML(codeSpans[Number(index)])}</code>`);
  }

  const ARROW_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  const folderOverrides = new Map();

  function buildTree() {
    const root = { folders: new Map(), notes: [] };
    [...catalog.values()].sort((a, b) => a.id.localeCompare(b.id)).forEach(entry => {
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
        arrow.setAttribute('aria-label', `${open ? ui.collapse(folder.dataset.name) : ui.expand(folder.dataset.name)}`);
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
        arrow.setAttribute('aria-label', `${open ? ui.collapse(folder.dataset.name) : ui.expand(folder.dataset.name)}`);
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
      const folderEntry = catalog.get(`${folder.path}/index.md`) || catalog.get(`${folder.path}/README.md`);
      const folderEl = document.createElement('div');
      folderEl.className = 'wiki-folder';
      folderEl.dataset.path = folder.path;
      folderEl.dataset.name = folder.name;
      const row = document.createElement('div');
      row.className = 'wiki-folder-row';
      const arrow = document.createElement('button');
      arrow.type = 'button';
      arrow.className = 'wiki-folder-arrow';
      arrow.setAttribute('aria-label', ui.expand(folder.name));
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
        if (folderEntry && note.entry.id === folderEntry.id) return;
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
      if (note.entry.id === noteID(entryPath)) return;
      const link = document.createElement('a');
      link.className = 'wiki-note-link';
      link.href = `wiki.html?note=${encodeURIComponent(note.entry.id)}`;
      link.dataset.noteId = note.entry.id;
      link.dataset.searchText = note.entry.id;
      link.dataset.name = note.name;
      link.title = note.entry.id;
      link.textContent = note.name;
      noteList.append(link);
    });
    syncFolderStates();
    updateList();
  }

  // ---- Search ---------------------------------------------------------------
  // Whitespace splits the query into terms that must all match (in any order),
  // each either as a substring or — for typos and abbreviations such as
  // "trcore" — as a subsequence of the note's path. Matches inside the visible
  // name are marked, and ↓ / ↑ / Enter drive the list from the keyboard.
  let searchCursor = -1;

  function searchTerms() {
    return search.value.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function hasSubsequence(text, term) {
    let index = 0;
    for (const character of text) {
      if (character === term[index]) index += 1;
      if (index === term.length) return true;
    }
    return false;
  }

  function matchesTerm(text, term) {
    return text.includes(term) || (term.length > 2 && hasSubsequence(text, term));
  }

  // Mark the runs of `terms` inside the link's visible name. Matching runs on the
  // whole path, so a term may not appear in the name at all.
  function markMatches(link, terms) {
    const name = link.dataset.name || link.textContent;
    const lower = name.toLowerCase();
    const ranges = [];
    for (const term of terms) {
      if (term.length < 2) continue;
      let from = 0;
      for (;;) {
        const at = lower.indexOf(term, from);
        if (at < 0) break;
        ranges.push([at, at + term.length]);
        from = at + term.length;
      }
    }
    if (!ranges.length) {
      if (link.dataset.marked) { link.textContent = name; delete link.dataset.marked; }
      return;
    }
    ranges.sort((a, b) => a[0] - b[0]);
    let html = '';
    let at = 0;
    for (const [start, end] of ranges) {
      const from = Math.max(start, at);
      if (end <= from) continue;
      html += `${escapeHTML(name.slice(at, from))}<mark>${escapeHTML(name.slice(from, end))}</mark>`;
      at = end;
    }
    html += escapeHTML(name.slice(at));
    link.innerHTML = html;
    link.dataset.marked = '1';
  }

  function shownLinks() {
    return [...noteList.querySelectorAll('.wiki-note-link:not(.is-hidden)')];
  }

  function moveCursor(step) {
    const links = shownLinks();
    if (!links.length) return;
    searchCursor = Math.max(0, Math.min(links.length - 1, searchCursor + step));
    links.forEach((link, index) => link.classList.toggle('is-cursor', index === searchCursor));
    links[searchCursor].scrollIntoView({ block: 'nearest' });
  }

  function updateList() {
    const terms = searchTerms();
    searchCursor = -1;
    let visible = 0;
    const links = [...noteList.querySelectorAll('.wiki-note-link')];
    for (const link of links) {
      link.classList.remove('is-cursor');
      const text = (link.dataset.searchText || link.textContent).toLowerCase();
      const matched = !terms.length || terms.every(term => matchesTerm(text, term));
      link.classList.toggle('is-hidden', !matched);
      markMatches(link, matched ? terms : []);
      if (matched) visible += 1;
    }
    noteList.querySelectorAll('.wiki-folder').forEach(folder => {
      if (!terms.length) { folder.classList.remove('is-hidden'); return; }
      const subtreeMatch = folder.querySelectorAll('.wiki-note-link:not(.is-hidden)').length > 0;
      folder.classList.toggle('is-hidden', !subtreeMatch);
      folder.classList.remove('is-collapsed');
    });
    if (!terms.length) {
      syncFolderStates();
      status.textContent = ui.notes(visible);
    } else if (visible) {
      status.textContent = ui.ofNotes(visible, links.length);
    } else {
      status.textContent = ui.noMatches;
    }
  }

  function handleSearchKey(event) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveCursor(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (event.key === 'Enter') {
      const links = shownLinks();
      const target = links[searchCursor] || links[0];
      if (!target) return;
      event.preventDefault();
      navigate(target.dataset.noteId);
      return;
    }
    if (event.key === 'Escape' && search.value) {
      // Clear the field first; only an already-empty box closes the panel.
      event.preventDefault();
      event.stopPropagation();
      search.value = '';
      updateList();
      return;
    }
    if (event.key === 'Escape' && shell.classList.contains('is-list-open')) setListOpen(false);
  }

  function markCurrent() {
    noteList.querySelectorAll('.wiki-note-link').forEach(link => {
      if (link.dataset.noteId === currentID) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
  }

  let mermaidInit = false;
  let mermaidRenderCount = 0;
  function renderMermaidBlocks(container) {
    if (typeof window.mermaid === 'undefined') return;
    const blocks = [...container.querySelectorAll('.wiki-mermaid')];
    if (!blocks.length) return;
    if (!mermaidInit) {
      window.mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { background: 'transparent' } });
      mermaidInit = true;
    }
    blocks.forEach((block) => {
      const source = block.querySelector('.wiki-mermaid-source');
      if (!source) return;
      mermaidRenderCount += 1;
      window.mermaid.render(`wiki-mermaid-${mermaidRenderCount}`, source.textContent).then(({ svg }) => {
        block.innerHTML = svg;
        block.classList.add('is-rendered');
      }).catch((error) => {
        block.classList.add('is-error');
        source.hidden = false;
        console.error('wiki mermaid:', error);
      });
    });
  }

  // ---- Loading indicator ----------------------------------------------------
  // A gyro: two rings on shifted X/Y axes, revolved so the tilt reads as depth.
  // Monochrome — the outer ring is solid, the inner is dashed, and the RTM icon
  // sits at the centre. Drawn as a pure function of time (see drawGyro): any t
  // gives one frame, the loop is seamless, and reduced motion freezes one.
  const GYRO_W = 320;
  const GYRO_H = 200;
  const GYRO_DUR = 2.6;
  const GYRO_TAU = Math.PI * 2;
  const GYRO_CX = 160;
  const GYRO_CY = 96;
  const GYRO_TILT = 55 * Math.PI / 180;
  const GYRO_ICON = 52;
  const GYRO_INK = '#f5f5f5';
  const GYRO_DIM = '#9a9a9a';
  const gyroProject = (x, y, z, cx, cy, f) => { const s = f / (f + z); return [cx + x * s, cy + y * s, s]; };
  const LOADER_HTML = '<div class="wiki-loader" role="status" aria-live="polite" aria-label="Loading"><canvas class="wiki-loader-canvas" aria-hidden="true"></canvas><div class="wiki-loader-bar" aria-hidden="true"><span class="wiki-loader-bar-fill"></span></div></div>';
  const loaderIcon = new Image();
  loaderIcon.decoding = 'async';
  loaderIcon.src = new URL('../../assets/images/real-time-manim-icon.png', document.baseURI).href;
  // One gyro per canvas: restarting it, or shutting it down, bumps the canvas's
  // token so the previous animation loop closes itself.
  const loaderRuns = new WeakMap();

  function drawGyro(g, t) {
    const phase = (((t % GYRO_DUR) + GYRO_DUR) % GYRO_DUR) / GYRO_DUR;   // seamless 0..1 loop
    const spin = phase * GYRO_TAU;
    const tilt = Math.sin(phase * GYRO_TAU) * GYRO_TILT;
    const project = (x, y, z) => {
      const x1 = x * Math.cos(spin) + z * Math.sin(spin);
      const z1 = -x * Math.sin(spin) + z * Math.cos(spin);
      const y2 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
      const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
      return [x1, y2, z2];
    };
    const ring = (fn, n = 72) => {
      const out = [];
      for (let i = 0; i < n; i += 1) {
        const p0 = project(...fn(i / n * GYRO_TAU));
        const p1 = project(...fn((i + 1) / n * GYRO_TAU));
        out.push([p0, p1, (p0[2] + p1[2]) / 2]);
      }
      return out;
    };
    const ringOuter = ring(a => [Math.cos(a) * 58, Math.sin(a) * 58, 0]);
    const ringInner = ring(a => [0, Math.cos(a) * 44, Math.sin(a) * 44]);
    // One stroke per contiguous front/back arc: it lets the logo sit between the
    // halves and lets a dash pattern run cleanly. Each ring is otherwise one
    // flat colour — no brightness split between the near and far side.
    const strokeArc = (segments, front, color, width, dash) => {
      let run = [];
      const flush = () => {
        if (run.length > 1) {
          if (dash) g.setLineDash(dash);
          g.beginPath();
          run.forEach((point, index) => {
            const q = gyroProject(point[0], point[1], point[2], GYRO_CX, GYRO_CY, 360);
            if (index) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
          });
          g.strokeStyle = color;
          g.lineWidth = width;
          g.lineCap = 'round';
          g.lineJoin = 'round';
          g.stroke();
          if (dash) g.setLineDash([]);
          g.lineCap = 'butt';
          g.lineJoin = 'miter';
        }
        run = [];
      };
      segments.forEach(([p0, p1, z]) => {
        if ((z <= 0) === front) { if (!run.length) run.push(p0); run.push(p1); } else flush();
      });
      flush();
    };
    // back halves (the outer ring solid, the inner dashed)
    strokeArc(ringOuter, false, GYRO_INK, 4);
    strokeArc(ringInner, false, GYRO_DIM, 3, [7, 7]);
    // a soft glow behind the logo, gently pulsing
    const glowRadius = GYRO_ICON * 1.1;
    const glow = g.createRadialGradient(GYRO_CX, GYRO_CY, GYRO_ICON * .35, GYRO_CX, GYRO_CY, glowRadius);
    glow.addColorStop(0, `rgba(245, 245, 245, ${(.3 + .12 * Math.sin(phase * GYRO_TAU * 2)).toFixed(3)})`);
    glow.addColorStop(1, 'rgba(245, 245, 245, 0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(GYRO_CX, GYRO_CY, glowRadius, 0, GYRO_TAU);
    g.fill();
    // the RTM icon at the centre (clipped to a disc so its square edge never shows)
    if (loaderIcon.complete && loaderIcon.naturalWidth) {
      g.save();
      g.beginPath();
      g.arc(GYRO_CX, GYRO_CY, GYRO_ICON / 2, 0, GYRO_TAU);
      g.clip();
      g.drawImage(loaderIcon, GYRO_CX - GYRO_ICON / 2, GYRO_CY - GYRO_ICON / 2, GYRO_ICON, GYRO_ICON);
      g.restore();
    } else {
      g.beginPath();
      g.arc(GYRO_CX, GYRO_CY, 8, 0, GYRO_TAU);
      g.fillStyle = GYRO_INK;
      g.fill();
    }
    // front halves
    strokeArc(ringOuter, true, GYRO_INK, 4);
    strokeArc(ringInner, true, GYRO_DIM, 3, [7, 7]);
  }

  function startGyro(canvas) {
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const run = (loaderRuns.get(canvas) || 0) + 1;
    loaderRuns.set(canvas, run);
    const started = performance.now();
    const frame = now => {
      if (loaderRuns.get(canvas) !== run || !canvas.isConnected) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      const scale = w && h ? Math.min(w / GYRO_W, h / GYRO_H) : 1;
      const t = motionReduced.matches ? GYRO_DUR * .25 : (now - started) / 1000;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, w, h);
      g.setTransform(scale, 0, 0, scale, (w - GYRO_W * scale) / 2, (h - GYRO_H * scale) / 2);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      drawGyro(g, t);
      if (!motionReduced.matches) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  function stopGyro(canvas) {
    if (canvas) loaderRuns.set(canvas, (loaderRuns.get(canvas) || 0) + 1);
  }

  function showLoader() {
    article.innerHTML = LOADER_HTML;
    startGyro(article.querySelector('.wiki-loader-canvas'));
  }

  function renderNote(entry) {
    const rawTitle = entry.markdown.replace(/^---\n[\s\S]*?\n---\n?/, '').match(/^#\s+(.+?)\s*$/m);
    const title = rawTitle ? rawTitle[1].replace(/[#*_`]/g, '').trim() : titleFromID(entry.id);
    article.innerHTML = `<div class="wiki-note-meta">${escapeHTML(entry.path)}</div>${renderMarkdown(entry.markdown, entry.path)}`;
    renderMermaidBlocks(article);
    document.title = `${title} | Real-Time Manim Wiki`;
    markCurrent();
    revealNote(entry.id);
    // The heading is new on every note: re-arm the back-to-top trigger.
    watchArticleTitle();
  }

  function entryByID(id) {
    return [...catalog.values()].find(entry => entry.id === id);
  }

  async function loadNote(id) {
    const entry = entryByID(id) || entryByID(noteID(entryPath));
    if (!entry) {
      article.innerHTML = `<p class="wiki-error">${ui.noNotes}</p>`;
      return;
    }
    currentID = entry.id;
    // Update the list at once: the fetch can take a moment, and the current
    // highlight should not wait for it.
    markCurrent();
    revealNote(entry.id);
    updateList();
    showLoader();
    // A newer navigation supersedes this one: a slow fetch must never overwrite
    // the note the reader has since moved to.
    const request = ++noteRequest;
    try {
      let markdown = markdownCache.get(entry.path);
      if (markdown === undefined) {
        markdown = await fetchText(new URL(entry.path, sourceRoot));
        markdownCache.set(entry.path, markdown);
      }
      if (request !== noteRequest) return;
      renderNote({ ...entry, markdown });
      updateList();
    } catch (error) {
      if (request !== noteRequest) return;
      console.error('wiki note:', error);
      article.innerHTML = `<p class="wiki-error">${ui.noteError}</p>`;
    }
  }

  function navigate(id, push = true) {
    const target = entryByID(id) ? id : noteID(entryPath);
    if (push) history.pushState({}, '', `wiki.html?note=${encodeURIComponent(target)}`);
    // A pick ends the detour through the note list (phones only; a no-op when
    // the list is already closed). Dropping focus closes the soft keyboard.
    if (shell.classList.contains('is-list-open')) {
      setListOpen(false);
      if (mobileLayout.matches) search.blur();
    }
    loadNote(target);
  }

  async function refreshSource(renderCurrent = true) {
    const next = await loadCatalog();
    const signature = [...next.keys()].join('\u0001');
    const changed = signature !== sourceSignature;
    catalog = next;
    sourceSignature = signature;
    if (changed) {
      for (const path of [...markdownCache.keys()]) {
        if (!catalog.has(path)) markdownCache.delete(path);
      }
      renderList();
      if (renderCurrent) await loadNote(currentID || new URLSearchParams(location.search).get('note') || noteID(entryPath));
    } else {
      updateList();
    }
    return changed;
  }

  // Moves to the next source in SOURCES, dropping everything read from the one
  // that failed so notes from two hosts are never mixed.
  function useNextSource() {
    if (sourceIndex >= SOURCES.length - 1) return false;
    sourceIndex += 1;
    sourceRootRaw = SOURCES[sourceIndex];
    sourceRoot = new URL(sourceRootRaw, document.baseURI);
    catalog = new Map();
    markdownCache.clear();
    sourceSignature = '';
    return true;
  }

  // Reads the note catalog, falling through the source list until one answers.
  async function loadSource() {
    for (;;) {
      try {
        await refreshSource(false);
        return;
      } catch (error) {
        if (!useNextSource()) throw error;
        console.warn('wiki: source unavailable, trying', sourceRootRaw, error);
      }
    }
  }

  async function init() {
    showLoader();
    try {
      await loadSource();
      if (sidebarToggle) {
        const setTocState = (collapsed) => {
          shell.classList.toggle('is-toc-collapsed', collapsed);
          sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
          sidebarToggle.setAttribute('aria-label', collapsed ? ui.showNotes : ui.hideNotes);
        };
        setTocState(localStorage.getItem('wiki-toc-collapsed') === '1');
        sidebarToggle.addEventListener('click', () => {
          const collapsed = shell.classList.toggle('is-toc-collapsed');
          sidebarToggle.setAttribute('aria-expanded', String(!collapsed));
          sidebarToggle.setAttribute('aria-label', collapsed ? ui.showNotes : ui.hideNotes);
          try { localStorage.setItem('wiki-toc-collapsed', collapsed ? '1' : '0'); } catch { /* private mode */ }
        });
      }
      search.addEventListener('input', updateList);
      search.addEventListener('keydown', handleSearchKey);
      if (listToggle) {
        listToggle.addEventListener('click', () => setListOpen(!shell.classList.contains('is-list-open')));
        // Reaching for the field means looking for something, so the list opens
        // with it; the note stays readable underneath. pointerdown covers a tap
        // on a field that already has focus (a second focus event never comes).
        search.addEventListener('pointerdown', () => { if (mobileLayout.matches) setListOpen(true); });
        search.addEventListener('focus', () => { if (mobileLayout.matches) setListOpen(true); });
        document.addEventListener('pointerdown', event => {
          if (!mobileLayout.matches || !shell.classList.contains('is-list-open')) return;
          if (event.target.closest('.wiki-sidebar')) return;
          setListOpen(false);
        }, true);
        mobileLayout.addEventListener('change', () => {
          if (!mobileLayout.matches) setListOpen(false);
        });
      }
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
      window.addEventListener('popstate', () => navigate(new URLSearchParams(location.search).get('note') || noteID(entryPath), false));
      await loadNote(new URLSearchParams(location.search).get('note') || noteID(entryPath));
      if (localHost) refreshTimer = window.setInterval(() => refreshSource(true).catch(error => console.error('wiki refresh:', error)), 5000);
    } catch (error) {
      console.error('wiki:', error);
      article.innerHTML = `<p class="wiki-error">${ui.sourceError}</p>`;
    }
  }

  // ---- Sidebar width --------------------------------------------------------
  // One custom property carries the drawer's width (--wiki-drawer-w in
  // wiki.css): the grid column, the drawer's contents, the push-out offset, the
  // fixed toggle and this grip all read it, so a drag stays in step everywhere.
  const sidebarGrip = document.getElementById('wiki-sidebar-grip');
  const SIDEBAR_MIN = 200;
  const SIDEBAR_MAX = 480;
  const SIDEBAR_DEFAULT = 280;

  // Leave the note a usable column even in a narrow window.
  function sidebarLimit() {
    return Math.max(SIDEBAR_MIN + 40, Math.min(SIDEBAR_MAX, window.innerWidth - 380));
  }

  function setSidebarWidth(width, persist = true) {
    const next = Math.round(Math.max(SIDEBAR_MIN, Math.min(sidebarLimit(), width)));
    document.documentElement.style.setProperty('--wiki-drawer-w', `${next}px`);
    if (persist) {
      try { localStorage.setItem('wiki-sidebar-w', String(next)); } catch { /* private mode */ }
    }
    return next;
  }

  function currentSidebarWidth() {
    const inline = parseFloat(document.documentElement.style.getPropertyValue('--wiki-drawer-w'));
    if (Number.isFinite(inline)) return inline;
    const computed = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--wiki-drawer-w'));
    return Number.isFinite(computed) ? computed : SIDEBAR_DEFAULT;
  }

  if (sidebarGrip) {
    let drag = null;
    sidebarGrip.addEventListener('pointerdown', event => {
      if (shell.classList.contains('is-toc-collapsed')) return;
      event.preventDefault();
      drag = { startX: event.clientX, startWidth: currentSidebarWidth() };
      shell.classList.add('is-resizing-sidebar');
      try { sidebarGrip.setPointerCapture(event.pointerId); } catch { /* unsupported */ }
    });
    sidebarGrip.addEventListener('pointermove', event => {
      if (!drag) return;
      setSidebarWidth(drag.startWidth + (event.clientX - drag.startX), false);
    });
    const finishDrag = event => {
      if (!drag) return;
      drag = null;
      shell.classList.remove('is-resizing-sidebar');
      try { sidebarGrip.releasePointerCapture(event.pointerId); } catch { /* already gone */ }
      setSidebarWidth(currentSidebarWidth());
    };
    sidebarGrip.addEventListener('pointerup', finishDrag);
    sidebarGrip.addEventListener('pointercancel', finishDrag);
    sidebarGrip.addEventListener('dblclick', () => setSidebarWidth(SIDEBAR_DEFAULT));
    sidebarGrip.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const step = (event.shiftKey ? 48 : 16) * (event.key === 'ArrowRight' ? 1 : -1);
      setSidebarWidth(currentSidebarWidth() + step);
    });
    // Restore the width the reader last settled on.
    try {
      const saved = parseFloat(localStorage.getItem('wiki-sidebar-w'));
      if (Number.isFinite(saved)) setSidebarWidth(saved, false);
    } catch { /* private mode */ }
  }

  // ---- Back to top ----------------------------------------------------------
  // The button waits off the right edge until the note's own title has scrolled
  // out of view — the moment the reader has lost the page's heading — then it
  // slides in to the bottom-right corner (see .wiki-top in wiki.css).
  const topButton = document.getElementById('wiki-top');
  let titleObserver = null;
  let topFallbackBound = false;

  function watchArticleTitle() {
    if (!topButton) return;
    if (titleObserver) { titleObserver.disconnect(); titleObserver = null; }
    const setVisible = visible => topButton.classList.toggle('is-visible', visible);
    const title = article.querySelector('h1');
    if (!title || typeof IntersectionObserver === 'undefined') {
      if (!topFallbackBound) {
        topFallbackBound = true;
        window.addEventListener('scroll', () => setVisible(window.scrollY > 240), { passive: true });
      }
      setVisible(window.scrollY > 240);
      return;
    }
    const header = document.querySelector('.wiki-taskbar');
    // Shrink the observation box by the sticky taskbar's height, so the button
    // arrives when the title slides under the header rather than after it has
    // left the viewport entirely.
    const margin = header ? Math.round(header.getBoundingClientRect().height) : 0;
    titleObserver = new IntersectionObserver(entries => {
      const entry = entries[entries.length - 1];
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    }, { rootMargin: `-${margin}px 0px 0px 0px`, threshold: 0 });
    titleObserver.observe(title);
  }

  if (topButton) {
    topButton.addEventListener('click', () => {
      // The observer hides the button again once the title is back in view.
      window.scrollTo({ top: 0, behavior: motionReduced.matches ? 'auto' : 'smooth' });
    });
  }

  // ---- Architecture mind map panel ------------------------------------------
  // The graph lives on its own page (mindmap.html) so its styles and scripts
  // stay isolated; the iframe is created on first open, so the wiki itself
  // stays fast. Reading and settling the graph takes a moment, so the panel
  // covers it with the same gyro the note reader uses until the iframe posts
  // that it has drawn (see the ready script in mindmap.html).
  const mindmap = document.getElementById('wiki-mindmap');
  const mindmapFrame = document.getElementById('wiki-mindmap-frame');
  const mindmapLoader = document.getElementById('wiki-mindmap-loader');
  const mindmapOpen = document.getElementById('wiki-mindmap-open');
  // How long the opaque overlay stays over the graph after it reports ready,
  // and how long it then takes to fade. The graph can still shift once more
  // right after that report (the last simulation ticks, a refit as the panel
  // settles), so the reader is only ever shown the finished layout.
  const MINDMAP_HOLD = 1000;
  const MINDMAP_FADE = 320;
  let mindmapReady = false;
  let mindmapLoaderOn = false;
  let mindmapLoaderHold = 0;
  let mindmapLoaderFade = 0;

  function startMindmapLoader() {
    if (!mindmapLoader) return;
    window.clearTimeout(mindmapLoaderHold);
    window.clearTimeout(mindmapLoaderFade);
    mindmapLoaderHold = 0;
    mindmapLoaderFade = 0;
    mindmapLoaderOn = true;
    mindmapLoader.hidden = false;
    mindmapLoader.classList.remove('is-done');
    startGyro(mindmapLoader.querySelector('.wiki-loader-canvas'));
  }

  function stopMindmapLoader() {
    if (!mindmapLoader || !mindmapLoaderOn) return;
    mindmapLoaderOn = false;
    mindmapLoaderHold = window.setTimeout(() => {
      mindmapLoaderHold = 0;
      // Reveal and fade at once: the overlay goes out while the graph comes in.
      mindmapFrame.classList.add('is-ready');
      mindmapLoader.classList.add('is-done');
      mindmapLoaderFade = window.setTimeout(() => {
        mindmapLoaderFade = 0;
        mindmapLoader.hidden = true;
        // Only now stop the gyro, so the animation is still running through
        // the fade instead of freezing behind it.
        stopGyro(mindmapLoader.querySelector('.wiki-loader-canvas'));
      }, MINDMAP_FADE);
    }, MINDMAP_HOLD);
  }

  function hideMindmapLoader() {
    if (!mindmapLoader) return;
    window.clearTimeout(mindmapLoaderHold);
    window.clearTimeout(mindmapLoaderFade);
    mindmapLoaderHold = 0;
    mindmapLoaderFade = 0;
    mindmapLoaderOn = false;
    stopGyro(mindmapLoader.querySelector('.wiki-loader-canvas'));
    mindmapLoader.classList.remove('is-done');
    mindmapLoader.hidden = true;
  }

  // Locking the page while the panel is open takes a classic scrollbar away,
  // which widens the layout by its width — every column reflows 15px to the
  // right the instant the panel opens, and back again when it closes. Pay the
  // gap back as body padding so the layout width never changes; the overlay is
  // fixed, so it cannot inherit that padding and gets the gap as a variable
  // instead, which keeps the centred panel exactly where it was.
  function lockPage(locked) {
    const gap = locked ? Math.max(0, window.innerWidth - document.documentElement.clientWidth) : 0;
    document.body.classList.toggle('wiki-mindmap-open', locked);
    document.body.style.paddingRight = gap ? `${gap}px` : '';
    document.documentElement.style.setProperty('--wiki-scrollbar-gap', `${gap}px`);
  }

  function resetMindmapFocus() {
    const frame = mindmapFrame ? mindmapFrame.querySelector('iframe') : null;
    if (frame && frame.contentWindow) {
      frame.contentWindow.postMessage({ type: 'wiki-mindmap-focus-reset' }, '*');
    }
  }

  function closeMindmap() {
    if (!mindmap || mindmap.hidden) return;
    mindmap.hidden = true;
    lockPage(false);
    // A graph that is still loading when the panel closes should not keep a
    // hidden animation (or a pending reveal) running.
    hideMindmapLoader();
    // The iframe stays alive between openings; drop its wheel focus so opening
    // the panel again starts with the page in charge of the wheel.
    resetMindmapFocus();
  }

  function openMindmap() {
    if (!mindmap || !mindmapFrame) return;
    mindmap.hidden = false;
    lockPage(true);
    if (!mindmapFrame.querySelector('iframe')) {
      const frame = document.createElement('iframe');
      frame.src = 'mindmap.html';
      frame.title = 'Architecture graph';
      // The frame stays transparent until the overlay steps aside, so the graph
      // fades in with the reveal instead of popping in behind the loader (or,
      // before the loader existed, as soon as the empty document loaded).
      mindmapFrame.appendChild(frame);
    }
    if (mindmapReady) {
      mindmapFrame.classList.add('is-ready');
      stopMindmapLoader();
    } else {
      startMindmapLoader();
    }
  }

  if (mindmapOpen) mindmapOpen.addEventListener('click', openMindmap);
  if (mindmap) {
    const mindmapClose = mindmap.querySelector('.wiki-mindmap-close');
    if (mindmapClose) mindmapClose.addEventListener('click', closeMindmap);
    mindmap.addEventListener('click', event => { if (event.target === mindmap) closeMindmap(); });
    window.addEventListener('keydown', event => { if (event.key === 'Escape') closeMindmap(); });
    // The parent page is outside the graph too: a press or wheel on the panel
    // chrome (or anywhere behind it) should drop the iframe's wheel focus.
    document.addEventListener('pointerdown', event => {
      if (!mindmap || mindmap.hidden) return;
      if (event.target instanceof Element && event.target.closest('iframe')) return;
      resetMindmapFocus();
    }, true);
    document.addEventListener('wheel', event => {
      if (!mindmap || mindmap.hidden) return;
      if (event.target instanceof Element && event.target.closest('iframe')) return;
      resetMindmapFocus();
    }, { capture: true, passive: true });
    // The graph's iframe owns focus after any interaction: it forwards Escape
    // to close the panel, and reports when it has finished drawing.
    window.addEventListener('message', event => {
      if (!event.data) return;
      if (event.data.type === 'wiki-mindmap-close') closeMindmap();
      if (event.data.type === 'wiki-mindmap-ready') {
        mindmapReady = true;
        stopMindmapLoader();
      }
    });
  }

  // ---- Language switch ------------------------------------------------------
  // The globe in the header raises a small panel listing the languages the wiki
  // ships in. Each language has its own note tree, so picking another one opens
  // that wiki at its home note (note ids cannot be carried across).
  const langToggle = document.getElementById('wiki-lang-toggle');
  const langMenu = document.getElementById('wiki-lang-menu');

  function closeLangMenu(focusToggle = false) {
    if (!langMenu || langMenu.hidden) return;
    langMenu.hidden = true;
    if (langToggle) {
      langToggle.setAttribute('aria-expanded', 'false');
      if (focusToggle) langToggle.focus();
    }
  }

  function openLangMenu() {
    if (!langMenu || !langMenu.hidden) return;
    langMenu.hidden = false;
    if (langToggle) langToggle.setAttribute('aria-expanded', 'true');
    const option = langMenu.querySelector('.wiki-lang-option');
    if (option) option.focus();
  }

  if (langToggle && langMenu) {
    langToggle.addEventListener('click', () => {
      if (langMenu.hidden) openLangMenu();
      else closeLangMenu();
    });
    langMenu.addEventListener('click', event => {
      const option = event.target.closest('.wiki-lang-option');
      if (!option) return;
      // The current language has no target: picking it just closes the panel.
      if (option.dataset.href) {
        location.href = option.dataset.href;
        return;
      }
      closeLangMenu(true);
    });
    // A click anywhere else, or Escape, dismisses the panel.
    document.addEventListener('click', event => {
      if (langMenu.hidden || event.target.closest('.wiki-lang-switch')) return;
      closeLangMenu();
    });
    window.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeLangMenu(true);
    });
  }

  init();
})();
