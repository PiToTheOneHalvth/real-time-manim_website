(() => {
  const root = document.querySelector('.architecture-graph');
  if (!root || !window.d3) return;

  const d3 = window.d3;
  const sourceRoot = new URL(root.dataset.sourceRoot || '../../test_wiki_file/', document.baseURI);
  const entryPath = root.dataset.entryPath || 'index.md';
  const viewport = root.querySelector('.architecture-graph-viewport');
  const svg = d3.select(root.querySelector('.architecture-graph-viewport > svg'));
  const world = svg.append('g');
  const edgeLayer = world.append('g').attr('class', 'architecture-graph-edges');
  const nodeLayer = world.append('g').attr('class', 'architecture-graph-nodes');
  const search = root.querySelector('.architecture-graph-search');
  const status = root.querySelector('.architecture-graph-status');
  const tooltip = root.querySelector('.architecture-graph-tooltip');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let zoom;
  let simulation;
  let graph;
  let lastSignature = '';
  let reloadTimer;
  let suppressClick = false;

  const escapeHTML = value => String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));

  const noteID = path => decodeURIComponent(path).replace(/\\/g, '/').replace(/\.md$/i, '');
  const noteTitle = (markdown, id) => {
    const match = markdown.replace(/```[\s\S]*?```/g, '').match(/^#\s+(.+?)\s*$/m);
    return match ? match[1].replace(/[#*_`]/g, '').trim() : id.split('/').pop().replace(/[-_]/g, ' ');
  };
  const cleanTarget = raw => {
    let target = raw.trim();
    if (target.startsWith('<')) target = target.slice(1, target.indexOf('>'));
    else target = target.split(/\s+/)[0];
    return target.split('#', 1)[0].split('?', 1)[0];
  };
  const markdownLinks = markdown => {
    const links = [];
    const source = markdown.replace(/```[\s\S]*?```/g, '');
    const pattern = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = pattern.exec(source))) {
      if (match[1] !== '!') links.push({ target: cleanTarget(match[3]), vaultRelative: false });
    }
    const wikilinkPattern = /\[\[([^\]]+)\]\]/g;
    while ((match = wikilinkPattern.exec(source))) {
      const target = match[1].split('|', 1)[0].split('#', 1)[0].trim();
      if (target) links.push({ target: target.endsWith('.md') ? target : `${target}.md`, vaultRelative: true });
    }
    return links;
  };

  async function text(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url.pathname}`);
    return response.text();
  }

  function resolve(sourcePath, link, files = null) {
    const target = link.target;
    if (!target || !target.toLowerCase().endsWith('.md') || /^[a-z][a-z\d+.-]*:/i.test(target)) return null;
    if (link.vaultRelative && files) {
      const normalized = decodeURIComponent(target).replace(/^\/+/, '').replace(/\.md$/i, '');
      const exact = `${normalized}.md`;
      if (files.has(exact)) return exact;
      const matches = [...files].filter(path => noteID(path).split('/').pop() === normalized);
      return matches.length === 1 ? matches[0] : null;
    }
    try {
      const base = link.vaultRelative ? sourceRoot : new URL(sourcePath, sourceRoot);
      const absolute = new URL(target, base);
      const prefix = sourceRoot.pathname.endsWith('/') ? sourceRoot.pathname : `${sourceRoot.pathname}/`;
      if (!absolute.pathname.startsWith(prefix)) return null;
      const path = decodeURIComponent(absolute.pathname.slice(prefix.length));
      return files ? (files.has(path) ? path : null) : path;
    } catch {
      return null;
    }
  }

  async function readGraphSource() {
    const documentsByPath = new Map();
    const queue = [entryPath];
    while (queue.length) {
      const path = queue.shift();
      if (documentsByPath.has(path)) continue;
      let markdown;
      try {
        markdown = await text(new URL(path, sourceRoot));
      } catch (error) {
        if (path === entryPath) throw error;
        console.warn(`architecture graph: skipped missing note ${path}`);
        continue;
      }
      documentsByPath.set(path, { path, markdown });
      for (const link of markdownLinks(markdown)) {
        const targetPath = resolve(path, link);
        if (targetPath && !documentsByPath.has(targetPath)) queue.push(targetPath);
      }
    }
    const documents = [...documentsByPath.values()];
    const files = new Set(documents.map(document => document.path));
    const edgeCounts = new Map();
    const neighbors = new Map(documents.map(document => [noteID(document.path), new Set()]));
    const signatureParts = [];

    for (const document of documents) {
      const source = noteID(document.path);
      signatureParts.push(`${document.path}:${document.markdown}`);
      for (const link of markdownLinks(document.markdown)) {
        const targetPath = resolve(document.path, link, files);
        if (!targetPath) continue;
        const target = noteID(targetPath);
        if (source === target) continue;
        const [first, second] = [source, target].sort();
        const key = `${first}\u0000${second}`;
        edgeCounts.set(key, {
          source: first,
          target: second,
          weight: (edgeCounts.get(key)?.weight || 0) + 1,
        });
        neighbors.get(source).add(target);
        neighbors.get(target).add(source);
      }
    }

    const nodes = documents.map((document, index) => {
      const id = noteID(document.path);
      const angle = index * Math.PI * (3 - Math.sqrt(5));
      const radius = 60 + Math.sqrt(index + 1) * 14;
      return {
        id,
        title: noteTitle(document.markdown, id),
        path: document.path,
        href: `wiki.html?note=${encodeURIComponent(id)}`,
        degree: neighbors.get(id).size,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      };
    });

    return {
      nodes,
      edges: [...edgeCounts.values()],
      neighbors,
      signature: signatureParts.join('\u0001'),
    };
  }

  function dimensions() {
    const rect = viewport.getBoundingClientRect();
    return { width: Math.max(280, rect.width), height: Math.max(360, rect.height) };
  }

  function radius(node) {
    return 3.4 + Math.min(8.4, Math.sqrt(node.degree + 1) * 1.25);
  }

  function setStatus(message, error = false) {
    status.textContent = message;
    status.dataset.state = error ? 'error' : '';
  }

  function highlight(active = null) {
    const query = search.value.trim().toLowerCase();
    const connected = new Set(active ? [active.id, ...(graph.neighbors.get(active.id) || [])] : []);
    const matches = node => !query || node.id.toLowerCase().includes(query) || node.title.toLowerCase().includes(query);
    nodeLayer.selectAll('.architecture-graph-node')
      .classed('is-dimmed', node => Boolean(query) && !matches(node))
      .classed('is-match', node => matches(node))
      .classed('is-connected', node => Boolean(active) && connected.has(node.id))
      .classed('is-active', node => active?.id === node.id);
    edgeLayer.selectAll('.architecture-graph-edge')
      .classed('is-connected', edge => Boolean(active) && connected.has(edge.source.id) && connected.has(edge.target.id))
      .classed('is-dimmed', edge => Boolean(active) && !(connected.has(edge.source.id) && connected.has(edge.target.id)));
  }

  function tooltipAt(event, node) {
    tooltip.innerHTML = `<strong>${escapeHTML(node.title)}</strong><span>${node.degree} connections</span>`;
    tooltip.hidden = false;
    const bounds = root.getBoundingClientRect();
    tooltip.style.left = `${Math.max(10, Math.min(event.clientX - bounds.left + 14, bounds.width - tooltip.offsetWidth - 12))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(event.clientY - bounds.top + 14, bounds.height - tooltip.offsetHeight - 12))}px`;
  }

  function hideTooltip() {
    tooltip.hidden = true;
  }

  function fit(animate = true) {
    if (!graph || !world.node() || !zoom) return;
    const { width, height } = dimensions();
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    const bounds = world.node().getBBox();
    if (!bounds.width || !bounds.height) return;
    const scale = Math.max(.34, .86 * Math.min(width / bounds.width, height / bounds.height));
    const transform = d3.zoomIdentity
      .translate(width / 2 - scale * (bounds.x + bounds.width / 2), height / 2 - scale * (bounds.y + bounds.height / 2))
      .scale(scale);
    const selection = animate && !reducedMotion.matches
      ? svg.transition().duration(320).ease(d3.easeCubicOut)
      : svg;
    selection.call(zoom.transform, transform);
  }

  function render(nextGraph) {
    graph = nextGraph;
    if (simulation) simulation.stop();
    edgeLayer.selectAll('*').remove();
    nodeLayer.selectAll('*').remove();
    const { width, height } = dimensions();
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    zoom = d3.zoom().scaleExtent([.25, 5]).on('zoom', event => world.attr('transform', event.transform));
    svg.call(zoom).on('dblclick.zoom', null);

    const links = edgeLayer.selectAll('line').data(graph.edges).join('line')
      .attr('class', 'architecture-graph-edge')
      .attr('stroke-width', edge => Math.min(2.4, .62 + edge.weight * .18));
    const nodes = nodeLayer.selectAll('g').data(graph.nodes).join('g')
      .attr('class', 'architecture-graph-node')
      .attr('tabindex', 0)
      .attr('role', 'link')
      .attr('aria-label', node => `${node.title}, ${node.degree} connections`)
      .on('pointerenter', (event, node) => { highlight(node); tooltipAt(event, node); })
      .on('pointermove', tooltipAt)
      .on('pointerleave', () => { highlight(); hideTooltip(); })
      .on('focus', (event, node) => { highlight(node); tooltipAt(event, node); })
      .on('blur', () => { highlight(); hideTooltip(); })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.location.href = node.href;
        }
      })
      .on('click', (event, node) => {
        if (suppressClick) { suppressClick = false; return; }
        window.location.href = node.href;
      });
    nodes.append('circle').attr('class', 'architecture-graph-dot').attr('r', radius);
    nodes.append('text').attr('class', 'architecture-graph-label').attr('x', node => radius(node) + 4).attr('dy', '.35em').text(node => node.title);

    simulation = d3.forceSimulation(graph.nodes)
      .force('link', d3.forceLink(graph.edges).id(node => node.id).distance(edge => 40 + Math.min(24, edge.weight * 5)).strength(.28))
      .force('charge', d3.forceManyBody().strength(-58))
      .force('center', d3.forceCenter(width / 2, height / 2).strength(.22))
      .force('collision', d3.forceCollide().radius(node => radius(node) + 4).strength(.75));
    const tick = () => {
      links.attr('x1', edge => edge.source.x).attr('y1', edge => edge.source.y).attr('x2', edge => edge.target.x).attr('y2', edge => edge.target.y);
      nodes.attr('transform', node => `translate(${node.x}, ${node.y})`);
    };
    simulation.on('tick', tick);

    nodes.call(d3.drag()
      .on('start', (event, node) => {
        node.__startX = event.x;
        node.__startY = event.y;
        node.__moved = false;
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(.12).restart();
      })
      .on('drag', (event, node) => {
        if (Math.hypot(event.x - node.__startX, event.y - node.__startY) > 4) {
          node.__moved = true;
          suppressClick = true;
        }
        node.fx = event.x;
        node.fy = event.y;
      })
      .on('end', (event, node) => {
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(0);
      }));

    if (reducedMotion.matches) {
      simulation.tick(240);
      simulation.stop();
      tick();
      fit(false);
    } else {
      window.setTimeout(() => { simulation?.stop(); fit(false); }, 1000);
    }
    highlight();
  }

  async function load(force = false) {
    setStatus('Reading wiki graph...');
    try {
      const next = await readGraphSource();
      if (!force && next.signature === lastSignature) {
        setStatus(`${next.nodes.length} notes | ${next.edges.length} connections`);
        return;
      }
      lastSignature = next.signature;
      render(next);
      setStatus(`${next.nodes.length} notes | ${next.edges.length} connections`);
    } catch (error) {
      console.error('architecture graph:', error);
      setStatus('Graph unavailable. Serve the site over HTTP to load the Markdown source.', true);
    }
  }

  search.addEventListener('input', () => highlight());
  root.querySelector('.architecture-graph-refresh').addEventListener('click', () => load(true));
  root.querySelector('.architecture-graph-recenter').addEventListener('click', () => fit(true));
  root.querySelector('.architecture-graph-fullscreen').addEventListener('click', () => {
    root.classList.toggle('is-fullscreen');
    if (root.classList.contains('is-fullscreen')) {
      document.body.classList.add('architecture-graph-open');
    } else {
      document.body.classList.remove('architecture-graph-open');
    }
    requestAnimationFrame(() => fit(false));
  });
  window.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.classList.contains('is-fullscreen')) {
      root.classList.remove('is-fullscreen');
      document.body.classList.remove('architecture-graph-open');
      requestAnimationFrame(() => fit(false));
    }
  });
  window.addEventListener('resize', () => {
    clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => fit(false), 120);
  });

  load();
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.setInterval(() => load(), 5000);
})();
