// The opening logo sheds its particles into the three stack marks.
//
// The canvas is fixed above the page but below the stack content and the bar,
// so the stream can begin at the hero-stage mark and land exactly on the marks. Each
// SVG is sampled once into an organic stipple â€” jittered points with varied
// weight, not a dot grid â€” and the particles fly in with a per-mark delay and
// STAY as particles. The SVGs underneath are only sampling targets and are
// never revealed. After settling the canvas is redrawn on scroll so the
// particle logos travel with the section.
(() => {
  const section = document.querySelector('.stack-section');
  if (!section) return;
  const canvas = section.querySelector('.stack-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const marks = [...section.querySelectorAll('.stack-mark')];
  const images = marks.map(mark => mark.querySelector('img'));
  const angles = marks.map(mark => (Number(mark.dataset.rotate) || 0) * Math.PI / 180);
  if (!images.length || images.some(img => !img)) return;

  const TAU = Math.PI * 2;
  const BUCKETS = 7;
  const SOURCE = 240;   // sampling resolution of the SVG's long edge
  const STEP = 2;       // sampling cell, in source pixels
  const DENSITIES = [0.10, 0.10, 0.12]; // interior dust, per mark (edges are dense)
  const buckets = Array.from({ length: BUCKETS }, () => []);
  let particles = [];
  let ratios = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let frame = 0;
  let settleFrame = 0;
  let started = false;
  let settled = false;
  let sampled = false;
  let startTime = 0;
  let originX = 0;
  let originY = 0;
  let lastDots = [];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The no-animation path: show the SVGs, hide the canvas.
  function fallback() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    settled = false;
    section.classList.remove('is-animating');
    section.classList.add('is-formed');
  }

  // Keep the particle logos. The real SVGs stay opacity 0; the canvas stays.
  function settle() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    settled = true;
    paint(true);
  }

  // One mark, sampled from the SVG itself. The alpha channel is the shape; the
  // source is a white path on transparent, so it works on this black page.
  // Contour cells are kept dense so the silhouette stays legible; the interior
  // is only dusted in, which reads as light instead of a solid fill. Points are
  // jittered inside their cell so no grid survives. Coordinates are normalized
  // to the mark's own aspect ratio so the Vulkan bug is not squashed.
  function sample(img, density) {
    const ratio = (img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight
      : 1;
    const w = SOURCE;
    const h = Math.max(1, Math.round(SOURCE / ratio));
    const sheet = document.createElement('canvas');
    sheet.width = w;
    sheet.height = h;
    const pen = sheet.getContext('2d', { willReadFrequently: true });
    pen.clearRect(0, 0, w, h);
    pen.drawImage(img, 0, 0, w, h);
    const data = pen.getImageData(0, 0, w, h).data;
    const alphaAt = (x, y) => data[(y * w + x) * 4 + 3];
    const onEdge = (x, y) =>
      alphaAt(Math.max(0, x - 3), y) < 40 ||
      alphaAt(Math.min(w - 1, x + 3), y) < 40 ||
      alphaAt(x, Math.max(0, y - 3)) < 40 ||
      alphaAt(x, Math.min(h - 1, y + 3)) < 40;
    const points = [];
    for (let y = 0; y < h; y += STEP) {
      for (let x = 0; x < w; x += STEP) {
        let a = 0;
        for (let dy = 0; dy < STEP && y + dy < h; dy++) {
          for (let dx = 0; dx < STEP && x + dx < w; dx++) {
            const v = alphaAt(x + dx, y + dy);
            if (v > a) a = v;
          }
        }
        if (a < 30) continue;
        const edge = onEdge(x + 1, y + 1);
        if (Math.random() > (a / 255) * (edge ? 0.82 : density)) continue;
        points.push([
          (x + Math.random() * STEP) / w,
          (y + Math.random() * STEP) / h,
          edge ? 1 : 0,
        ]);
      }
    }
    return points;
  }

  function build() {
    if (sampled) return particles.length > 0;
    sampled = true;
    ratios = images.map(img => (img.naturalWidth && img.naturalHeight)
      ? img.naturalWidth / img.naturalHeight
      : 1);
    const sets = images.map((img, logo) => {
      try {
        return sample(img, DENSITIES[logo] || DENSITIES[0]);
      } catch {
        return [];
      }
    });
    if (sets.some(points => !points.length)) return false;
    particles = [];
    sets.forEach((points, logo) => {
      for (const [nx, ny, edge] of points) {
        const star = !edge && Math.random() < 0.025;
        particles.push({
          logo,
          nx,
          ny,
          delay: logo * 0.22 + random(0, 0.34),
          duration: random(0.95, 1.3),
          size: edge ? random(0.55, 1.15) : (star ? random(1.5, 2.1) : random(0.4, 0.9)),
          alpha: edge ? random(0.6, 1) : (star ? 1 : random(0.2, 0.55)),
          curve: random(-22, 22),
          arc: random(8, 52),
        });
      }
    });
    return particles.length > 0;
  }

  // Screen-space boxes for the three marks, read once per paint. The center of
  // the bounding rect equals the element's center even when the mark is rotated.
  function boxes() {
    return images.map(img => {
      const rect = img.getBoundingClientRect();
      return {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        w: img.offsetWidth,
        h: img.offsetHeight,
      };
    });
  }

  function paint(final) {
    const elapsed = final ? Infinity : (performance.now() - startTime) / 1000;
    let done = true;
    for (const bucket of buckets) bucket.length = 0;
    const rects = boxes();
    const dots = [];

    for (const p of particles) {
      if (!final && elapsed < p.delay) {
        done = false;
        continue;
      }
      const raw = final ? 1 : clamp((elapsed - p.delay) / p.duration, 0, 1);
      if (!final && raw < 1) done = false;
      const eased = 1 - (1 - raw) ** 3;
      const sway = final ? 0 : Math.sin(Math.PI * raw);
      const rect = rects[p.logo];
      const ratio = ratios[p.logo];
      const contentW = Math.min(rect.w, rect.h * ratio);
      const contentH = contentW / ratio;
      const ox = (p.nx - 0.5) * contentW;
      const oy = (p.ny - 0.5) * contentH;
      const angle = angles[p.logo];
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const tx = rect.cx + ox * cos - oy * sin;
      const ty = rect.cy + ox * sin + oy * cos;
      const x = originX + (tx - originX) * eased + sway * p.curve;
      const y = originY + (ty - originY) * eased + sway * p.arc;
      const alpha = p.alpha * (final ? 1 : clamp(raw * 2.2, 0, 1));
      if (alpha < 0.03) continue;
      const index = Math.min(BUCKETS - 1, Math.max(0, Math.round(alpha * (BUCKETS - 1))));
      buckets[index].push(x, y, p.size);
      dots.push([x, y]);
    }
    lastDots = dots;

    ctx.globalCompositeOperation = 'lighter';
    ctx.clearRect(0, 0, width, height);

    // A soft halo under every dot: the marks read as light rather than ink, and
    // overlapping particles bloom where the three logos cross.
    ctx.fillStyle = 'rgba(245, 245, 245, .03)';
    ctx.beginPath();
    for (const bucket of buckets) {
      for (let j = 0; j < bucket.length; j += 3) {
        const radius = bucket[j + 2] * 2.8;
        const cx = bucket[j];
        const cy = bucket[j + 1];
        ctx.moveTo(cx + radius, cy);
        ctx.arc(cx, cy, radius, 0, TAU);
      }
    }
    ctx.fill();

    // The dots themselves, grouped by brightness.
    ctx.fillStyle = '#f5f5f5';
    for (let i = 0; i < BUCKETS; i++) {
      const bucket = buckets[i];
      if (!bucket.length) continue;
      ctx.globalAlpha = (i + 1) / BUCKETS;
      ctx.beginPath();
      for (let j = 0; j < bucket.length; j += 3) {
        const radius = bucket[j + 2];
        const cx = bucket[j];
        const cy = bucket[j + 1];
        ctx.moveTo(cx + radius, cy);
        ctx.arc(cx, cy, radius, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return done;
  }

  function animate() {
    if (paint(false)) {
      settle();
      return;
    }
    frame = requestAnimationFrame(animate);
  }

  function drawSettled() {
    if (!settled) return;
    const box = section.getBoundingClientRect();
    if (box.bottom < -80 || box.top > height + 80) {
      ctx.clearRect(0, 0, width, height);
      return;
    }
    paint(true);
  }

  function queueSettled() {
    if (!settled || settleFrame) return;
    settleFrame = requestAnimationFrame(() => {
      settleFrame = 0;
      drawSettled();
    });
  }

  function trigger() {
    if (started || reduced.matches) return;
    started = true;
    resize();
    if (!build()) {
      fallback();
      return;
    }
    const hero = document.querySelector('.hero-stage');
    const heroRect = hero ? hero.getBoundingClientRect() : null;
    const hasHero = heroRect && heroRect.width > 0;
    const bar = document.querySelector('.banner-logo') || document.querySelector('.banner-title');
    const barRect = bar ? bar.getBoundingClientRect() : null;
    const hasBar = barRect && barRect.width > 0;
    originX = hasHero ? heroRect.left + heroRect.width / 2 : hasBar ? barRect.left + barRect.width / 2 : width / 2;
    originY = hasHero ? heroRect.top + heroRect.height / 2 : hasBar ? Math.max(barRect.bottom + 6, 84) : 84;
    section.classList.remove('is-formed');
    section.classList.add('is-animating');
    startTime = performance.now();
    frame = requestAnimationFrame(animate);
  }

  function startMarks() {
    trigger();
  }

  // The shape stage reuses these exact screen positions as its starting dots.
  window.rtmStackDots = () => lastDots;

  if (reduced.matches) {
    fallback();
  } else {
    // Hide the real SVGs while the particles assemble the marks; they stay as
    // particles after settling, so is-animating is never removed on this path.
    section.classList.add('is-animating');
    window.addEventListener('scroll', queueSettled, { passive: true });
    window.addEventListener('resize', () => {
      if (started) resize();
      if (settled) drawSettled();
    });
    reduced.addEventListener('change', () => {
      if (reduced.matches) fallback();
    });
    const triggerEl = section.querySelector('.stack-art') || section;
    if ('IntersectionObserver' in window) {
      // A short landscape viewport may not fit the whole mark group; relax the
      // threshold there so the animation can still start.
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        startMarks();
      }, { threshold: 0.01 });
      observer.observe(triggerEl);
    } else {
      startMarks();
    }
  }
})();




