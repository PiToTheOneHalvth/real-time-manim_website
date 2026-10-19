(() => {
  const root = document.querySelector('.architecture-graph');
  if (!root || !window.d3) return;

  const d3 = window.d3;
  const sourceRoot = new URL(root.dataset.sourceRoot || '../../wiki/en_us/', document.baseURI);
  const entryPath = root.dataset.entryPath || 'index.md';
  const manifestPath = root.dataset.manifestPath || 'manifest.json';
  const viewport = root.querySelector('.architecture-graph-viewport');
  const svg = d3.select(root.querySelector('.architecture-graph-viewport > svg'));
  const world = svg.append('g');
  const edgeLayer = world.append('g').attr('class', 'architecture-graph-edges');
  const nodeLayer = world.append('g').attr('class', 'architecture-graph-nodes');
  const search = root.querySelector('.architecture-graph-search');
  const searchList = root.querySelector('.architecture-graph-search-list');
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
  let activeNode = null;
  let connectedNodes = new Set();
  let localGraphOpen = false;
  let localGraphNode = null;
  let localSim = null;
  let localResize = null;
  let localGraphSize = 0;
  let localGraphX = 0;
  let localGraphY = 0;
  let localFitK = 1;
  let shiftingView = false;
  let collapseTimer = null;
  let openingTimer = null;
  let swapTimer = null;
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
  const LOCAL_GRAPH_MIN_SIZE = 240;
  const LOCAL_GRAPH_MAX_SIZE = 900;
  const LOCAL_GRAPH_DEFAULT_MAX = 400;
  const LOCAL_GRAPH_GAP = 14;
  const LOCAL_GRAPH_WORLD = 1000;
  const LOCAL_GRAPH_SETTLE_TICKS = 300;

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

  // Brightness ranking (front = brightest): hovered node #fff > neighbor node >
  // incident edge > neighbor-neighbor edge > resting node > resting edge >
  // unlinked node > half-unlinked edge > unlinked edge > background. Edges
  // keep their own stroke overlap at crossings; no synthetic point is added.
  function highlight(active = null) {
    activeNode = active;
    connectedNodes = new Set(active ? [active.id, ...(graph.neighbors.get(active.id) || [])] : []);
    const query = search.value.trim().toLowerCase();
    const matches = node => !query || node.id.toLowerCase().includes(query) || node.title.toLowerCase().includes(query);
    nodeLayer.selectAll('.architecture-graph-node')
      .classed('is-dimmed', node => Boolean(query) && !matches(node))
      .classed('is-match', node => matches(node))
      .classed('is-active', node => active?.id === node.id)
      .classed('is-neighbor', node => Boolean(active) && node.id !== active.id && connectedNodes.has(node.id))
      .classed('is-unlinked', node => Boolean(active) && !connectedNodes.has(node.id));
    edgeLayer.selectAll('.architecture-graph-edge')
      .classed('is-incident', edge => Boolean(active) && (edge.source.id === active.id || edge.target.id === active.id))
      .classed('is-neighbor-edge', edge => Boolean(active) && edge.source.id !== active.id && edge.target.id !== active.id
        && connectedNodes.has(edge.source.id) && connectedNodes.has(edge.target.id))
      .classed('is-half-unlinked', edge => Boolean(active) && connectedNodes.has(edge.source.id) !== connectedNodes.has(edge.target.id))
      .classed('is-unlinked', edge => Boolean(active) && !connectedNodes.has(edge.source.id) && !connectedNodes.has(edge.target.id));
  }

  function tooltipAt(x, y, node) {
    if (localGraphOpen || collapseTimer) return;
    tooltip.innerHTML = `<strong>${escapeHTML(node.title)}</strong><span class="architecture-graph-hint"><kbd>right-click</kbd> open local graph</span>`;
    tooltip.hidden = false;
    const bounds = root.getBoundingClientRect();
    tooltip.style.left = `${Math.max(10, Math.min(x - bounds.left + 14, bounds.width - tooltip.offsetWidth - 12))}px`;
    tooltip.style.top = `${Math.max(10, Math.min(y - bounds.top + 14, bounds.height - tooltip.offsetHeight - 12))}px`;
  }

  function hideTooltip() {
    if (collapseTimer) return;
    tooltip.hidden = true;
  }

  function localGraphBounds() {
    return { width: viewport.clientWidth, height: viewport.clientHeight };
  }

  function applyLocalGraphSize(size) {
    localGraphSize = size;
    tooltip.style.width = `${size}px`;
    tooltip.style.height = `${size}px`;
  }

  // The panel hugs the screen edge in fullscreen (no margin), and keeps a
  // small inset otherwise.
  function localGraphEdge() {
    return root.classList.contains('is-fullscreen') ? { margin: 0, floor: 0 } : { margin: 12, floor: 8 };
  }

  // The local-graph panel sits with its top-left corner in the right-bottom
  // corner direction of the hovered node and follows the node while the main
  // simulation, pan, or zoom moves it.
  function positionLocalGraph() {
    if (!localGraphOpen || !localGraphNode) return;
    const transform = d3.zoomTransform(svg.node());
    // The dot radius lives in world units and must be scaled by the zoom
    // level before mixing it with the screen-space gap.
    const screenRadius = radius(localGraphNode) * transform.k;
    const x = transform.applyX(localGraphNode.x) + screenRadius + LOCAL_GRAPH_GAP;
    const y = transform.applyY(localGraphNode.y) + screenRadius + LOCAL_GRAPH_GAP;
    const { width, height } = localGraphBounds();
    const { margin, floor } = localGraphEdge();
    localGraphX = Math.max(floor, Math.min(x, width - localGraphSize - margin));
    localGraphY = Math.max(floor, Math.min(y, height - localGraphSize - margin));
    tooltip.style.left = `${localGraphX}px`;
    tooltip.style.top = `${localGraphY}px`;
  }

  // The square resizes by dragging a corner grip; the size delta is the mean
  // of the pointer's dx and dy so it stays a square, and the maximum is
  // clamped so the panel never leaves the viewport. Each grip keeps its
  // OPPOSITE corner fixed (window-resize semantics): the bottom-right grip
  // grows from the fixed top-left anchor; the top-left grip pins the
  // bottom-right corner, derives the top-left as BR − size, and ALSO pans
  // the main graph by the corner delta so the panel stays anchored at the
  // hovered node's right-bottom direction.
  function clampLocalGraphSize(size) {
    const { width, height } = localGraphBounds();
    const { margin } = localGraphEdge();
    const max = Math.max(LOCAL_GRAPH_MIN_SIZE,
      Math.min(LOCAL_GRAPH_MAX_SIZE, width - localGraphX - margin, height - localGraphY - margin));
    return Math.min(Math.max(LOCAL_GRAPH_MIN_SIZE, size), max);
  }

  // Top-left corner: the bottom-right corner is pinned, so the size is
  // bounded by the distance from that pinned corner to the viewport's
  // top-left edge (the right/bottom edges are already inside and never move).
  function clampLocalGraphCornerSize(size, brLeft, brTop) {
    const { floor } = localGraphEdge();
    const maxSize = Math.max(LOCAL_GRAPH_MIN_SIZE,
      Math.min(LOCAL_GRAPH_MAX_SIZE, brLeft - floor, brTop - floor));
    return Math.min(Math.max(LOCAL_GRAPH_MIN_SIZE, size), maxSize);
  }

  function wireLocalResize(grip, corner) {
    const onPointerMove = event => {
      if (!localResize) return;
      const dx = event.clientX - localResize.startX;
      const dy = event.clientY - localResize.startY;
      if (corner === 'bottom-right') {
        const delta = (dx + dy) / 2;
        applyLocalGraphSize(clampLocalGraphSize(localResize.startSize + delta));
        return;
      }
      // Top-left corner: the bottom-right corner stays pinned while the
      // square resizes around it, and the main graph pans by the same screen
      // delta as the moving corner so the node stays glued to the panel's
      // top-left corner (the panel remains at the node's right-bottom).
      // Pan from the view CAPTURED AT POINTERDOWN by the cumulative corner
      // offset — panning the live view by the cumulative offset each move
      // compounds (move n lands at −10·n(n+1)/2, a runaway). Build the
      // shifted view with the identity constructor: translate is
      // screen-space, never k-scaled world-space.
      const delta = (dx + dy) / 2;
      const brLeft = localResize.startLeft + localResize.startSize;
      const brTop = localResize.startTop + localResize.startSize;
      const size = clampLocalGraphCornerSize(localResize.startSize - delta, brLeft, brTop);
      const left = brLeft - size;
      const top = brTop - size;
      applyLocalGraphSize(size);
      localGraphX = left;
      localGraphY = top;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      const view = localResize.startView;
      const shifted = d3.zoomIdentity
        .translate(view.x + left - localResize.startLeft, view.y + top - localResize.startTop)
        .scale(view.k);
      svg.property('__zoom', shifted);
      applyGraphView(shifted);
    };
    const onPointerUp = () => {
      if (!localResize) return;
      localResize = null;
      tooltip.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
    grip.addEventListener('pointerdown', event => {
      event.preventDefault();
      event.stopPropagation();
      if (corner === 'top-left') cancelGraphJelly();
      localResize = {
        startX: event.clientX,
        startY: event.clientY,
        startSize: localGraphSize,
        startLeft: localGraphX,
        startTop: localGraphY,
        startView: d3.zoomTransform(svg.node()),
      };
      tooltip.classList.add('is-resizing');
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      window.addEventListener('pointercancel', onPointerUp);
      if (grip.setPointerCapture) grip.setPointerCapture(event.pointerId);
    });
  }

  function localGraphDefaultSize() {
    const { width, height } = localGraphBounds();
    return Math.max(LOCAL_GRAPH_MIN_SIZE,
      Math.min(LOCAL_GRAPH_DEFAULT_MAX, Math.round(width * .5), Math.round(height * .55)));
  }

  // Normalized logistic sigmoid: endpoints hit exactly 0/1, fast middle —
  // the site's standard easing for quick triggered shifts.
  const sigmoidEase = t => {
    const logistic = z => 1 / (1 + Math.exp(-z));
    const sigma = 1 / 6;
    return (logistic((t - .5) / sigma) - logistic(-3)) / (logistic(3) - logistic(-3));
  };

  function localGraphFits(node) {
    const transform = d3.zoomTransform(svg.node());
    const screenRadius = radius(node) * transform.k;
    const x = transform.applyX(node.x) + screenRadius + LOCAL_GRAPH_GAP;
    const y = transform.applyY(node.y) + screenRadius + LOCAL_GRAPH_GAP;
    const { width, height } = localGraphBounds();
    const size = localGraphDefaultSize();
    const { margin, floor } = localGraphEdge();
    // Half-pixel tolerance: the clamp lands the panel exactly on the binding
    // edge, and float noise must not re-trigger a micro-shift.
    return x >= floor - .5 && y >= floor - .5 && x + size + margin <= width + .5 && y + size + margin <= height + .5;
  }

  // When the hovered node is not in a spot where the panel would fit, the
  // panel opens immediately at the node and the view glides over 400 ms with
  // a normalized-logistic sigmoid, translate only (the zoom level is never
  // changed). Zoomed out: the MINIMAL distance that brings the panel fully
  // inside (no fixed anchor, so the view never sweeps across the whole
  // screen). Zoomed in (k > 1): the node glides to the comfortable 20% / 22%
  // anchor instead of being jammed against a boundary. Hover feedback is
  // frozen while the view slides under the cursor, so the highlight doesn't
  // flicker across the nodes the sweep passes.
  function openLocalGraph(node) {
    if (!graph) return;
    if (localGraphFits(node)) { doOpenLocalGraph(node, true); return; }
    doOpenLocalGraph(node, false);
    const start = d3.zoomTransform(svg.node());
    const { width, height } = localGraphBounds();
    const size = localGraphDefaultSize();
    const { margin, floor } = localGraphEdge();
    const zoomedIn = start.k > 1;
    let end = zoomedIn
      ? d3.zoomIdentity.translate(width * .2 - start.k * node.x, height * .22 - start.k * node.y).scale(start.k)
      : start;
    const r = radius(node) * start.k;
    const leftNow = end.applyX(node.x) + r + LOCAL_GRAPH_GAP;
    const topNow = end.applyY(node.y) + r + LOCAL_GRAPH_GAP;
    const clampAxis = (now, anchor, extent) => {
      const lo = now + floor - anchor;
      const hi = now + extent - margin - size - anchor;
      return Math.max(lo, Math.min(hi, now));
    };
    // NOTE: build the end transform with the identity constructor — the
    // Transform.translate METHOD adds k·(dx, dy) (world-space), which left
    // every shift at only k × the needed distance and caused the panel to
    // visually clamp while the node never reached its spot.
    end = d3.zoomIdentity
      .translate(clampAxis(end.x, leftNow, width), clampAxis(end.y, topNow, height))
      .scale(end.k);
    if (reducedMotion.matches) {
      world.attr('transform', end);
      svg.property('__zoom', end);
      positionLocalGraph();
      return;
    }
    const ix = d3.interpolate(start.x, end.x);
    const iy = d3.interpolate(start.y, end.y);
    const ik = d3.interpolate(start.k, end.k);
    let done = false;
    const started = performance.now();
    const finish = () => {
      world.attr('transform', end);
      svg.property('__zoom', end);
      positionLocalGraph();
      done = true;
      shiftingView = false;
      highlight(localGraphNode);
    };
    // Plain rAF + performance.now() — d3.timer's slewed clock can stall the
    // callback (the shift froze mid-frame in headless), so the glide owns its
    // clock. The watchdog completes the glide even if rAF is suspended.
    shiftingView = true;
    const step = () => {
      if (done) return;
      const t = Math.min(1, (performance.now() - started) / 400);
      const eased = sigmoidEase(t);
      const next = d3.zoomIdentity.translate(ix(eased), iy(eased)).scale(ik(eased));
      world.attr('transform', next);
      svg.property('__zoom', next);
      positionLocalGraph();
      if (t === 1) { finish(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    window.setTimeout(() => { if (!done) finish(); }, 450);
  }

  // Expands the hover card into a square Obsidian-style local graph: the
  // hovered node, its direct neighbors, and the edges among them, laid out
  // by its own force simulation in a fixed 1000-unit world that scales with
  // the panel.
  function doOpenLocalGraph(node, withOpening = true) {
    if (!graph) return;
    if (collapseTimer) { clearTimeout(collapseTimer); collapseTimer = null; }
    if (openingTimer) { clearTimeout(openingTimer); openingTimer = null; }
    if (swapTimer) { clearTimeout(swapTimer); swapTimer = null; }
    // A re-expand mid-collapse starts from wherever the box is; drop the
    // collapsing state so the panel content is fully visible again.
    tooltip.classList.remove('collapsing');
    // The hover card expands into the panel: freeze its committed geometry
    // as the opening transition's before-state (adding the class and the
    // target size in one frame would snap with no animation). Re-targeting
    // an already-open panel — or reduced motion — swaps instantly instead.
    const openingFrom = withOpening && !localGraphOpen && !tooltip.hidden && !reducedMotion.matches
      ? { left: tooltip.style.left, top: tooltip.style.top, width: tooltip.offsetWidth, height: tooltip.offsetHeight }
      : null;
    localGraphOpen = true;
    localGraphNode = node;
    highlight(node);
    if (localSim) localSim.stop();
    const subSet = new Set([node.id, ...(graph.neighbors.get(node.id) || [])]);
    const subNodes = graph.nodes.filter(n => subSet.has(n.id));
    // Only edges incident to the hovered node are drawn — never lines
    // between two non-hovered neighbor nodes.
    const subEdges = graph.edges
      .filter(edge => subSet.has(edge.source) && subSet.has(edge.target))
      .filter(edge => edge.source === node.id || edge.target === node.id);
    const world = LOCAL_GRAPH_WORLD;
    const center = world / 2;
    const seedRandom = seededRandom(`local:${node.id}`);
    const localNodes = subNodes.map(n => ({
      id: n.id,
      title: n.title,
      href: n.href,
      isCenter: n.id === node.id,
      weight: n.weight,
      x: n.id === node.id ? center : center + (seedRandom() - .5) * world * .5,
      y: n.id === node.id ? center : center + (seedRandom() - .5) * world * .5,
    }));
    const localLinks = subEdges.map(edge => {
      const restRandom = seededRandom(`local:${edge.source}|${edge.target}`);
      return {
        source: localNodes.find(n => n.id === edge.source),
        target: localNodes.find(n => n.id === edge.target),
        restDistance: world * .13 + restRandom() * world * .09,
      };
    });

    tooltip.hidden = false;
    tooltip.innerHTML = '';
    tooltip.classList.remove('is-resizing');
    tooltip.classList.add('is-local-graph');
    if (withOpening) tooltip.classList.add('opening');
    const head = document.createElement('div');
    head.className = 'architecture-graph-local-head';
    const header = document.createElement('strong');
    header.textContent = node.title;
    head.appendChild(header);
    const meta = document.createElement('span');
    meta.className = 'architecture-graph-local-meta';
    meta.textContent = `${node.weight} connections`;
    head.appendChild(meta);
    tooltip.appendChild(head);
    const localSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    localSvg.setAttribute('class', 'architecture-graph-local-svg');
    localSvg.setAttribute('viewBox', `0 0 ${world} ${world}`);
    localSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    localSvg.setAttribute('aria-hidden', 'true');
    tooltip.appendChild(localSvg);
    const makeResizeGrip = (modifier, ariaLabel, paths) => {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = `architecture-graph-resize${modifier ? ` ${modifier}` : ''}`;
      grip.setAttribute('aria-label', ariaLabel);
      grip.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">${paths}</svg>`;
      return grip;
    };
    const grip = makeResizeGrip('', 'Resize local graph',
      '<path d="M4 12 12 4M8 16 16 8M0 8 8 0" stroke-linecap="round"/>');
    const topLeftGrip = makeResizeGrip('architecture-graph-resize-top-left',
      'Resize local graph from the top-left corner',
      '<path d="M12 4 4 12M16 8 8 16M8 0 0 8" stroke-linecap="round"/>');
    tooltip.appendChild(grip);
    tooltip.appendChild(topLeftGrip);
    const recenter = document.createElement('button');
    recenter.type = 'button';
    recenter.className = 'architecture-graph-local-recenter';
    recenter.setAttribute('aria-label', 'Recenter local graph');
    recenter.title = 'Recenter local graph';
    recenter.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    recenter.addEventListener('click', event => { event.stopPropagation(); recenterLocal(); });
    tooltip.appendChild(recenter);

    const selection = d3.select(localSvg);
    const localWorld = selection.append('g').attr('class', 'architecture-graph-local-world');
    const localEdgeLayer = localWorld.append('g').attr('class', 'architecture-graph-local-edges');
    const localNodeLayer = localWorld.append('g').attr('class', 'architecture-graph-local-nodes');
    // The drawn graph fills the square edge-to-edge: the view is fitted to
    // the content's bounding box (dots plus radii) with NO gap between the
    // showing edge and the panel boundary, capped at k = 6 so a lone node
    // doesn't blow up past the zoom ceiling.
    const computeFit = () => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const n of localNodes) {
        const r = n.isCenter ? 26 : 18;
        x0 = Math.min(x0, n.x - r);
        x1 = Math.max(x1, n.x + r);
        y0 = Math.min(y0, n.y - r);
        y1 = Math.max(y1, n.y + r);
      }
      const bw = Math.max(1, x1 - x0);
      const bh = Math.max(1, y1 - y0);
      const k = Math.min(6, world / bw, world / bh);
      return d3.zoomIdentity
        .translate(world / 2 - k * (x0 + x1) / 2, world / 2 - k * (y0 + y1) / 2)
        .scale(k);
    };
    const applyLocalTransform = next => {
      localFitK = next.k;
      localWorld.attr('transform', next);
      d3.select(localSvg).property('__zoom', next);
    };
    // The local graph is zoomable (wheel) and pannable (background drag);
    // d3.drag's stopImmediatePropagation on the dots keeps dot drags from
    // panning the view, exactly like the main graph. Labels hide below the
    // SAME RELATIVE threshold as the global graph: 1.2 × the fitted rest
    // scale, so they stay hidden at rest and appear after zooming in.
    const localZoom = d3.zoom().scaleExtent([.5, 6]).on('zoom', event => {
      localWorld.attr('transform', event.transform);
      tooltip.classList.toggle('labels-hidden', event.transform.k < localFitK * LABEL_ZOOM_THRESHOLD);
    });
    selection.call(localZoom).on('dblclick.zoom', null);
    // The local view starts at the fitted rest scale, below the relative
    // label threshold, so labels are hidden until the user zooms in — same
    // as the global graph.
    tooltip.classList.add('labels-hidden');
    // Recenter glides the local view back to the fitted rest view (whole
    // graph visible, labels re-hidden) with the same sigmoid rAF + watchdog
    // pattern as the main-view shift.
    function recenterLocal() {
      const startT = d3.zoomTransform(localSvg);
      const target = computeFit();
      const ix = d3.interpolate(startT.x, target.x);
      const iy = d3.interpolate(startT.y, target.y);
      const ik = d3.interpolate(startT.k, target.k);
      let done = false;
      const started = performance.now();
      const finish = () => {
        applyLocalTransform(target);
        tooltip.classList.toggle('labels-hidden', true);
      };
      const step = () => {
        if (done) return;
        const t = Math.min(1, (performance.now() - started) / 320);
        const eased = sigmoidEase(t);
        const next = d3.zoomIdentity.translate(ix(eased), iy(eased)).scale(ik(eased));
        localWorld.attr('transform', next);
        d3.select(localSvg).property('__zoom', next);
        tooltip.classList.toggle('labels-hidden', next.k < localFitK * LABEL_ZOOM_THRESHOLD);
        if (t === 1) { done = true; return; }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      window.setTimeout(() => { if (!done) { done = true; finish(); } }, 370);
    }
    const links = localEdgeLayer.selectAll('line').data(localLinks).join('line')
      .attr('class', 'local-graph-edge');
    const localNodeSelections = localNodeLayer.selectAll('g').data(localNodes).join('g')
      .attr('class', 'local-graph-node');
    localNodeSelections.append('circle')
      .attr('class', 'local-graph-dot')
      .attr('r', n => (n.isCenter ? 26 : 18))
      .classed('is-center', n => n.isCenter);
    localNodeSelections.append('text')
      .attr('class', 'local-graph-label')
      .attr('x', 0)
      .attr('text-anchor', 'middle')
      .attr('dy', n => (n.isCenter ? 26 : 18) + 14)
      .classed('is-center', n => n.isCenter)
      .text(n => n.title);
    // Local graph nodes are draggable (classic elastic: pinned while held,
    // reheat at alphaTarget 0.35 so the neighbors are pulled along, springs
    // back on release) and clickable (opens the note's wiki page; a drag
    // suppresses the click).
    localNodeSelections.call(d3.drag()
      .on('start', (event, n) => {
        n.__startX = event.x;
        n.__startY = event.y;
        n.__moved = false;
        n.fx = n.x;
        n.fy = n.y;
        localSim.alphaTarget(DRAG_ALPHA_TARGET).restart();
      })
      .on('drag', (event, n) => {
        if (Math.hypot(event.x - n.__startX, event.y - n.__startY) > 4) n.__moved = true;
        n.fx = event.x;
        n.fy = event.y;
      })
      .on('end', (event, n) => {
        n.fx = null;
        n.fy = null;
        localSim.alphaTarget(0);
      }));
    localNodeSelections.on('click', (event, n) => {
      if (n.__moved) { n.__moved = false; return; }
      window.location.href = n.href;
    });
    // Hovering a dot inside the local graph gives main-graph brightness
    // feedback, and right-clicking it re-targets the panel to that dot's
    // node (the dot's main-graph counterpart is used, since the local dots
    // carry local-world coordinates).
    localNodeSelections
      .on('pointerenter', (event, n) => {
        const main = graph.nodes.find(node => node.id === n.id);
        if (main) highlight(main);
      })
      .on('pointerleave', () => {
        if (localGraphOpen) highlight(localGraphNode);
      })
      .on('contextmenu', (event, n) => {
        event.preventDefault();
        const main = graph.nodes.find(node => node.id === n.id);
        if (!main) return;
        if (localGraphOpen && localGraphNode && localGraphNode.id === main.id) collapseLocalGraph(event.clientX, event.clientY);
        else openLocalGraph(main);
      });
    const localTick = () => {
      links.attr('x1', link => link.source.x).attr('y1', link => link.source.y)
        .attr('x2', link => link.target.x).attr('y2', link => link.target.y);
      localNodeSelections.attr('transform', n => `translate(${n.x},${n.y})`);
    };
    localSim = d3.forceSimulation(localNodes)
      .force('link', d3.forceLink(localLinks).id(n => n.id)
        .distance(link => link.restDistance)
        .strength(.5))
      .force('charge', d3.forceManyBody().strength(-330).distanceMin(20))
      .force('center', d3.forceCenter(center, center).strength(.07))
      .force('collision', d3.forceCollide(52).strength(.55))
      .on('tick', localTick);
    if (reducedMotion.matches) {
      localSim.tick(LOCAL_GRAPH_SETTLE_TICKS);
      localTick();
      localSim.stop();
      applyLocalTransform(computeFit());
    } else {
      localSim.alpha(.3);
      for (let index = 0; index < LOCAL_GRAPH_SETTLE_TICKS; index += 1) localSim.tick();
      localTick();
      applyLocalTransform(computeFit());
      localSim.alpha(0).restart();
      const settled = localSim;
      window.setTimeout(() => { if (localSim === settled) settled.stop(); }, 250);
    }

    localGraphSize = localGraphDefaultSize();
    if (openingFrom) {
      // Commit the hover-card geometry as the transition's before-state —
      // the forced reflow between the two writes is what lets the CSS
      // opening transition animate the expand to the panel size/position.
      tooltip.style.left = openingFrom.left;
      tooltip.style.top = openingFrom.top;
      tooltip.style.width = `${openingFrom.width}px`;
      tooltip.style.height = `${openingFrom.height}px`;
      void tooltip.offsetWidth;
      applyLocalGraphSize(localGraphSize);
      positionLocalGraph();
    } else {
      applyLocalGraphSize(localGraphSize);
      positionLocalGraph();
    }
    wireLocalResize(grip, 'bottom-right');
    wireLocalResize(topLeftGrip, 'top-left');
    if (withOpening) openingTimer = window.setTimeout(() => {
      openingTimer = null;
      tooltip.classList.remove('opening');
    }, 320);
  }

  function exitLocalGraph() {
    if (collapseTimer) {
      // A collapse is mid-flight: cancel it and vanish the panel outright
      // (e.g. empty-space click during the shrink).
      clearTimeout(collapseTimer);
      collapseTimer = null;
      if (swapTimer) { clearTimeout(swapTimer); swapTimer = null; }
      tooltip.classList.remove('is-local-graph', 'labels-hidden', 'opening', 'is-resizing', 'collapsing');
      tooltip.style.width = '';
      tooltip.style.height = '';
      tooltip.innerHTML = '';
      tooltip.hidden = true;
      return;
    }
    if (!localGraphOpen) return;
    localGraphOpen = false;
    localGraphNode = null;
    localResize = null;
    if (localSim) { localSim.stop(); localSim = null; }
    tooltip.classList.remove('is-local-graph', 'is-resizing', 'opening');
    tooltip.style.width = '';
    tooltip.style.height = '';
    tooltip.innerHTML = '';
    tooltip.hidden = true;
    highlight();
  }

  // Second right-click on the node whose panel is open collapses the panel
  // back into the hovering state. The box starts shrinking immediately while
  // the panel content fades out over the first 140ms (no one-frame flash),
  // then the content swaps to the hover card — which fades in — and the box
  // finishes shrinking onto the card's natural size, ending with the tooltip
  // in exactly the state hovering would put it at the CURRENT pointer.
  // Right-clicking a DIFFERENT node still re-targets the panel.
  function collapseLocalGraph(clientX, clientY) {
    if (!localGraphOpen || !localGraphNode || collapseTimer) return;
    const node = localGraphNode;
    if (localSim) { localSim.stop(); localSim = null; }
    localResize = null;
    // Treat it as closed immediately: positionLocalGraph and the hover
    // handlers must not fight the shrink transition.
    localGraphOpen = false;
    localGraphNode = null;
    if (openingTimer) { clearTimeout(openingTimer); openingTimer = null; }
    if (swapTimer) { clearTimeout(swapTimer); swapTimer = null; }
    // Measure the hover-card target with a hidden probe — same content and
    // classes tooltipAt renders — without disturbing the box.
    const probe = document.createElement('div');
    probe.className = 'architecture-graph-tooltip';
    probe.style.visibility = 'hidden';
    probe.innerHTML = `<strong>${escapeHTML(node.title)}</strong><span class="architecture-graph-hint"><kbd>right-click</kbd> open local graph</span>`;
    root.appendChild(probe);
    const cardW = probe.offsetWidth;
    const cardH = probe.offsetHeight;
    probe.remove();
    const bounds = root.getBoundingClientRect();
    const tx = Math.max(10, Math.min(clientX - bounds.left + 14, bounds.width - cardW - 12));
    const ty = Math.max(10, Math.min(clientY - bounds.top + 14, bounds.height - cardH - 12));
    // Track the pointer so the collapse lands on whatever the hovering state
    // is at the END — the pointer may move while the box shrinks.
    let latestX = clientX;
    let latestY = clientY;
    const track = event => { latestX = event.clientX; latestY = event.clientY; };
    window.addEventListener('pointermove', track);
    const finish = () => {
      window.removeEventListener('pointermove', track);
      collapseTimer = null;
      tooltip.classList.remove('opening', 'collapsing');
      tooltip.style.width = '';
      tooltip.style.height = '';
      // Land exactly on the hovering state: show the hover card for whatever
      // node/option sits under the pointer now, or nothing over empty space.
      const over = document.elementFromPoint(latestX, latestY);
      const hovered = over?.closest('.architecture-graph-node')?.__data__
        || over?.closest('.architecture-graph-search-option')?.__data__ || null;
      if (hovered) {
        tooltipAt(latestX, latestY, hovered);
        highlight(hovered);
      } else {
        tooltip.innerHTML = '';
        tooltip.hidden = true;
        highlight();
      }
    };
    // Swap the faded-out panel content for the hover card mid-shrink. The
    // CSS fade is 140ms; the swap waits 200ms so the fade is fully done
    // even with a frame of transition start-up lag.
    const swapCard = () => {
      swapTimer = null;
      if (!collapseTimer) return;
      tooltip.classList.remove('is-local-graph', 'labels-hidden');
      tooltip.innerHTML = `<strong>${escapeHTML(node.title)}</strong><span class="architecture-graph-hint"><kbd>right-click</kbd> open local graph</span>`;
    };
    if (reducedMotion.matches) { finish(); return; }
    tooltip.classList.add('collapsing');
    tooltip.classList.add('opening');
    // Commit the panel geometry with the transitions active, then shrink to
    // the hover-card target — the same two-write pattern as the expand.
    void tooltip.offsetWidth;
    tooltip.style.left = `${tx}px`;
    tooltip.style.top = `${ty}px`;
    tooltip.style.width = `${cardW}px`;
    tooltip.style.height = `${cardH}px`;
    collapseTimer = window.setTimeout(finish, 320);
    swapTimer = window.setTimeout(swapCard, 200);
  }

  function hideSearchList() {
    searchList.hidden = true;
    searchList.innerHTML = '';
  }

  // Bing-style options below the search field: title + path per row. Hovering
  // an option behaves exactly like hovering the graph node (brightness ladder
  // + tooltip, with the right-click local-graph hint), a click opens the
  // note's wiki page — or switches the local graph when it is open — and a
  // right-click opens the local graph directly.
  function renderSearchOptions() {
    const query = search.value.trim().toLowerCase();
    if (!query || !graph) { hideSearchList(); return; }
    const options = graph.nodes
      .filter(node => node.id.toLowerCase().includes(query) || node.title.toLowerCase().includes(query))
      .slice(0, 8);
    if (!options.length) { hideSearchList(); return; }
    searchList.innerHTML = '';
    for (const node of options) {
      const option = document.createElement('li');
      option.className = 'architecture-graph-search-option';
      option.__data__ = node;
      const title = document.createElement('span');
      title.className = 'architecture-graph-search-option-title';
      title.textContent = node.title;
      const path = document.createElement('span');
      path.className = 'architecture-graph-search-option-path';
      path.textContent = node.id;
      option.append(title, path);
      option.addEventListener('pointerenter', event => {
        if (shiftingView) return;
        highlight(node);
        if (!localGraphOpen) tooltipAt(event.clientX, event.clientY, node);
      });
      option.addEventListener('pointerleave', () => {
        if (shiftingView) return;
        if (localGraphOpen) { highlight(localGraphNode); return; }
        highlight();
        hideTooltip();
      });
      option.addEventListener('click', event => {
        event.stopPropagation();
        if (localGraphOpen) openLocalGraph(node);
        else window.location.href = node.href;
      });
      option.addEventListener('contextmenu', event => {
        event.preventDefault();
        if (localGraphOpen && localGraphNode && localGraphNode.id === node.id) collapseLocalGraph(event.clientX, event.clientY);
        else openLocalGraph(node);
      });
      searchList.appendChild(option);
    }
    searchList.hidden = false;
  }

  // Rubber-band (jelly) zoom limits, matching the mermaid diagram: beyond
  // GRAPH_ZOOM_MIN/MAX the scale stretches with 70% resistance while the
  // input lasts, then a spring-back with a slight overshoot snaps it onto
  // the limit when the gesture stops. d3's internal transform stays the raw
  // (uncompressed) accumulator; the visible transform is the stretch. The
  // accumulator resets to the boundary only when a spring starts.
  const GRAPH_ZOOM_MIN = 0.25;
  const GRAPH_ZOOM_MAX = 5;
  let graphJellyTimer = 0;
  let graphJellyFrame = 0;
  let graphView = new d3.zoomIdentity.constructor(1, 0, 0);
  const cancelGraphJelly = () => {
    if (graphJellyTimer) { clearTimeout(graphJellyTimer); graphJellyTimer = 0; }
    if (graphJellyFrame) { cancelAnimationFrame(graphJellyFrame); graphJellyFrame = 0; }
  };
  const graphJellyTarget = (t) => {
    const k = t.k < GRAPH_ZOOM_MIN ? GRAPH_ZOOM_MIN : GRAPH_ZOOM_MAX;
    return new d3.zoomIdentity.constructor(k, t.x, t.y);
  };
  const applyGraphView = (view) => {
    graphView = view;
    world.attr('transform', `translate(${view.x}, ${view.y}) scale(${view.k})`);
    root.classList.toggle('labels-hidden', view.k < LABEL_ZOOM_THRESHOLD);
    positionLocalGraph();
  };
  const scheduleGraphJelly = () => {
    cancelGraphJelly();
    if (reducedMotion.matches) {
      const raw = d3.zoomTransform(svg.node());
      const target = graphJellyTarget(raw);
      svg.property('__zoom', new d3.zoomIdentity.constructor(target.k, target.x, target.y));
      applyGraphView(target);
      return;
    }
    graphJellyTimer = setTimeout(() => { graphJellyTimer = 0; graphJellySpring(); }, 180);
  };
  const graphJellySpring = () => {
    cancelGraphJelly();
    const raw = d3.zoomTransform(svg.node());
    // Stale timer (a fit already recovered): nothing to spring.
    if (!(raw.k < GRAPH_ZOOM_MIN || raw.k > GRAPH_ZOOM_MAX)) return;
    const target = graphJellyTarget(raw);
    // Re-engage from the boundary so a mid-spring wheel starts at the edge
    // (accepted ≤4% one-frame correction) instead of the raw depth.
    svg.property('__zoom', new d3.zoomIdentity.constructor(target.k, raw.x, raw.y));
    const start = graphView;
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const ease = t => (t >= 1 ? 1 : 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2);
    const duration = 450;
    const began = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - began) / duration);
      const e = ease(t);
      applyGraphView(new d3.zoomIdentity.constructor(
        start.k + (target.k - start.k) * e,
        start.x + (target.x - start.x) * e,
        start.y + (target.y - start.y) * e,
      ));
      if (t < 1) { graphJellyFrame = requestAnimationFrame(step); return; }
      graphJellyFrame = 0;
      applyGraphView(target);
    };
    graphJellyFrame = requestAnimationFrame(step);
  };

  function fit(animate = true) {
    if (!graph || !world.node() || !zoom) return;
    cancelGraphJelly();
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
    graphView = transform;
  }

  function render(nextGraph) {
    exitLocalGraph();
    graph = nextGraph;
    if (simulation) simulation.stop();
    edgeLayer.selectAll('*').remove();
    nodeLayer.selectAll('*').remove();
    const { width, height } = dimensions();
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    cancelGraphJelly();
    graphView = d3.zoomIdentity;
    zoom = d3.zoom().on('zoom', event => {
      const raw = event.transform;
      // Cap the raw accumulator BEFORE mapping, so a single cap-crossing
      // event cannot stretch the visual scale past the capped depth (and
      // repeated pinch input cannot grow it without bound).
      let rawK = raw.k;
      if (rawK > GRAPH_ZOOM_MAX + GRAPH_ZOOM_MAX / 0.3) {
        rawK = GRAPH_ZOOM_MAX + GRAPH_ZOOM_MAX / 0.3;
        svg.property('__zoom', new d3.zoomIdentity.constructor(rawK, raw.x, raw.y));
      }
      let tk = rawK;
      let band = null;
      if (tk < GRAPH_ZOOM_MIN) { tk = 0.7 * GRAPH_ZOOM_MIN + 0.3 * tk; band = 'min'; }
      else if (tk > GRAPH_ZOOM_MAX) { tk = GRAPH_ZOOM_MAX + 0.3 * (tk - GRAPH_ZOOM_MAX); band = 'max'; }
      // d3 already anchored the RAW transform at the pointer; re-anchor the
      // stretched scale so the point under the cursor stays put.
      let x = raw.x;
      let y = raw.y;
      if (band && event.sourceEvent) {
        const p = d3.pointer(event.sourceEvent, svg.node());
        if (p) {
          x = p[0] - (p[0] - raw.x) * (tk / rawK);
          y = p[1] - (p[1] - raw.y) * (tk / rawK);
        }
      }
      applyGraphView(new d3.zoomIdentity.constructor(tk, x, y));
      if (band) {
        scheduleGraphJelly();
      } else {
        cancelGraphJelly();
      }
    })
      .on('start', () => cancelGraphJelly()) // a pointer hold freezes the stretch
      .on('end', () => {
        const t = d3.zoomTransform(svg.node());
        if (t.k < GRAPH_ZOOM_MIN || t.k > GRAPH_ZOOM_MAX) scheduleGraphJelly();
      });
    svg.call(zoom).on('dblclick.zoom', null);
    // Right-click is the local-graph trigger; keep the browser menu out of
    // the whole graph canvas (node right-clicks open the panel and handle
    // the event first).
    svg.on('contextmenu', event => event.preventDefault());

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
      .on('pointerenter', (event, node) => {
        if (shiftingView) return;
        highlight(node);
        if (!localGraphOpen) tooltipAt(event.clientX, event.clientY, node);
      })
      .on('pointermove', (event, node) => {
        if (shiftingView || localGraphOpen) return;
        tooltipAt(event.clientX, event.clientY, node);
      })
      .on('pointerleave', () => {
        if (shiftingView) return;
        if (localGraphOpen) { highlight(localGraphNode); return; }
        highlight(); hideTooltip();
      })
      .on('focus', (event, node) => {
        highlight(node);
        if (!localGraphOpen) tooltipAt(event.clientX, event.clientY, node);
      })
      .on('blur', () => {
        if (localGraphOpen) { highlight(localGraphNode); return; }
        highlight(); hideTooltip();
      })
      .on('keydown', (event, node) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          window.location.href = node.href;
        }
      })
      .on('contextmenu', (event, node) => {
        // Right-click IS the local-graph trigger: opens the node's local
        // graph (replacing any open panel) — or COLLAPSES it when the
        // right-clicked node's panel is already the open one (toggle); the
        // native menu is suppressed.
        event.preventDefault();
        if (localGraphOpen && localGraphNode && localGraphNode.id === node.id) collapseLocalGraph(event.clientX, event.clientY);
        else openLocalGraph(node);
      })
      .on('click', (event, node) => {
        if (suppressClick) { suppressClick = false; return; }
        if (localGraphOpen) {
          event.stopPropagation();
          openLocalGraph(node);
          return;
        }
        window.location.href = node.href;
      });
    nodes.append('circle').attr('class', 'architecture-graph-dot').attr('r', radius);
    nodes.append('text').attr('class', 'architecture-graph-label').attr('x', 0).attr('text-anchor', 'middle').attr('dy', node => radius(node) + 8).text(node => node.title);

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
      positionLocalGraph();
    };
    simulation.on('tick', tick);

    // Drag model: classic elastic drag — pickup boosts incident springs ×4
    // (cap 0.95) and reheats at alphaTarget 0.35, so the directly linked
    // nodes are pulled along during the hold. Release unpins the node
    // (fx/fy = null) and restores baseline strengths so it is affected by
    // the other nodes' forces again and springs back while the simulation
    // cools. The centering forces (x/y toward the origin, strength 0.1) stay
    // active like the original Obsidian graph — they hold the layout
    // together and keep weakly-connected notes from being flung out of the
    // cluster by the repulsion while the simulation runs hot.
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
        node.fx = null;
        node.fy = null;
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
    renderSearchOptions();
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

  search.addEventListener('input', () => { highlight(); renderSearchOptions(); });
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
  // The ONLY way to leave local graph mode is a click on empty graph space:
  // clicks on nodes switch the local graph, clicks on the panel itself are
  // inert, and a pan drag is suppressed by d3.zoom's click filter.
  viewport.addEventListener('click', event => {
    if (!localGraphOpen) return;
    if (event.target.closest('.architecture-graph-node')) return;
    if (event.target.closest('.architecture-graph-tooltip')) return;
    exitLocalGraph();
  });
  window.addEventListener('resize', () => {
    clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => fit(false), 120);
  });

  load();
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.setInterval(() => load(), 5000);
})();
