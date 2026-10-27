// The fourth page: the export list's dots slide down and become the frame of
// the live wiki architecture graph. The graph itself is the old D3 note map;
// this script only draws its window edge, so the graph stays interactive.
(() => {
  const section = document.querySelector('.wiki-architecture-section');
  if (!section) return;
  const canvas = section.querySelector('.architecture-particles');
  const graph = section.querySelector('.architecture-graph');
  const exportSection = document.querySelector('.export-section');
  if (!canvas || !graph) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = window.matchMedia('(max-width: 900px)');
  const TAU = Math.PI * 2;
  const BUCKETS = 7;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const easeOut = t => 1 - (1 - t) ** 3;

  const FORM_MS = 1750;
  const COUNT = 2800;
  const FRAME_RINGS = [
    { inset: 3, radius: 13, step: 2.4, jitter: .8, alpha: .72, size: .9 },
    { inset: 8, radius: 17, step: 3.0, jitter: .9, alpha: .50, size: .72 },
  ];

  let width = 0;
  let height = 0;
  let dpr = 1;
  let points = [];
  let particles = [];
  let seeds = [];
  let state = 'idle';
  let formStart = 0;
  let frame = 0;
  let lastScrollY = typeof window.scrollY === 'number' ? window.scrollY : 0;
  let lastBox = { w: 0, h: 0 };

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function ring(target, l, t, r, b, rad, step, jitter, alpha, size) {
    const segments = [];
    const line = (x0, y0, x1, y1) => {
      const len = Math.hypot(x1 - x0, y1 - y0);
      segments.push({ len, at: k => [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k] });
    };
    const arc = (cx, cy, a0, a1) => {
      const len = Math.abs(a1 - a0) * rad;
      segments.push({
        len,
        at: k => [cx + Math.cos(a0 + (a1 - a0) * k) * rad, cy + Math.sin(a0 + (a1 - a0) * k) * rad],
      });
    };
    line(l + rad, t, r - rad, t);
    arc(r - rad, t + rad, -Math.PI / 2, 0);
    line(r, t + rad, r, b - rad);
    arc(r - rad, b - rad, 0, Math.PI / 2);
    line(r - rad, b, l + rad, b);
    arc(l + rad, b - rad, Math.PI / 2, Math.PI);
    line(l, b - rad, l, t + rad);
    arc(l + rad, t + rad, Math.PI, Math.PI * 1.5);

    const total = segments.reduce((sum, s) => sum + s.len, 0);
    const count = Math.max(8, Math.round(total / step));
    for (let i = 0; i < count; i++) {
      let d = (i + Math.random()) * total / count;
      let chosen = segments[segments.length - 1];
      for (const segment of segments) {
        if (d <= segment.len) { chosen = segment; break; }
        d -= segment.len;
      }
      const [x, y] = chosen.at(chosen.len ? d / chosen.len : 0);
      target.push({
        x: x + random(-jitter, jitter),
        y: y + random(-jitter, jitter),
        a: alpha * random(.55, 1),
        s: size * random(.65, 1.4),
      });
    }
  }

  // Build the frame in units of the graph width. The rings sit outside the
  // graph edge, so the opaque graph background hides nothing and the canvas can
  // stay behind the content (the export list stays readable during the hand-off).
  function buildFrame() {
    const rect = graph.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return false;
    const w = rect.width;
    const h = rect.height;
    const H = h / w;
    const pts = [];

    for (const ringSpec of FRAME_RINGS) {
      const inset = ringSpec.inset / w;
      ring(
        pts,
        -inset, -inset, 1 + inset, H + inset,
        ringSpec.radius / w,
        ringSpec.step / w,
        ringSpec.jitter / w,
        ringSpec.alpha,
        ringSpec.size,
      );
    }

    // Four corner brackets, outside the window's rounded corners.
    const d = 12 / w;
    const len = 44 / w;
    const step = 2.2 / w;
    const bracket = (x0, y0, x1, y1) => {
      const length = Math.hypot(x1 - x0, y1 - y0);
      const count = Math.max(3, Math.round(length / step));
      for (let i = 0; i < count; i++) {
        const k = (i + Math.random()) / count;
        pts.push({
          x: x0 + (x1 - x0) * k + random(-.8 / w, .8 / w),
          y: y0 + (y1 - y0) * k + random(-.8 / w, .8 / w),
          a: random(.62, 1),
          s: random(.6, 1.35),
        });
      }
    };
    bracket(-d, -d, -d + len, -d);
    bracket(-d, -d, -d, -d + len);
    bracket(1 + d - len, -d, 1 + d, -d);
    bracket(1 + d, -d, 1 + d, -d + len);
    bracket(-d, H + d - len, -d + len, H + d);
    bracket(-d, H + d, -d, H + d - len);
    bracket(1 + d - len, H + d, 1 + d, H + d);
    bracket(1 + d, H + d, 1 + d, H + d - len);

    // A few embers just outside the border, so the frame reads as particles
    // rather than a stroked rectangle.
    for (let i = 0; i < 110; i++) {
      const side = Math.floor(Math.random() * 4);
      const spread = random(.02, .98);
      const drift = random(4, 18) / w;
      let x;
      let y;
      if (side === 0) { x = spread; y = -drift; }
      else if (side === 1) { x = 1 + drift; y = spread * H; }
      else if (side === 2) { x = spread; y = H + drift; }
      else { x = -drift; y = spread * H; }
      pts.push({
        x,
        y,
        a: random(.18, .7),
        s: random(.45, 1.7),
      });
    }

    points = pts;
    lastBox = { w, h };
    return true;
  }

  function buildParticles() {
    particles = Array.from({ length: COUNT }, () => ({
      delay: random(0, .38),
      dur: random(.95, 1.25),
      swayX: random(-18, 18),
      swayY: random(-18, 18),
    }));
  }

  function captureSeeds() {
    const dots = window.rtmExportDots ? window.rtmExportDots() : [];
    seeds = particles.map((_, i) => {
      if (!dots.length) return [random(0, width), -random(0, height * .5)];
      const dot = dots[i % dots.length];
      let y = dot[1];
      // Deep links can leave the list far above the viewport; let the batch
      // enter from the nearest edge instead of waiting out of frame.
      if (y < -height) y = -20 - random(0, 80);
      else if (y > height * 1.2) y = height + 20;
      return [dot[0], y];
    });
  }

  function paint(now) {
    if (!points.length) return;
    if (!width || !height) resizeCanvas();
    const rect = graph.getBoundingClientRect();
    if (rect.width < 2) return;
    const sectionRect = section.getBoundingClientRect();
    const forming = state === 'forming';
    if (!forming && (sectionRect.bottom < -120 || sectionRect.top > height + 120)) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    for (const bucket of buckets) bucket.length = 0;
    ctx.globalCompositeOperation = 'lighter';
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const point = points[i % points.length];
      const tx = rect.left + point.x * rect.width;
      const ty = rect.top + point.y * rect.width;
      let x = tx;
      let y = ty;
      let alpha = point.a;

      if (forming) {
        const raw = clamp((now - formStart - p.delay * 1000) / (p.dur * 1000), 0, 1);
        if (raw <= 0) continue;
        const eased = easeOut(raw);
        const seed = seeds[i] || [0, 0];
        const sway = Math.sin(Math.PI * raw);
        x = seed[0] + (tx - seed[0]) * eased + sway * p.swayX;
        y = seed[1] + (ty - seed[1]) * eased + sway * p.swayY;
        alpha *= clamp(raw * 1.6, 0, 1);
      }

      if (alpha < .03) continue;
      const index = Math.min(BUCKETS - 1, Math.max(0, Math.round(alpha * (BUCKETS - 1))));
      buckets[index].push(x, y, point.s);
    }

    ctx.fillStyle = 'rgba(245, 245, 245, .032)';
    ctx.beginPath();
    for (const bucket of buckets) {
      for (let i = 0; i < bucket.length; i += 3) {
        const radius = bucket[i + 2] * 2.8;
        const x = bucket[i];
        const y = bucket[i + 1];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
    }
    ctx.fill();

    ctx.fillStyle = '#f5f5f5';
    for (let b = 0; b < BUCKETS; b++) {
      const bucket = buckets[b];
      if (!bucket.length) continue;
      ctx.globalAlpha = (b + 1) / BUCKETS;
      ctx.beginPath();
      for (let i = 0; i < bucket.length; i += 3) {
        const radius = bucket[i + 2];
        const x = bucket[i];
        const y = bucket[i + 1];
        ctx.moveTo(x + radius, y);
        ctx.arc(x, y, radius, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function tick(now) {
    frame = 0;
    if (state === 'forming' && now - formStart >= FORM_MS) state = 'frame';
    paint(now);
    if (state === 'forming') frame = requestAnimationFrame(tick);
  }

  function queue() {
    if (frame || state === 'idle') return;
    frame = requestAnimationFrame(tick);
  }

  function form() {
    if (state !== 'idle') return;
    if (narrow.matches || reduced.matches) return;
    if (!particles.length) buildParticles();
    if (!buildFrame()) return;
    captureSeeds();
    state = 'forming';
    formStart = performance.now();
    section.classList.add('is-active');
    if (exportSection) exportSection.classList.add('is-handing-off');
    queue();
  }

  function reset() {
    state = 'idle';
    section.classList.remove('is-active');
    if (exportSection) exportSection.classList.remove('is-handing-off');
    ctx.clearRect(0, 0, width, height);
  }

  function onScroll() {
    const rect = section.getBoundingClientRect();
    const up = window.scrollY < lastScrollY - 2;
    if (state !== 'idle' && up && rect.top > height * .72) reset();
    if (state === 'idle' && !narrow.matches && !reduced.matches && rect.top < height * .7 && rect.bottom > -80) {
      form();
    }
    if (state !== 'idle') queue();
    lastScrollY = window.scrollY;
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (narrow.matches || reduced.matches) {
      reset();
      return;
    }
    if (buildFrame() && state === 'frame') paint(performance.now());
  }, { passive: true });
  reduced.addEventListener('change', () => {
    if (reduced.matches) reset();
    else if (state === 'idle' && section.getBoundingClientRect().top < height * .7) form();
  });

  // The graph is flex-sized and can change with the viewport (or fullscreen).
  // A frame built for the old box would no longer hug the edge.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (narrow.matches || reduced.matches) return;
      const rect = graph.getBoundingClientRect();
      if (Math.abs(rect.width - lastBox.w) < 1 && Math.abs(rect.height - lastBox.h) < 1) return;
      if (buildFrame() && state === 'frame') paint(performance.now());
    }).observe(graph);
  }

  resizeCanvas();
  onScroll();
})();
