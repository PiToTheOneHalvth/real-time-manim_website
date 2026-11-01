// The export page: the stack's dots travel right and close into a monitor.
//
// The screen inside the monitor is a real DOM video slot; every other part of
// the computer — bezel, chin, neck, base, LED — is a normalized point set drawn
// on this fixed canvas. When the clip ends the monitor compresses to a single
// horizontal line, the video fades, and the line unfolds into the export
// methods, one row per wiki route. The last frame's dots are exposed as
// window.rtmExportDots() so the shape stage continues the same batch.
(() => {
  const section = document.querySelector('.export-section');
  if (!section) return;
  const canvas = section.querySelector('.export-particles');
  const monitor = section.querySelector('.export-monitor');
  const screen = section.querySelector('.export-screen');
  const video = section.querySelector('.export-video');
  const list = section.querySelector('.export-list');
  const rows = list ? [...list.querySelectorAll('.export-row')] : [];
  const stackSection = document.querySelector('.stack-section');
  if (!canvas || !monitor || !screen) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const BUCKETS = 7;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const easeOut = t => 1 - (1 - t) ** 3;
  const easeInOut = t => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

  const FORM_MS = 1750;
  const COLLAPSE_MS = 1050;
  const LINE_HOLD_MS = 260;
  const LIST_MS = 1050;
  const DEMO_MS = 5200;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let points = [];
  let particles = [];
  let seeds = [];
  let state = 'idle';        // idle → forming → screen → collapsing → line → listing → list
  let formStart = 0;
  let collapseStart = 0;
  let lineStart = 0;
  let listStart = 0;
  let frame = 0;
  let startedVideo = false;
  let demoTimer = 0;
  let videoCheck = 0;
  let simpleTimer = 0;
  let lastDots = [];
  let lastScrollY = typeof window.scrollY === 'number' ? window.scrollY : 0;
  let videoBroken = false;

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

  // A rounded-rectangle outline sampled by arc length, with independent jitter
  // per point. Everything is in units of the monitor's width; y is in the same
  // units so the geometry cannot stretch when the monitor is resized.
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
        a: alpha * random(.5, 1),
        s: size * random(.65, 1.35),
      });
    }
  }

  function dust(target, x0, y0, x1, y1, count, alpha, size) {
    for (let i = 0; i < count; i++) {
      target.push({
        x: random(x0, x1),
        y: random(y0, y1),
        a: alpha * random(.35, 1),
        s: size * random(.5, 1.4),
      });
    }
  }

  function buildPoints() {
    const pts = [];
    // The monitor body is 1 × .625 in these units (16:10).
    ring(pts, .006, .006, .994, .619, .032, .0032, .0018, .78, .95);   // outer edge
    ring(pts, .016, .016, .984, .609, .028, .0060, .0012, .48, .7);    // second pass
    ring(pts, .029, .025, .971, .556, .014, .0038, .0015, .84, .9);    // screen edge
    // The chin carries most of the surface dust; the side bezels only a little.
    dust(pts, .06, .565, .94, .613, 130, .55, .75);
    dust(pts, .009, .04, .028, .6, 54, .4, .65);
    dust(pts, .972, .04, .991, .6, 54, .4, .65);
    // Neck: a short trapezoid under the body.
    const neck = [
      [.438, .625, .562, .625],
      [.562, .625, .532, .698],
      [.532, .698, .468, .698],
      [.468, .698, .438, .625],
    ];
    for (const [x0, y0, x1, y1] of neck) {
      const len = Math.hypot(x1 - x0, y1 - y0);
      const count = Math.max(4, Math.round(len / .007));
      for (let i = 0; i < count; i++) {
        const k = (i + Math.random()) / count;
        pts.push({
          x: x0 + (x1 - x0) * k + random(-.0015, .0015),
          y: y0 + (y1 - y0) * k + random(-.0015, .0015),
          a: .62 * random(.5, 1),
          s: .8 * random(.6, 1.3),
        });
      }
    }
    dust(pts, .468, .63, .532, .694, 44, .32, .65);
    // Base: a wide rounded bar with a faint dust fill.
    ring(pts, .315, .694, .685, .724, .012, .0040, .0010, .82, .95);
    dust(pts, .325, .699, .675, .720, 64, .3, .6);
    // Power LED in the chin.
    dust(pts, .494, .573, .506, .583, 10, .95, 1.05);
    return pts;
  }

  function buildParticles() {
    points = buildPoints();
    particles = points.map(point => ({
      x: point.x,
      y: point.y,
      a: point.a,
      s: point.s,
      delay: random(0, .38),
      dur: random(.95, 1.25),
      swayX: random(-20, 20),
      swayY: random(-20, 20),
      line: 0,
      row: 0,
      rowT: 0,
      cDelay: 0,
    }));

    // Sort once by x: the line gets evenly spaced slots, and the line then
    // splits into contiguous chunks that unfold into the nine rows.
    const order = particles.map((_, i) => i).sort((a, b) => particles[a].x - particles[b].x);
    order.forEach((index, k) => {
      particles[index].line = order.length > 1 ? k / (order.length - 1) : .5;
      particles[index].cDelay = (1 - Math.abs(particles[index].x - .5) * 2) * .11;
    });
    const rowCount = Math.max(1, rows.length);
    const counts = new Array(rowCount).fill(0);
    order.forEach((index, k) => {
      const row = Math.min(rowCount - 1, Math.floor(k * rowCount / order.length));
      particles[index].row = row;
      counts[row]++;
    });
    const seen = new Array(rowCount).fill(0);
    order.forEach(index => {
      const p = particles[index];
      p.rowT = counts[p.row] > 1 ? seen[p.row] / (counts[p.row] - 1) : .5;
      seen[p.row]++;
    });
  }

  function captureSeeds() {
    const dots = window.rtmStackDots ? window.rtmStackDots() : [];
    seeds = particles.map((_, i) => {
      if (!dots.length) return [random(0, width * .34), random(height * .1, height * .9)];
      const dot = dots[i % dots.length];
      let y = dot[1];
      // A deep link can find the stack long gone; keep the batch entering from
      // the nearest edge instead of waiting far above the page.
      if (y < -height) y = -30;
      else if (y > height * 2) y = height + 30;
      return [dot[0], y];
    });
  }

  function monitorBox() {
    const rect = monitor.getBoundingClientRect();
    return { left: rect.left, top: rect.top, w: rect.width };
  }

  function lineBox() {
    const rect = screen.getBoundingClientRect();
    return {
      left: rect.left + rect.width * .02,
      right: rect.right - rect.width * .02,
      y: rect.top + rect.height * .5,
    };
  }

  function rowBox(index) {
    const rect = list.getBoundingClientRect();
    const row = rows[clamp(index, 0, rows.length - 1)];
    const top = rect.top + row.offsetTop;
    return {
      left: rect.left + 4,
      right: rect.right,
      // The row's bottom edge: the dots become the rules between methods
      // instead of crossing the description text.
      y: top + row.offsetHeight - 1,
    };
  }

  // Give every row the same starting point as the particle line, so the text
  // fans out of the line with the dots instead of appearing after them. lineY
  // is null on the no-particle path, which uses a short rise.
  function prepareRows(lineY) {
    if (!rows.length) return;
    const base = list.getBoundingClientRect();
    rows.forEach((row, i) => {
      const center = base.top + row.offsetTop + row.offsetHeight / 2;
      const rise = lineY == null ? 14 : lineY - center;
      row.style.setProperty('--rise', `${rise.toFixed(1)}px`);
      row.style.setProperty('--row-delay', `${i * 8}ms`);
    });
    // Flush the new transform into the before-change style: the transition must
    // start from the line, not from the previous list's fallback.
    void list.offsetWidth;
  }

  function paint(now) {
    if (!particles.length) return;
    if (!width || !height) resizeCanvas();
    const box = monitorBox();
    if (box.w < 2) return;
    const line = lineBox();
    const listVisible = rows.length && (state === 'listing' || state === 'line' || state === 'list');
    const rowRects = listVisible ? rows.map((_, i) => rowBox(i)) : [];
    const transitioning = state === 'forming' || state === 'collapsing' || state === 'listing';
    const rect = section.getBoundingClientRect();
    if (!transitioning && (rect.bottom < -120 || rect.top > height + 120)) {
      ctx.clearRect(0, 0, width, height);
      return;
    }

    for (const bucket of buckets) bucket.length = 0;
    lastDots = [];
    ctx.globalCompositeOperation = 'lighter';
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const tx = box.left + p.x * box.w;
      const ty = box.top + p.y * box.w;
      let x = tx;
      let y = ty;
      let alpha = p.a;

      if (state === 'forming') {
        const raw = clamp((now - formStart - p.delay * 1000) / (p.dur * 1000), 0, 1);
        if (raw <= 0) continue;
        const eased = easeOut(raw);
        const seed = seeds[i] || [0, 0];
        const sway = Math.sin(Math.PI * raw);
        x = seed[0] + (tx - seed[0]) * eased + sway * p.swayX;
        y = seed[1] + (ty - seed[1]) * eased + sway * p.swayY;
        alpha *= clamp(raw * 1.6, 0, 1);
      } else if (state === 'collapsing') {
        const raw = clamp((now - collapseStart - p.cDelay * 1000) / 620, 0, 1);
        const eased = easeInOut(raw);
        const ex = line.left + p.line * (line.right - line.left);
        x = tx + (ex - tx) * eased;
        y = ty + (line.y - ty) * eased;
        alpha *= .94;
      } else if (state === 'listing') {
        const raw = clamp((now - listStart - p.delay * 220) / 700, 0, 1);
        const eased = easeOut(raw);
        const sx = line.left + p.line * (line.right - line.left);
        const target = rowRects[p.row];
        if (!target) continue;
        const ex = target.left + p.rowT * (target.right - target.left);
        x = sx + (ex - sx) * eased;
        y = line.y + (target.y - line.y) * eased;
        alpha *= clamp(raw * 2, 0, 1);
      } else if (state === 'line') {
        x = line.left + p.line * (line.right - line.left);
        y = line.y;
      } else if (state === 'list') {
        const target = rowRects[p.row];
        if (!target) continue;
        x = target.left + p.rowT * (target.right - target.left);
        y = target.y;
      }

      if (alpha < .03) continue;
      const index = Math.min(BUCKETS - 1, Math.max(0, Math.round(alpha * (BUCKETS - 1))));
      buckets[index].push(x, y, p.s);
      lastDots.push([x, y]);
    }

    // A soft halo under every dot, then the dots themselves grouped by
    // brightness — the same treatment as the stack and shape stages.
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
    if (state === 'forming' && now - formStart >= FORM_MS) {
      state = 'screen';
      section.classList.add('is-screen');
      startVideo();
    } else if (state === 'collapsing' && now - collapseStart >= COLLAPSE_MS) {
      state = 'line';
      lineStart = now;
    } else if (state === 'line' && now - lineStart >= LINE_HOLD_MS) {
      state = 'listing';
      listStart = now;
      prepareRows(lineBox().y);
      section.classList.add('is-listing');
    } else if (state === 'listing' && now - listStart >= LIST_MS) {
      state = 'list';
      section.classList.add('is-list');
    }
    paint(now);
    if (state === 'forming' || state === 'collapsing' || state === 'listing' || state === 'line') {
      frame = requestAnimationFrame(tick);
    }
  }

  function queue() {
    if (frame) return;
    if (state === 'idle') {
      // Idle has no particles on the canvas; the monitor is either hidden or
      // shown by the simple/no-motion path.
      return;
    }
    frame = requestAnimationFrame(tick);
  }

  function startVideo() {
    if (startedVideo || state !== 'screen') return;
    const rect = monitor.getBoundingClientRect();
    if (rect.top > height || rect.bottom < 0) return;
    startedVideo = true;
    if (video && !videoBroken) {
      video.muted = true;
      const played = video.play();
      if (played && played.catch) {
        played.catch(() => {
          videoBroken = true;
          section.classList.remove('is-playing');
          scheduleDemo();
        });
      }
      // A missing file or a blocked autoplay can leave play() pending; if no
      // frame is on screen after a generous wait, run the demo collapse
      // instead. A later `playing` cancels this fallback, so a slow start
      // cannot collapse a clip that is actually playing.
      clearTimeout(videoCheck);
      videoCheck = setTimeout(() => {
        if (state === 'screen' && !section.classList.contains('is-playing')) {
          videoBroken = true;
          scheduleDemo();
        }
      }, 3500);
    } else {
      scheduleDemo();
    }
  }

  function scheduleDemo() {
    if (demoTimer) return;
    demoTimer = setTimeout(() => {
      demoTimer = 0;
      finish();
    }, DEMO_MS);
  }

  function finish() {
    if (state !== 'screen') return;
    clearTimeout(demoTimer);
    clearTimeout(videoCheck);
    demoTimer = 0;
    videoCheck = 0;
    if (video) video.pause();
    section.classList.remove('is-playing');
    if (video && !videoBroken && video.currentTime > 0) section.classList.add('has-played');
    section.classList.add('is-collapsing');
    if (reduced.matches) {
      state = 'collapsing';
      clearTimeout(simpleTimer);
      simpleTimer = setTimeout(() => {
        simpleTimer = 0;
        state = 'list';
        prepareRows(null);
        section.classList.add('is-listing', 'is-list');
      }, 420);
      return;
    }
    if (!particles.length) buildParticles();
    state = 'collapsing';
    collapseStart = performance.now();
    queue();
  }

  function form() {
    if (state !== 'idle') return;
    if (reduced.matches) return;
    if (!particles.length) buildParticles();
    captureSeeds();
    state = 'forming';
    formStart = performance.now();
    startedVideo = false;
    section.classList.remove('is-collapsing', 'is-listing', 'is-list', 'is-screen', 'is-playing');
    section.classList.add('is-active');
    if (stackSection) stackSection.classList.add('is-exporting');
    queue();
  }

  function reset() {
    clearTimeout(demoTimer);
    clearTimeout(videoCheck);
    clearTimeout(simpleTimer);
    demoTimer = 0;
    videoCheck = 0;
    simpleTimer = 0;
    if (video) {
      video.pause();
      try { video.currentTime = 0; } catch { /* not seekable yet */ }
    }
    state = 'idle';
    startedVideo = false;
    section.classList.remove('is-active', 'is-collapsing', 'is-listing', 'is-list', 'is-screen', 'is-playing', 'is-handing-off', 'has-played');
    if (stackSection) stackSection.classList.remove('is-exporting');
    ctx.clearRect(0, 0, width, height);
  }

  function onScroll() {
    const rect = section.getBoundingClientRect();
    const up = window.scrollY < lastScrollY - 2;
    if (state !== 'idle' && up && rect.top > height * .72) reset();
    if (!reduced.matches && state === 'idle' && rect.top < height * .7 && rect.bottom > -80) {
      form();
    }
    if (state === 'screen') startVideo();
    if (state !== 'idle') queue();
    lastScrollY = window.scrollY;
  }

  if (video) {
    // The poster/first frame is enough to retire the dashed slot as soon as
    // the clip has metadata; the monitor should never show the old placeholder
    // while the particle TV is forming.
    const markVideoReady = () => {
      if (videoBroken) return;
      section.classList.add('video-ready');
    };
    if (video.readyState >= 1) markVideoReady();
    video.addEventListener('loadedmetadata', markVideoReady);
    video.addEventListener('canplay', markVideoReady);
    video.addEventListener('ended', finish);
    video.addEventListener('playing', () => {
      clearTimeout(videoCheck);
      clearTimeout(demoTimer);
      videoCheck = 0;
      demoTimer = 0;
      videoBroken = false;
      section.classList.add('video-ready');
      if (state === 'screen') {
        section.classList.add('is-playing', 'has-played');
      }
    });
    video.addEventListener('error', () => {
      videoBroken = true;
      section.classList.remove('is-playing', 'has-played', 'video-ready');
      if (state === 'screen') scheduleDemo();
    });
  }

  // Reduced motion reads the content, not the effect: the monitor/video are out
  // of the way and the methods are already listed.
  if (reduced.matches) {
    state = 'list';
    section.classList.add('is-listing', 'is-list');
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    if (reduced.matches) return;
    resizeCanvas();
    if (particles.length && state !== 'idle') paint(performance.now());
  }, { passive: true });
  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      reset();
      state = 'list';
      section.classList.add('is-listing', 'is-list');
    } else {
      reset();
    }
  });

  // The shape stage starts from exactly these dots.
  window.rtmExportDots = () => lastDots;
  window.rtmExportFinish = finish;

  resizeCanvas();
  onScroll();
})();
