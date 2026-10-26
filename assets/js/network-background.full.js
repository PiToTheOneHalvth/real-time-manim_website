// The page's background is a network, not a flat black field.
//
// A sparse set of points drifts across a fixed canvas behind every section; any
// two points closer than the link distance are joined by a hairline whose alpha
// falls off with distance. The cursor draws its own links to the points around
// it. The canvas never takes pointer events, pauses when the tab is hidden, and
// draws one still frame under prefers-reduced-motion.
(() => {
  const canvas = document.getElementById('network-background');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const INK = '245, 245, 245';
  const LINK_STEPS = 6;          // alpha buckets, so one stroke style per group
  const LINK_REACH = 190;        // the cursor's own connection radius, CSS px
  let width = 0;
  let height = 0;
  let dpr = 1;
  let dots = [];
  let frame = 0;
  let last = 0;
  let sweep = 0;             // eased; driven by the banner transition
  let sweepTarget = 0;
  const pointer = { x: 0, y: 0, active: false };
  const buckets = Array.from({ length: LINK_STEPS }, () => []);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const smooth = value => value * value * (3 - 2 * value);

  // Density is per area, so a phone gets a handful of points and a 4K screen
  // still reads as a field rather than a swarm.
  function dotCount() {
    return Math.round(clamp((width * height) / 15000, 36, 132));
  }

  // The same link distance everywhere would be a mesh on a phone and a sparse
  // scatter on a wide screen; tie it to the short edge.
  function linkDistance() {
    return clamp(Math.min(width, height) * 0.2, 96, 168);
  }

  function makeDot(x, y) {
    const angle = random(0, TAU);
    const depth = random(0.35, 1);
    const speed = random(0.05, 0.16) * (0.5 + depth);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 0.6 + depth * 1.2,
      alpha: 0.2 + depth * 0.42,
      pulse: random(0.0004, 0.0011),
      phase: random(0, TAU),
      band: Math.random(),
    };
  }

  function seed() {
    dots = [];
    const count = dotCount();
    for (let i = 0; i < count; i++) dots.push(makeDot(random(0, width), random(0, height)));
  }

  function resize() {
    const previousWidth = width || 1;
    const previousHeight = height || 1;
    width = window.innerWidth;
    height = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (!dots.length) {
      seed();
    } else {
      // Keep the field through a resize (a phone's URL bar counts as one) and
      // only grow or shrink it: re-seeding would make the whole network jump.
      for (const dot of dots) {
        dot.x *= width / previousWidth;
        dot.y *= height / previousHeight;
      }
      const wanted = dotCount();
      while (dots.length < wanted) dots.push(makeDot(random(0, width), random(0, height)));
      dots.length = Math.min(dots.length, wanted);
    }

    if (reducedMotion.matches) drawStatic();
    else draw(performance.now());
  }

  function drawLinks(link, alphaScale = 1) {
    for (const bucket of buckets) bucket.length = 0;
    const link2 = link * link;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b = dots[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance2 = dx * dx + dy * dy;
        if (distance2 > link2) continue;
        const strength = 1 - Math.sqrt(distance2) / link;
        const index = Math.min(LINK_STEPS - 1, Math.floor(strength * LINK_STEPS));
        buckets[index].push(a.x, a.y, b.x, b.y);
      }
    }
    ctx.lineWidth = 1;
    for (let i = 0; i < LINK_STEPS; i++) {
      const bucket = buckets[i];
      if (!bucket.length) continue;
      ctx.strokeStyle = `rgba(${INK}, ${(0.04 + (i / (LINK_STEPS - 1)) * 0.14) * alphaScale})`;
      ctx.beginPath();
      for (let j = 0; j < bucket.length; j += 4) {
        ctx.moveTo(bucket[j], bucket[j + 1]);
        ctx.lineTo(bucket[j + 2], bucket[j + 3]);
      }
      ctx.stroke();
    }
  }

  function drawPointerLinks() {
    if (!pointer.active) return;
    ctx.lineWidth = 1;
    for (const dot of dots) {
      const dx = dot.x - pointer.x;
      const dy = dot.y - pointer.y;
      const distance = Math.hypot(dx, dy);
      if (distance > LINK_REACH) continue;
      const strength = 1 - distance / LINK_REACH;
      ctx.strokeStyle = `rgba(${INK}, ${strength * 0.26})`;
      ctx.beginPath();
      ctx.moveTo(pointer.x, pointer.y);
      ctx.lineTo(dot.x, dot.y);
      ctx.stroke();
    }
  }

  function drawDots(now, alphaScale = 1) {
    for (const dot of dots) {
      const twinkle = 0.78 + 0.22 * Math.sin(now * dot.pulse + dot.phase);
      ctx.fillStyle = `rgba(${INK}, ${dot.alpha * twinkle * alphaScale})`;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.radius, 0, TAU);
      ctx.fill();
    }
  }

  // The banner transition: the field pours into a wide band along the very top
  // and streams across it from right to left, ahead of the bar's own
  // right-to-left wipe. `phase` comes from the page's scroll progress. The band
  // is four copies of every field point, so the stream is dense enough to read
  // as a curtain rather than a dotted line.
  function drawSweep(now, phase) {
    const COPIES = 4;
    const gather = smooth(clamp(phase / 0.12, 0, 1));
    const travel = clamp((phase - 0.12) / 0.74, 0, 1);
    const spread = width + 640;
    const offset = (width + 320) - travel * (width * 2 + 640);
    const bandAlpha = smooth(clamp(phase / 0.06, 0, 1)) *
      (1 - smooth(clamp((phase - 0.86) / 0.1, 0, 1)));
    const fieldAlpha = smooth(clamp((phase - 0.9) / 0.1, 0, 1));
    const total = Math.max(1, dots.length * COPIES);
    const points = [];

    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      for (let copy = 0; copy < COPIES; copy++) {
        const slot = i * COPIES + copy;
        // A shallow wave keeps the band from reading as a ruler.
        const wave = Math.sin(slot * 0.55 + now * 0.0014) * 3;
        const bandX = -320 + ((slot + 0.5) / total) * spread + offset;
        const bandY = clamp(8 + dot.band * 56 + (copy - 1.5) * 7 + wave, 2, 72);
        points.push(dot.x + (bandX - dot.x) * gather, dot.y + (bandY - dot.y) * gather);
      }
    }

    if (bandAlpha > 0.004) {
      // Trails run to the right of each point: the direction of travel.
      ctx.strokeStyle = `rgba(${INK}, ${0.05 * bandAlpha})`;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        ctx.moveTo(points[i] + 14, points[i + 1]);
        ctx.lineTo(points[i], points[i + 1]);
      }
      ctx.stroke();

      // Only immediate neighbours are joined, and very faintly: at three
      // copies per point a full 64px mesh would read as a hard lattice.
      const streamLink = 20;
      const streamLink2 = streamLink * streamLink;
      for (const bucket of buckets) bucket.length = 0;
      for (let i = 0; i < points.length; i += 2) {
        for (let j = i + 2; j < points.length; j += 2) {
          const dx = points[i] - points[j];
          const dy = points[i + 1] - points[j + 1];
          const distance2 = dx * dx + dy * dy;
          if (distance2 > streamLink2) continue;
          const strength = 1 - Math.sqrt(distance2) / streamLink;
          const index = Math.min(LINK_STEPS - 1, Math.floor(strength * LINK_STEPS));
          buckets[index].push(points[i], points[i + 1], points[j], points[j + 1]);
        }
      }
      for (let i = 0; i < LINK_STEPS; i++) {
        const bucket = buckets[i];
        if (!bucket.length) continue;
        ctx.strokeStyle = `rgba(${INK}, ${(0.02 + (i / (LINK_STEPS - 1)) * 0.07) * bandAlpha})`;
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        for (let j = 0; j < bucket.length; j += 4) {
          ctx.moveTo(bucket[j], bucket[j + 1]);
          ctx.lineTo(bucket[j + 2], bucket[j + 3]);
        }
        ctx.stroke();
      }

      for (let i = 0; i < points.length; i += 2) {
        const dot = dots[Math.floor(i / (2 * COPIES))];
        const twinkle = 0.82 + 0.18 * Math.sin(now * dot.pulse + dot.phase);
        ctx.fillStyle = `rgba(${INK}, ${clamp(dot.alpha * 1.3, 0, 0.95) * twinkle * bandAlpha})`;
        ctx.beginPath();
        ctx.arc(points[i], points[i + 1], dot.radius * 1.05, 0, TAU);
        ctx.fill();
      }
    }

    if (fieldAlpha > 0) {
      drawLinks(linkDistance(), fieldAlpha);
      drawDots(now, fieldAlpha);
    }
  }

  function draw(now) {
    // A clock that jumps (tab restored, suspended laptop) must not fling the
    // points across the screen.
    const dt = clamp((now - (last || now)) / 16.667, 0, 2.5);
    last = now;

    for (const dot of dots) {
      dot.x += dot.vx * dt;
      dot.y += dot.vy * dt;
      if (dot.x < 0) {
        dot.x = 0;
        dot.vx = Math.abs(dot.vx);
      } else if (dot.x > width) {
        dot.x = width;
        dot.vx = -Math.abs(dot.vx);
      }
      if (dot.y < 0) {
        dot.y = 0;
        dot.vy = Math.abs(dot.vy);
      } else if (dot.y > height) {
        dot.y = height;
        dot.vy = -Math.abs(dot.vy);
      }
    }

    ctx.clearRect(0, 0, width, height);
    sweep += (sweepTarget - sweep) * 0.24;
    if (!reducedMotion.matches && sweep > 0.002 && sweep < 0.995) {
      drawSweep(now, sweep);
    } else {
      drawLinks(linkDistance());
      drawPointerLinks();
      drawDots(now);
    }
  }

  function drawStatic() {
    ctx.clearRect(0, 0, width, height);
    const link = linkDistance();
    ctx.lineWidth = 1;
    for (let i = 0; i < dots.length; i++) {
      const a = dots[i];
      for (let j = i + 1; j < dots.length; j++) {
        const b = dots[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance > link) continue;
        ctx.strokeStyle = `rgba(${INK}, ${(1 - distance / link) * 0.14})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
    for (const dot of dots) {
      ctx.fillStyle = `rgba(${INK}, ${dot.alpha})`;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.radius, 0, TAU);
      ctx.fill();
    }
  }

  function loop(now) {
    if (document.hidden) {
      frame = 0;
      return;
    }
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function start() {
    if (frame || reducedMotion.matches) return;
    last = 0;
    frame = requestAnimationFrame(loop);
  }

  function stop() {
    if (!frame) return;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  window.addEventListener('resize', resize);
  window.addEventListener('rtm-banner-sweep', event => {
    const detail = event.detail || {};
    sweepTarget = clamp(Number(detail.progress) || 0, 0, 1);
  });
  window.addEventListener('pointermove', event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.active = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= width && pointer.y <= height;
  }, { passive: true });
  document.addEventListener('mouseleave', () => {
    pointer.active = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      stop();
      drawStatic();
    } else {
      start();
    }
  });

  resize();
  start();
})();
