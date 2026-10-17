(() => {
  const root = document.querySelector('.architecture-graph');
  if (!root || !window.d3) return;

  const d3 = window.d3;
  const sourceRoot = new URL(root.dataset.sourceRoot || '../../test_wiki_file/', document.baseURI);
  const entryPath = root.dataset.entryPath || 'index.md';
  const manifestPath = root.dataset.manifestPath || 'manifest.json';
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
  let draggedNode = null;
  const LABEL_ZOOM_THRESHOLD = 1.2;
  const LINK_DISTANCE_MIN = 230;
  const LINK_DISTANCE_MAX = 270;
  const LINE_TENSION_MULTIPLIER = 4;
  const MAX_LINK_TENSION_STRENGTH = 0.7;
  const DRAG_LINK_TENSION_BOOST = 4;
  const DRAG_MAX_LINK_STRENGTH = 0.95;
  const DRAG_ALPHA_TARGET = 0.35;
  const OBSIDIAN_REPEL_STRENGTH = -1000;
  const OBSIDIAN_REPEL_MIN_DISTANCE = 30;
  const OBSIDIAN_CENTER_STRENGTH = 0.1;
  const OBSIDIAN_COLLISION_RADIUS = 60;
  const OBSIDIAN_COLLISION_STRENGTH = 0.5;
  const SETTLE_TICKS = 420;

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
    const manifest = JSON.parse(await text(new URL(manifestPath, sourceRoot)));
    if (!Array.isArray(manifest.files)) throw new Error('Wiki manifest must contain a files array.');
    const manifestPaths = manifest.files.filter(path => typeof path === 'string' && path.toLowerCase().endsWith('.md'));
    const documentsByPath = new Map();
    const queue = [entryPath, ...manifestPaths];
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
    const outgoing = new Map(documents.map(document => [noteID(document.path), new Set()]));
    const incoming = new Map(documents.map(document => [noteID(document.path), new Set()]));
    const neighbors = new Map(documents.map(document => [noteID(document.path), new Set()]));
    const related = new Map(documents.map(document => [noteID(document.path), new Set()]));
    const edgeMap = new Map();
    const signatures = [];

    for (const document of documents) {
      const source = noteID(document.path);
      signatures.push(`${document.path}:${document.markdown}`);
      for (const link of markdownLinks(document.markdown)) {
        const targetPath = resolve(document.path, link, files);
        if (!targetPath) continue;
        const target = noteID(targetPath);
        if (source === target || outgoing.get(source).has(target)) continue;
        outgoing.get(source).add(target);
        incoming.get(target).add(source);
        neighbors.get(source).add(target);
        neighbors.get(target).add(source);
        related.get(source).add(target);
        related.get(target).add(source);
        const [first, second] = [source, target].sort();
        const key = `${first}:${second}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { source: first, target: second, weight: 0 });
        edgeMap.get(key).weight += 1;
      }
    }

    const positions = seedPositions(documents, related);
    const nodes = documents.map(document => {
      const id = noteID(document.path);
      const weight = incoming.get(id).size + outgoing.get(id).size;
      return {
        id,
        title: noteTitle(document.markdown, id),
        path: document.path,
        href: `wiki.html?note=${encodeURIComponent(id)}`,
        degree: neighbors.get(id).size,
        weight,
        ...positions.get(id),
      };
    });

    return {
      nodes,
      edges: [...edgeMap.values()],
      neighbors,
      signature: signatures.join('\u0001'),
    };
  }

  function dimensions() {
    const rect = viewport.getBoundingClientRect();
    return { width: Math.max(280, rect.width), height: Math.max(360, rect.height) };
  }

  function radius(node) {
    return Math.max(8, Math.min(3 * Math.sqrt(node.weight + 1), 30));
  }

  function seededRandom(seedText) {
    let seed = 2166136261;
    for (let index = 0; index < seedText.length; index += 1) {
      seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619);
    }
    return () => {
      seed += 0x6d2b79f5;
      let value = seed;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seedPositions(documents, related) {
    const positions = new Map((graph?.nodes || [])
      .filter(node => Number.isFinite(node.x) && Number.isFinite(node.y))
      .map(node => [node.id, { x: node.x, y: node.y }]));
    const newDocuments = documents.filter(document => !positions.has(noteID(document.path)));
    const existingRadius = Math.max(0, ...[...positions.values()].map(point => Math.hypot(point.x, point.y)));
    const spread = Math.sqrt(60 * newDocuments.length * 60 / Math.PI + existingRadius ** 2) - existingRadius;
    const jitterRadius = 60 * Math.sqrt(newDocuments.length);

    for (const document of newDocuments) {
      const id = noteID(document.path);
      const random = seededRandom(id);
      const linkedPositions = [...(related.get(id) || [])]
        .map(linkedID => positions.get(linkedID))
        .filter(Boolean);
      let x;
      let y;
      if (linkedPositions.length) {
        x = linkedPositions.reduce((sum, point) => sum + point.x, 0) / linkedPositions.length + (random() - .5) * jitterRadius;
        y = linkedPositions.reduce((sum, point) => sum + point.y, 0) / linkedPositions.length + (random() - .5) * jitterRadius;
      } else {
        const angle = random() * 2 * Math.PI;
        const distance = existingRadius + Math.sqrt(random()) * spread;
        x = distance * Math.cos(angle);
        y = distance * Math.sin(angle);
      }
      positions.set(id, { x, y });
    }
    return positions;
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
      .classed('is-neighbor', node => Boolean(active) && node.id !== active.id && connected.has(node.id))
      .classed('is-active', node => active?.id === node.id);
    edgeLayer.selectAll('.architecture-graph-edge')
      .classed('is-connected', edge => Boolean(active) && connected.has(edge.source.id) && connected.has(edge.target.id))
      .classed('is-dimmed', edge => Boolean(active) && !(connected.has(edge.source.id) && connected.has(edge.target.id)));
  }

  function tooltipAt(event, node) {
    tooltip.innerHTML = `<strong>${escapeHTML(node.title)}</strong><span>${node.weight} connections</span>`;
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
    zoom = d3.zoom().scaleExtent([.25, 5]).on('zoom', event => {
      world.attr('transform', event.transform);
      root.classList.toggle('labels-hidden', event.transform.k < LABEL_ZOOM_THRESHOLD);
    });
    svg.call(zoom).on('dblclick.zoom', null);

    const nodeByID = new Map(graph.nodes.map(node => [node.id, node]));
    const visibleEdges = graph.edges
      .map(edge => {
        const source = nodeByID.get(edge.source);
        const target = nodeByID.get(edge.target);
        const random = seededRandom(`${edge.source}|${edge.target}`);
        return {
          ...edge,
          source,
          target,
          restDistance: LINK_DISTANCE_MIN + random() * (LINK_DISTANCE_MAX - LINK_DISTANCE_MIN),
        };
      })
      .filter(edge => edge.source && edge.target);
    const links = edgeLayer.selectAll('line').data(visibleEdges).join('line')
      .attr('class', 'architecture-graph-edge')
      .attr('stroke-width', 1);
    const nodes = nodeLayer.selectAll('g').data(graph.nodes).join('g')
      .attr('class', 'architecture-graph-node')
      .attr('tabindex', 0)
      .attr('role', 'link')
      .attr('aria-label', node => `${node.title}, ${node.weight} connections`)
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

    const linkStrength = edge => {
      const baseStrength = LINE_TENSION_MULTIPLIER * edge.weight / Math.min(edge.source.weight, edge.target.weight);
      const isDraggedLink = draggedNode && (edge.source.id === draggedNode.id || edge.target.id === draggedNode.id);
      return isDraggedLink
        ? Math.min(DRAG_MAX_LINK_STRENGTH, baseStrength * DRAG_LINK_TENSION_BOOST)
        : Math.min(MAX_LINK_TENSION_STRENGTH, baseStrength);
    };
    const forceTension = d3.forceLink(visibleEdges)
      .id(node => node.id)
      .distance(edge => edge.restDistance)
      .strength(linkStrength);
    simulation = d3.forceSimulation(graph.nodes)
      .force('line-tension', forceTension)
      .force('charge', d3.forceManyBody()
        .strength(OBSIDIAN_REPEL_STRENGTH)
        .distanceMin(OBSIDIAN_REPEL_MIN_DISTANCE))
      .force('x', d3.forceX(0).strength(OBSIDIAN_CENTER_STRENGTH))
      .force('y', d3.forceY(0).strength(OBSIDIAN_CENTER_STRENGTH))
      .force('collision', d3.forceCollide(OBSIDIAN_COLLISION_RADIUS).strength(OBSIDIAN_COLLISION_STRENGTH))
      .stop();
    const tick = () => {
      links.attr('x1', edge => edge.source.x).attr('y1', edge => edge.source.y).attr('x2', edge => edge.target.x).attr('y2', edge => edge.target.y);
      nodes.attr('transform', node => `translate(${node.x}, ${node.y})`);
    };
    simulation.on('tick', tick);

    nodes.call(d3.drag()
      .on('start', (event, node) => {
        draggedNode = node;
        forceTension.strength(linkStrength);
        node.__startX = event.x;
        node.__startY = event.y;
        node.__moved = false;
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(DRAG_ALPHA_TARGET).restart();
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
        draggedNode = null;
        forceTension.strength(linkStrength);
        simulation.alphaTarget(0);
      }));

    if (reducedMotion.matches) {
      simulation.tick(SETTLE_TICKS);
      tick();
      fit(false);
    } else {
      simulation.alpha(.28);
      for (let index = 0; index < SETTLE_TICKS; index += 1) simulation.tick();
      tick();
      simulation.alpha(0).restart();
      window.setTimeout(() => simulation?.stop(), 250);
      fit(false);
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
