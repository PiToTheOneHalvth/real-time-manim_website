// The hero's figure is not a picture.
//
// A field of particles is thrown up out of the bottom-right corner, catches
// itself into three orbits that arrive one at a time, winds up, contracts once
// into a single core — and the core blows apart, is reeled back in as a spinning
// storm, and the M lifts out of it. Then the ring is painted on around the M in
// ring order — dot after dot, from the orbit's right-hand end — until the logo
// is assembled. Scrolling pulls the finished mark apart; scrolling back settles
// it. Everything is geometry plus two image reads, so this also runs from
// file://.
(() => {
  const canvas = document.getElementById('hero-particles');
  const hero = canvas && canvas.closest('.hero');
  const stage = hero && hero.querySelector('.hero-stage');
  if (!canvas || !hero || !stage) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const ALPHA_STEPS = 12;
  const TAU = Math.PI * 2;

  // The opening, in seconds from the moment the field starts.
  const BURST_END = 1.15;                       // arc out of the corner
  const ORBIT_START = [1.35, 1.85, 2.35];      // the three orbits, one at a time
  const ORBIT_CATCH = 1.0;                     // how long an orbit takes to gather its dots
  const SPIN_UP = [3.2, 3.5];                // a short wind-up
  const COMPRESS = [3.5, 3.8];               // one contraction, into a single core
  const BLAST = 3.8;                          // and it goes
  const FORM = [3.8, 4.5];                    // the orbits have handed over
  // After the blast the field disperses across the hero as dust, then the
  // complete logo draws itself back in, left to right.
  const REVEAL = [4.9, 6.7];

  let logoDots = [];         // the logo, sampled: { x, y, alpha }
  let particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let stageBox = { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
  let logoBox = { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0, inkX: 0.5, inkY: 0.5, inkW: 1, inkH: 1 };
  let raster = null;         // the logo image itself, for reduced motion / file://
  let points = [];           // normalized logo pixels, until the layout is known
  const ORBITS = [0, Math.PI / 3, (Math.PI * 2) / 3];
  const ORBIT_SPINS = [1, -1, 0.85];
  const ring = { radius: 200, tiltX: 1.28, spin: 1.05 };
  let scrollProgress = 0;
  let scrollEased = 0;
  let startAt = 0;
  let clock = 0;
  let frame = 0;
  let visible = true;
  let blasted = false;

  const clamp01 = value => Math.max(0, Math.min(1, value));
  const smooth = value => value * value * (3 - 2 * value);
  const segment = (value, from, to) => clamp01((value - from) / (to - from));
  const random = (min, max) => min + Math.random() * (max - min);
  const mix = (a, b, t) => a + (b - a) * t;

  // ---- the logo -------------------------------------------------------------
  // The finished mark is the brand logo itself: its pixels are sampled once into
  // dots, so the assembly lands on the real thing. The ring around it is drawn
  // from the letter's own ink box, in ring order, once the M has landed.

  function layoutLogo() {
    const ratio = (raster && raster.naturalWidth ? raster.naturalWidth / raster.naturalHeight : 1053 / 989);
    // The artwork sits inside the image with its own margins, so the box is
    // sized from the ink itself: whatever mark is supplied, it lands at the same
    // size in the stage.
    let inkW = 1;
    let inkH = 1;
    if (points.length) {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const [nx, ny] of points) {
        if (nx < minX) minX = nx;
        if (nx > maxX) maxX = nx;
        if (ny < minY) minY = ny;
        if (ny > maxY) maxY = ny;
      }
      inkW = Math.max(0.05, maxX - minX);
      inkH = Math.max(0.05, maxY - minY);
      // Centred on the ink, not on the image frame.
      logoBox.inkX = (minX + maxX) / 2;
      logoBox.inkY = (minY + maxY) / 2;
    } else {
      logoBox.inkX = 0.5;
      logoBox.inkY = 0.5;
    }
    logoBox.inkW = inkW;
    logoBox.inkH = inkH;
    const w = (stageBox.w * 1.0) / inkW;
    const h = w / ratio;
    logoBox.w = w;
    logoBox.h = h;
    logoBox.x = stageBox.cx - logoBox.inkX * w;
    logoBox.y = stageBox.cy - logoBox.inkY * h;
    logoBox.cx = stageBox.cx;
    logoBox.cy = stageBox.cy;
  }

  // A coarse occupancy grid of the sampled ink, for the coverage pass below.
  function buildInkGrid(list) {
    const cols = 180;
    const rows = 168;
    const cells = new Uint8Array(cols * rows);
    for (const [nx, ny] of list) {
      const gx = Math.min(cols - 1, Math.max(0, Math.floor(nx * cols)));
      const gy = Math.min(rows - 1, Math.max(0, Math.floor(ny * rows)));
      cells[gy * cols + gx] = 1;
    }
    return { cols, rows, cells };
  }

  // How many particles the stage gets: enough that the mark reads solid.
  function particleCount() {
    return Math.round(Math.max(1200, Math.min(7000, (stageBox.w * stageBox.h) / 55)));
  }

  function buildLogoDots(wanted) {
    const ink = buildInkGrid(points);
    // One dot per particle: the sampled pixels are thinned by a stride, so every
    // dot in the mark gets exactly one particle and the ink is evenly covered —
    // no random bare patches.
    const stride = Math.max(1, Math.round(points.length / Math.max(1, wanted)));
    const picked = [];
    for (let i = 0; i < points.length; i += stride) picked.push(points[i]);
    // Coverage pass: any cell of the ink grid that lost its dot to the stride is
    // filled from the cell centre, so the letter can never end up with a bare
    // patch in it.
    const filled = new Uint8Array(ink.cols * ink.rows);
    for (const [nx, ny] of picked) {
      const gx = Math.min(ink.cols - 1, Math.max(0, Math.floor(nx * ink.cols)));
      const gy = Math.min(ink.rows - 1, Math.max(0, Math.floor(ny * ink.rows)));
      filled[gy * ink.cols + gx] = 1;
      // Neighbours count too, so a dot does not have to sit exactly on the cell.
      if (gx > 0) filled[gy * ink.cols + gx - 1] = 1;
      if (gx < ink.cols - 1) filled[gy * ink.cols + gx + 1] = 1;
      if (gy > 0) filled[(gy - 1) * ink.cols + gx] = 1;
      if (gy < ink.rows - 1) filled[(gy + 1) * ink.cols + gx] = 1;
    }
    for (let gy = 0; gy < ink.rows; gy++) {
      for (let gx = 0; gx < ink.cols; gx++) {
        if (!ink.cells[gy * ink.cols + gx] || filled[gy * ink.cols + gx]) continue;
        picked.push([(gx + 0.5) / ink.cols, (gy + 0.5) / ink.rows, 0.85]);
      }
    }

    logoDots = picked.map(([nx, ny, luminance]) => ({
      x: logoBox.x + nx * logoBox.w,
      y: logoBox.y + ny * logoBox.h,
      alpha: 0.32 + luminance * 0.68,
    }));
    for (let i = logoDots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [logoDots[i], logoDots[j]] = [logoDots[j], logoDots[i]];
    }
  }


  function drawRaster() {
    ctx.clearRect(0, 0, width, height);
    if (raster) ctx.drawImage(raster, logoBox.x, logoBox.y, logoBox.w, logoBox.h);
  }

  function measureStage() {
    const heroBox = hero.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    stageBox = {
      x: box.left - heroBox.left,
      y: box.top - heroBox.top,
      w: box.width,
      h: box.height,
    };
    stageBox.cx = stageBox.x + stageBox.w / 2;
    stageBox.cy = stageBox.y + stageBox.h / 2;
    ring.radius = Math.min(stageBox.w, stageBox.h) * 0.46;
    layoutLogo();
  }

  // One dot set: the whole logo, sampled from the artwork, and every dot gets a
  // particle. It is drawn as one complete mark, not in pieces.
  function buildDots() {
    buildLogoDots(particleCount());
  }

  function createParticles() {
    const count = Math.min(9000, logoDots.length);
    const perOrbit = Math.ceil(count / ORBITS.length);
    // The dust is not spread evenly: it is dense where it was thrown from and
    // thins out with distance, so most dots settle around the mark and only a
    // few reach the edges of the screen.
    const reach = Math.max(width, height) * 0.62;
    particles = [];
    for (let i = 0; i < count; i++) {
      const orbit = i % ORBITS.length;
      const target = logoDots[i % Math.max(1, logoDots.length)] || { x: stageBox.cx, y: stageBox.cy, alpha: 0.8 };
      const distance = reach * Math.pow(Math.random(), 2.2);
      const angle = Math.random() * TAU;
      // The opening is a fan from a single point at the stage's lower-right
      // corner: every dot leaves that point inside a narrow cone, so the field
      // reads as thrown rather than poured.
      const fan = -2.35 + random(-0.85, 0.85);
      const speed = random(6, 22);
      particles.push({
        x: stageBox.x + stageBox.w * 0.95,
        y: stageBox.y + stageBox.h * 1.02,
        vx: Math.cos(fan) * speed,
        vy: Math.sin(fan) * speed,
        // Where this dot sits on its orbit: an even angle around the ring, a
        // fat radial band and a little depth, so each orbit is a thick line.
        orbit,
        ringAngle: (Math.floor(i / ORBITS.length) / perOrbit) * TAU + random(-0.04, 0.04),
        ringSpread: random(-1, 1) * 9,
        ringDepth: random(-1, 1) * ring.radius * 0.075,
        ringSpeed: random(0.8, 1.2),
        // The finished mark: this particle is one dot of the logo, and `sweep` is
        // where it sits across the artwork (0 left, 1 right) - the logo is
        // drawn left to right in that order.
        mx: target.x,
        my: target.y,
        sweep: clamp01((target.x - logoBox.x) / Math.max(1, logoBox.w)),
        // Where this dot settles once the blast has scattered it: close to the
        // mark for most of them, far out for the rest.
        dustX: Math.min(width, Math.max(0, stageBox.cx + Math.cos(angle) * distance)),
        dustY: Math.min(height, Math.max(0, stageBox.cy + Math.sin(angle) * distance * 0.85)),
        // Confetti: each dot flutters on its own beat while it is in the air.
        flutter: random(0.004, 0.014),
        flutterAmp: random(0.12, 0.45),
        delay: random(0, 0.12),
        k: random(0.022, 0.05),
        damping: random(0.8, 0.9),
        size: random(1.8, 3.6),
        alpha: random(0.45, 1) * (Math.random() < 0.2 ? 1 : 0.8),
        phase: Math.random() * TAU,
        speed: random(0.0004, 0.0013),
        drift: random(0.4, 1.4),
      });
    }
  }

  function resize() {
    width = hero.clientWidth;
    height = hero.clientHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function readScroll() {
    scrollProgress = clamp01(window.scrollY / Math.max(1, height));
  }

  // One point on a spinning orbit: a circle in 3D, flattened around X, then
  // turned in the plane by its own angle — three of them, 60° apart, read as the
  // atom. `shrink` squeezes the radius, `spinUp` winds the orbits faster.
  function orbitPoint(particle, seconds, spinUp, shrink) {
    const speed = ring.spin * (1 + spinUp * 1.4) * ORBIT_SPINS[particle.orbit];
    const angle = particle.ringAngle + seconds * particle.ringSpeed * speed;
    const radius = (ring.radius + particle.ringSpread) * shrink;
    const rx = Math.cos(angle) * radius;
    const ry = Math.sin(angle) * radius;
    const flat = ry * Math.cos(ring.tiltX);
    const z = ry * Math.sin(ring.tiltX) + particle.ringDepth * shrink;
    const cosO = Math.cos(ORBITS[particle.orbit]);
    const sinO = Math.sin(ORBITS[particle.orbit]);
    const x = rx * cosO - flat * sinO;
    const y = rx * sinO + flat * cosO;
    const perspective = 1 / (1 + z / 900);
    return {
      x: stageBox.cx + x * perspective,
      y: stageBox.cy + y * perspective,
      depth: clamp01(0.5 + z / (ring.radius * 1.2)),
    };
  }

  // Where a dot wants to be at this moment, in order of the story.
  const spot = [0, 0];
  function targetAt(particle, seconds, spinUp, shrink) {
    // 1. The orbits.
    if (seconds < BLAST) {
      const orbit = orbitPoint(particle, seconds, spinUp, shrink);
      spot[0] = orbit.x;
      spot[1] = orbit.y;
      return spot;
    }

    // 2. After the blast the field is dust: every dot drifts to its own resting
    //    place across the hero. Then, left to right, the dust is pulled home and
    //    the scattered field *becomes* the logo.
    if (seconds >= markReleaseAt(particle)) {
      spot[0] = particle.mx;
      spot[1] = particle.my;
      return spot;
    }
    spot[0] = particle.dustX;
    spot[1] = particle.dustY;
    return spot;
  }

  // When a dot comes back: swept by its place across the artwork, so the mark is
  // drawn left to right rather than blinking on.
  function markReleaseAt(particle) {
    return REVEAL[0] + particle.sweep * (REVEAL[1] - REVEAL[0]);
  }

  // Pull scale: dust drifts on its own; once a dot's turn comes it is pulled
  // home hard, so the scattered field visibly *becomes* the logo.
  function pullScale(particle, seconds) {
    return seconds < markReleaseAt(particle) ? 1 : 2.8;
  }

  // Alpha buckets: one globalAlpha change per step instead of one per dot, which
  // is what keeps several thousand particles cheap.
  const buckets = Array.from({ length: ALPHA_STEPS }, () => []);

  function flash(seconds) {
    const rise = segment(seconds, COMPRESS[1] - 0.16, BLAST);
    const fall = 1 - segment(seconds, BLAST, BLAST + 0.16);
    const strength = rise * fall;
    if (strength <= 0.01) return;
    const radius = ring.radius * (0.08 + 0.34 * strength);
    const gradient = ctx.createRadialGradient(stageBox.cx, stageBox.cy, 0, stageBox.cx, stageBox.cy, radius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${0.45 * strength})`);
    gradient.addColorStop(0.45, `rgba(245, 245, 245, ${0.14 * strength})`);
    gradient.addColorStop(1, 'rgba(245, 245, 245, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(stageBox.cx, stageBox.cy, radius, 0, TAU);
    ctx.fill();
  }

  function shockwave(strength, seconds, from, duration, reach) {
    const progress = segment(seconds, from, from + duration);
    if (progress <= 0 || progress >= 1) return;
    ctx.beginPath();
    ctx.arc(stageBox.cx, stageBox.cy, 20 + progress * reach, 0, TAU);
    ctx.strokeStyle = `rgba(245, 245, 245, ${strength * (1 - progress)})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function step(now) {
    // A clock that jumps (tab restored, suspended laptop) must never run the
    // physics backwards.
    const dt = Math.max(0, Math.min(2, (now - (step.last || now)) / 16.667));
    step.last = now;
    clock += dt * 16.667;
    const seconds = startAt ? (now - startAt) / 1000 : 0;

    const spinUp = smooth(segment(seconds, SPIN_UP[0], SPIN_UP[1]));
    const squeeze = smooth(segment(seconds, COMPRESS[0], COMPRESS[1]));
    const shrink = 1 - squeeze * 0.88;
    const reveal = clamp01(seconds / 0.5);
    const dusted = smooth(segment(seconds, BLAST, BLAST + 0.8));

    // One impulse at the blast: the field is flung outward, then each dot drifts
    // to its own resting place across the hero.
    if (!blasted && seconds >= BLAST) {
      blasted = true;
      for (const p of particles) {
        const angle = Math.random() * TAU;
        const power = random(4, 8);
        p.vx += Math.cos(angle) * power;
        p.vy += Math.sin(angle) * power * 0.82;
      }
    }

    // What the whole field does on scroll.
    scrollEased += (scrollProgress - scrollEased) * Math.min(1, 0.1 * dt);
    const twist = scrollEased * 0.62;
    const scale = 1 + scrollEased * scrollEased * 2.4;
    const rise = scrollEased * height * 0.22;
    const fade = 1 - scrollEased;
    const cosT = Math.cos(twist);
    const sinT = Math.sin(twist);

    for (const bucket of buckets) bucket.length = 0;
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      const caught = smooth(segment(seconds, ORBIT_START[p.orbit], ORBIT_START[p.orbit] + ORBIT_CATCH));
      const formed = smooth(segment(seconds, BLAST + p.delay, FORM[1]));
      const wobbleX = Math.sin(clock * p.speed + p.phase) * 0.9 * p.drift;
      const wobbleY = Math.cos(clock * p.speed * 1.3 + p.phase) * 0.9 * p.drift;

      const target = targetAt(p, seconds, spinUp, shrink);
      let tx = target[0];
      let ty = target[1];
      // The dust keeps breathing; a placed dot locks in.
      const breathe = seconds >= markReleaseAt(p) ? 0 : formed;
      tx += wobbleX * breathe;
      ty += wobbleY * breathe;

      if (scrollEased > 0.002) {
        const dx = (tx - stageBox.cx) * scale;
        const dy = (ty - stageBox.cy) * scale;
        tx = stageBox.cx + dx * cosT - dy * sinT;
        ty = stageBox.cy + dx * sinT + dy * cosT - rise;
      }

      if (seconds < BURST_END && caught < 0.002) {
        // Confetti in the air: gravity pulls it down, drag slows it, and each
        // dot flutters sideways on its own beat.
        p.vy += 0.16 * dt;
        p.vx += Math.sin(clock * p.flutter + p.phase) * p.flutterAmp * dt;
        p.vx *= 0.976 ** dt;
        p.vy *= 0.982 ** dt;
      }

      const pull = p.k * caught * pullScale(p, seconds);
      const damping = caught > 0.002 ? p.damping : 0.978;
      p.vx = (p.vx + (tx - p.x) * pull) * damping;
      p.vy = (p.vy + (ty - p.y) * pull) * damping;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // The orbits fade the far side of their tube; the dust settles back to a
      // faint veil so it never competes with the mark.
      const orbitWeight = caught * (1 - formed);
      let depth = 1;
      if (orbitWeight > 0.002) {
        const orbit = orbitPoint(p, seconds, spinUp, shrink);
        depth = orbit.depth;
      }
      const depthFade = 1 - orbitWeight * (1 - (0.4 + 0.6 * depth));
      const flare = 1 + squeeze * (1 - smooth(segment(seconds, BLAST, BLAST + 0.4))) * 0.3;
      // The dust is the material of the mark: it stays lit the whole way home.
      const alpha = p.alpha * reveal * fade * depthFade * flare;
      if (alpha <= 0.02) continue;
      const size = p.size * (1 + orbitWeight * (depth - 0.5) * 0.55);
      const index = Math.min(ALPHA_STEPS - 1, Math.max(0, Math.round(alpha * ALPHA_STEPS) - 1));
      buckets[index].push(p.x, p.y, size);
    }

    for (let i = 0; i < ALPHA_STEPS; i++) {
      const bucket = buckets[i];
      if (!bucket.length) continue;
      ctx.globalAlpha = (i + 1) / ALPHA_STEPS;
      ctx.fillStyle = '#f5f5f5';
      // Round dots, batched into one path per alpha step.
      ctx.beginPath();
      for (let j = 0; j < bucket.length; j += 3) {
        const radius = bucket[j + 2] * 0.5;
        const cx = bucket[j] + radius;
        const cy = bucket[j + 1] + radius;
        ctx.moveTo(cx + radius, cy);
        ctx.arc(cx, cy, radius, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    shockwave(0.22, seconds, BLAST, FORM[1] - BLAST, ring.radius * 1.8);
    flash(seconds);
  }

  function loop(now) {
    if (!visible || document.hidden) {
      frame = 0;
      return;
    }
    step(now);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (frame) return;
    step.last = 0;
    frame = requestAnimationFrame(loop);
  }

  function drawStatic() {
    // Reduced motion: the complete logo, drawn once.
    ctx.clearRect(0, 0, width, height);
    if (!logoDots.length) {
      drawRaster();
      return;
    }
    ctx.fillStyle = '#f5f5f5';
    for (const dot of logoDots) {
      ctx.globalAlpha = dot.alpha;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 1.2, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Reads the logo image into normalized points. Under file:// the canvas is
  // tainted and this throws; the caller then falls back to drawing the image.
  function sampleLogo(image) {
    const sampleWidth = 320;
    const sheet = document.createElement('canvas');
    sheet.width = sampleWidth;
    sheet.height = Math.max(1, Math.round(sampleWidth * image.naturalHeight / image.naturalWidth));
    const paint = sheet.getContext('2d', { willReadFrequently: true });
    paint.drawImage(image, 0, 0, sheet.width, sheet.height);
    const data = paint.getImageData(0, 0, sheet.width, sheet.height).data;
    const found = [];
    for (let y = 0; y < sheet.height; y++) {
      for (let x = 0; x < sheet.width; x++) {
        const offset = (y * sheet.width + x) * 4;
        const luminance = (data[offset] + data[offset + 1] + data[offset + 2]) / 765;
        if (luminance > 0.36) found.push([x / sheet.width, y / sheet.height, luminance]);
      }
    }
    return found;
  }

  function boot() {
    resize();
    measureStage();
    layoutLogo();
    raster = new Image();
    raster.decoding = 'async';

    let started = false;
    const finish = () => {
      if (started) return;
      started = true;
      layoutLogo();
      buildDots();
      if (!points.length || reducedMotion.matches) {
        drawStatic();
        return;
      }
      createParticles();
      startAt = performance.now() + 220;
      readScroll();
      start();
    };

    raster.addEventListener('load', () => {
      try {
        points = sampleLogo(raster);
      } catch {
        points = [];      // file:// taints the canvas — draw the image instead
      }
      finish();
    });
    raster.addEventListener('error', finish);
    raster.src = canvas.dataset.src;
    if (raster.complete && raster.naturalWidth) {
      try {
        points = sampleLogo(raster);
      } catch {
        points = [];
      }
      finish();
    }
  }

  // ---- boot -----------------------------------------------------------------
  boot();

  window.addEventListener('scroll', readScroll, { passive: true });
  window.addEventListener('resize', () => {
    resize();
    measureStage();
    layoutLogo();
    if (!points.length) {
      if (raster && raster.naturalWidth) drawRaster();
      return;
    }
    buildDots();
    if (reducedMotion.matches) {
      drawStatic();
      return;
    }
    if (!particles.length) return;
    particles.forEach((p, index) => {
      const target = logoDots[index % Math.max(1, logoDots.length)];
      if (target) {
        p.mx = target.x;
        p.my = target.y;
        p.sweep = clamp01((target.x - logoBox.x) / Math.max(1, logoBox.w));
      }
    });
    readScroll();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) start();
      else if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    }, { threshold: 0 }).observe(hero);
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) start();
  });
})();
