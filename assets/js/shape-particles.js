// The stage between the opening and the stack. The bar logo's particles are
// scrubbed by the scroll wheel: as the stage comes in, they stream down into a
// large wireframe torus, a ring of dust and seven smaller solids/figures placed
// at random. The scroll drives the formation, the turn, the mesh and the orbit, so
// the stage is perfectly still whenever the wheel is.
(() => {
  const section = document.querySelector('.shape-section');
  if (!section) return;
  const stage = section.querySelector('.shape-stage');
  const canvas = stage.querySelector('.shape-particles');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const BUCKETS = 7;
  const DUST = 180;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);

  let width = 0;
  let height = 0;
  let dpr = 1;
  let scrollFrame = 0;

  const line = (a, b, n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i / n;
      out.push([
        a[0] + (b[0] - a[0]) * k,
        a[1] + (b[1] - a[1]) * k,
        a[2] + (b[2] - a[2]) * k,
      ]);
    }
    return out;
  };

  function cube() {
    const v = [
      [-.5, -.5, -.5], [.5, -.5, -.5], [.5, .5, -.5], [-.5, .5, -.5],
      [-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5],
    ];
    const e = [
      [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const points = [];
    for (const [a, b] of e) points.push(...line(v[a], v[b], 22));
    return points;
  }

  function pyramid() {
    const v = [
      [-.48, .4, -.48], [.48, .4, -.48], [.48, .4, .48], [-.48, .4, .48],
      [0, -.46, 0],
    ];
    const e = [
      [0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 4], [2, 4], [3, 4],
    ];
    const points = [];
    for (const [a, b] of e) points.push(...line(v[a], v[b], 24));
    return points;
  }

  function octahedron() {
    const v = [
      [0, -.5, 0], [.5, 0, 0], [0, 0, .5], [-.5, 0, 0], [0, 0, -.5], [0, .5, 0],
    ];
    const e = [
      [0, 1], [0, 2], [0, 3], [0, 4], [5, 1], [5, 2], [5, 3], [5, 4],
      [1, 2], [2, 3], [3, 4], [4, 1],
    ];
    const points = [];
    for (const [a, b] of e) points.push(...line(v[a], v[b], 20));
    return points;
  }

  function sphere() {
    const points = [];
    for (let i = 0; i < 7; i++) {
      const lat = -Math.PI / 2 + Math.PI * (i + .5) / 7;
      const r = Math.cos(lat) * .5;
      const y = Math.sin(lat) * .5;
      for (let j = 0; j < 32; j++) {
        const a = TAU * j / 32;
        points.push([Math.cos(a) * r, y, Math.sin(a) * r]);
      }
    }
    for (let i = 0; i < 8; i++) {
      const lon = Math.PI * i / 8;
      for (let j = 0; j < 18; j++) {
        const lat = -Math.PI / 2 + Math.PI * j / 18;
        const r = Math.cos(lat) * .5;
        const y = Math.sin(lat) * .5;
        points.push([Math.cos(lon) * r, y, Math.sin(lon) * r]);
      }
    }
    return points;
  }

  function torus() {
    const points = [];
    const R = .38;
    const r = .14;
    const ring = (radius, y, count) => {
      for (let i = 0; i < count; i++) {
        const a = TAU * i / count;
        points.push([Math.cos(a) * radius, y, Math.sin(a) * radius]);
      }
    };
    ring(R + r, 0, 44);
    ring(R - r, 0, 44);
    ring(R, r, 44);
    ring(R, -r, 44);
    for (let k = 0; k < 10; k++) {
      const u = TAU * k / 10;
      const cu = Math.cos(u);
      const su = Math.sin(u);
      for (let i = 0; i < 20; i++) {
        const v = TAU * i / 20;
        const rr = R + r * Math.cos(v);
        points.push([cu * rr, r * Math.sin(v), su * rr]);
      }
    }
    return points;
  }

  function circle() {
    const points = [];
    for (let i = 0; i < 160; i++) {
      const a = TAU * i / 160;
      points.push([Math.cos(a) * .44, Math.sin(a) * .44, 0]);
    }
    return points;
  }

  function triangle() {
    const v = [[0, -.46, 0], [.44, .36, 0], [-.44, .36, 0]];
    const points = [];
    for (let i = 0; i < 3; i++) points.push(...line(v[i], v[(i + 1) % 3], 46));
    return points;
  }

  function hexagon() {
    const points = [];
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = TAU * i / 6 - Math.PI / 2;
      v.push([Math.cos(a) * .46, Math.sin(a) * .46, 0]);
    }
    for (let i = 0; i < 6; i++) points.push(...line(v[i], v[(i + 1) % 6], 26));
    return points;
  }

  const FACTORIES = { cube, pyramid, octahedron, sphere, torus, circle, triangle, hexagon };
  const baseCache = new Map();

  function resample(points, count) {
    const n = points.length;
    const out = [];
    for (let i = 0; i < count; i++) {
      const pos = (i / count) * n;
      const i0 = Math.floor(pos) % n;
      const i1 = (i0 + 1) % n;
      const f = pos - Math.floor(pos);
      out.push([
        points[i0][0] + (points[i1][0] - points[i0][0]) * f,
        points[i0][1] + (points[i1][1] - points[i0][1]) * f,
        points[i0][2] + (points[i1][2] - points[i0][2]) * f,
      ]);
    }
    return out;
  }

  function basePoints(type, count) {
    const key = type + ':' + count;
    if (!baseCache.has(key)) baseCache.set(key, resample(FACTORIES[type](), count));
    return baseCache.get(key);
  }

  const SPEC = [
    ['torus', 3, true, 1100],
    ['cube', 3, false, 426],
    ['sphere', 3, false, 426],
    ['pyramid', 3, false, 426],
    ['octahedron', 3, false, 426],
    ['circle', 2, false, 426],
    ['triangle', 2, false, 426],
    ['hexagon', 2, false, 426],
  ];

  const slots = SPEC.map(([type, dim, big, count]) => ({
    type,
    dim,
    big,
    count,
    phase: random(0, TAU),
    spin: random(big ? .12 : .2, big ? .2 : .46) * (Math.random() < .5 ? -1 : 1),
    tilt: dim === 3 ? random(big ? .34 : .32, big ? .5 : .62) : 0,
    cx: 0,
    cy: 0,
    scale: 100,
    props: Array.from({ length: count }, () => {
      const star = Math.random() < .018;
      return {
        alpha: star ? 1 : random(.34, .94),
        size: star ? random(1.7, 2.2) : random(.55, 1.2),
        tw: random(0, TAU),
        delay: random(0, .55),
        dur: random(.9, 1.25),
        curve: random(-22, 22),
        arc: random(8, 48),
      };
    }),
  }));

  const dust = Array.from({ length: DUST }, () => ({
    phase: random(0, TAU),
    speed: random(.08, .22) * (Math.random() < .5 ? -1 : 1),
    rf: random(.82, 1.05),
    h: random(-.16, .16),
    size: random(.5, 1.1),
    alpha: random(.22, .76),
    tw: random(0, TAU),
  }));

  function layout() {
    const narrow = width < 700;
    const top = narrow ? 126 : 150;
    const bottom = height - (narrow ? 48 : 70);
    const left = narrow ? 24 : Math.max(56, width * .055);
    const right = width - left;
    const placed = [];
    const bigScale = narrow ? random(168, 210) : random(350, 470);
    const smallScale = narrow ? [48, 92] : [78, 162];

    slots.forEach((slot, i) => {
      let ok = false;
      for (let tries = 0; tries < 240 && !ok; tries++) {
        const scale = slot.big ? bigScale : random(smallScale[0], smallScale[1]);
        const mx = slot.big ? 1.06 * scale : .6 * scale;
        const my = slot.big ? .62 * scale : .6 * scale;
        const x = random(left + mx, right - mx);
        const y = random(top + my, bottom - my);
        const slack = tries < 160 ? (narrow ? 12 : 24) : 3;
        if (placed.every(other => {
          const reach = (scale + other.scale) * .6 + slack;
          return Math.hypot(x - other.cx, y - other.cy) > reach;
        })) {
          slot.cx = x;
          slot.cy = y;
          slot.scale = scale;
          placed.push(slot);
          ok = true;
        }
      }
      if (!ok) {
        const cols = narrow ? 2 : 3;
        const rows = Math.ceil(SPEC.length / cols);
        const c = i % cols;
        const r = Math.floor(i / cols);
        const cw = (right - left) / cols;
        const ch = (bottom - top) / rows;
        slot.cx = left + cw * (c + .5);
        slot.cy = top + ch * (r + .5);
        slot.scale = slot.big ? Math.min(cw, ch) * .8 : Math.min(cw, ch) * .4;
        placed.push(slot);
      }
    });
  }

  function resize() {
    width = stage.clientWidth || window.innerWidth;
    height = stage.clientHeight || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layout();
    draw();
  }

  // The stage follows the stack; the scrub starts when its top enters the
  // viewport and ends at the bottom of the page.
  function progress() {
    const top = section.getBoundingClientRect().top + window.scrollY;
    return clamp((window.scrollY - (top - window.innerHeight)) / Math.max(1, section.offsetHeight), 0, 1);
  }

  function draw() {
    const isReduced = reduced.matches;
    const p = isReduced ? 1 : progress();
    const stageRect = stage.getBoundingClientRect();
    if (!isReduced && (stageRect.bottom < -120 || stageRect.top > height + 120)) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    const stackDots = window.rtmStackDots ? window.rtmStackDots() : [];
    const stackEl = document.querySelector('.stack-section');
    const stageVisible = stageRect.top < height && stageRect.bottom > 0;
    if (stackEl) stackEl.classList.toggle('is-handing-off', !isReduced && stageVisible && p > .03);

    const hero = document.querySelector('.hero-stage');
    const heroRect = hero ? hero.getBoundingClientRect() : null;
    const hasHero = heroRect && heroRect.width > 0;
    const bar = document.querySelector('.banner-logo') || document.querySelector('.banner-title');
    const barRect = bar ? bar.getBoundingClientRect() : null;
    const hasBar = barRect && barRect.width > 0;
    const originX = hasHero
      ? heroRect.left + heroRect.width / 2
      : hasBar ? barRect.left + barRect.width / 2 : width / 2;
    const originY = hasHero
      ? heroRect.top + heroRect.height / 2
      : hasBar ? Math.max(barRect.bottom + 6, 84) : 84;
    let dotIndex = 0;
    for (const bucket of buckets) bucket.length = 0;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath();

    for (const slot of slots) {
      const base = basePoints(slot.type, slot.count);
      const cx = slot.cx + 4 * Math.sin(p * TAU + slot.phase * 1.4);
      const cy = slot.cy + 4 * Math.cos(p * TAU * .8 + slot.phase);
      const scale = slot.scale;
      const ay = slot.phase + p * slot.spin * 9;
      const ca = Math.cos(ay);
      const sa = Math.sin(ay);
      const ax = slot.dim === 3 ? slot.tilt + .12 * Math.sin(p * TAU + slot.phase) : 0;
      const cxr = Math.cos(ax);
      const sxr = Math.sin(ax);
      const limit = scale * .14 + 6;
      let prevX = 0;
      let prevY = 0;
      let hasPrev = false;

      for (let i = 0; i < slot.count; i++) {
        const prop = slot.props[i];
        const a = base[i];
        let x1;
        let y1;
        let depth = 1;
        if (slot.dim === 3) {
          const x0 = a[0] * ca + a[2] * sa;
          const z0 = -a[0] * sa + a[2] * ca;
          x1 = x0;
          y1 = a[1] * cxr - z0 * sxr;
          const z1 = a[1] * sxr + z0 * cxr;
          const persp = 1 / (1 - z1 * .28);
          x1 *= persp;
          y1 *= persp;
          depth = (z1 + 1) / 2;
        } else {
          x1 = a[0] * ca - a[1] * sa;
          y1 = a[0] * sa + a[1] * ca;
        }
        let tx = stageRect.left + cx + x1 * scale;
        let ty = stageRect.top + cy + y1 * scale;

        let x = tx;
        let y = ty;
        let alpha = prop.alpha * (slot.dim === 3 ? .4 + .6 * depth : 1);
        const raw = clamp((p - .02 - prop.delay * .2) / .1, 0, 1);
        if (raw < 1) {
          const start = stackDots.length ? stackDots[dotIndex % stackDots.length] : [originX, originY];
          const eased = 1 - (1 - raw) ** 3;
          const sway = Math.sin(Math.PI * raw);
          x = start[0] + (tx - start[0]) * eased + sway * prop.curve;
          y = start[1] + (ty - start[1]) * eased + sway * prop.arc;
          alpha *= clamp(raw * 2.4, 0, 1);
        }
        dotIndex++;
        alpha *= .82 + .18 * Math.sin(p * 9 + prop.tw);
        if (alpha < .03) {
          hasPrev = false;
          continue;
        }
        if (hasPrev) {
          const dx = x - prevX;
          const dy = y - prevY;
          if (dx * dx + dy * dy < limit * limit) {
            ctx.moveTo(prevX, prevY);
            ctx.lineTo(x, y);
          }
        }
        prevX = x;
        prevY = y;
        hasPrev = true;
        const size = prop.size * (slot.dim === 3 ? .75 + .5 * depth : 1);
        const index = Math.min(BUCKETS - 1, Math.max(0, Math.round(alpha * (BUCKETS - 1))));
        buckets[index].push(x, y, size);
      }
    }

    const big = slots[0];
    const bigX = stageRect.left + big.cx + 4 * Math.sin(p * TAU + big.phase * 1.4);
    const bigY = stageRect.top + big.cy + 4 * Math.cos(p * TAU * .8 + big.phase);
    const dustFade = isReduced ? 1 : clamp((p - .18) / .2, 0, 1);
    for (const d of dust) {
      const a = d.phase + p * d.speed * 16;
      const r = big.scale * d.rf;
      const x = bigX + Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const y = bigY + z * .55 - d.h * r;
      const depth = (z / r + 1) / 2;
      const alpha = d.alpha * dustFade * (.35 + .65 * depth) * (.9 + .1 * Math.sin(p * 16 + d.tw));
      if (alpha < .03) continue;
      const index = Math.min(BUCKETS - 1, Math.max(0, Math.round(alpha * (BUCKETS - 1))));
      buckets[index].push(x, y, d.size * (.7 + .5 * depth));
    }

    ctx.strokeStyle = 'rgba(245, 245, 245, .06)';
    ctx.lineWidth = .7;
    ctx.stroke();

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

  function queue() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      draw();
    });
  }

  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  reduced.addEventListener('change', draw);

  resize();
  draw();
})();
