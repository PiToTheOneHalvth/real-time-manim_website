// Interactive mermaid diagrams: render, pan, zoom, per-node context tooltips.
// Used by the next-generation section of real_time_manim.html.
// Mermaid is loaded locally (assets/js/vendor/mermaid.min.js) — no CDN — so
// the diagrams render even where CDNs are unreachable.

const mermaid = window.mermaid;
// real-time-manim.js already declares `reducedMotion` globally (classic
// scripts share scope) — use a distinct name here.
const motionReduced = window.matchMedia('(prefers-reduced-motion: reduce)');

const CONTEXT = {
  manimce: {
    'Manim Scene': 'Standard Manim code. Nothing live about it.',
    'Renderer.play': 'Frame by frame, forward only.',
    'Camera.get_frame': 'A full capture, every step.',
    'backend': 'Into the offline grind.',
    'renderer': 'Two backends. One rule: you wait.',
    'Cairo mode': 'Pure CPU. Slow by design.',
    'Cairo rasterizer': 'Pixels on the CPU, one by one.',
    'moderngl framebuffer': 'GPU draw, then pixels handed back.',
    'OpenGL mode': 'GPU work, given back to the CPU.',
    'software readback': 'The bottleneck. Pixels dragged back to the CPU.',
    'SceneFileWriter': 'Frames trickle into ffmpeg.',
    'partial_movie_files': 'Your video in pieces. Unplayable till the end.',
    'combine_to_movie': 'Joined only when every play() finishes.',
    'MP4': 'Written last. Seen last.',
    'user waits for the full render': 'No live preview. Wait it out.',
    'no live preview': 'Nothing plays till the render ends.',
  },
  rtm: {
    'Manim Scene': 'Same Manim code. Zero changes.',
    'MLWindow': 'Live. Watch it the moment it plays.',
    'type-dispatch': 'A native fast path per mobject.',
    'vulkan_core.dll': 'Native Vulkan core, built for speed.',
    'ctypes FFI': 'Straight to the engine. No middleman.',
    'per-shape vertex builders': 'Every shape gets its own builder.',
    'Vulkan instance · device · swapchain': 'Hardware-accelerated, end to end.',
    'GPU pipeline': 'Frames drawn by the GPU.',
    'ffmpeg': 'Recording only when you ask.',
    'optional readback': 'An MP4, straight from the stream.',
    'MP4': 'Video on demand.',
  },
};

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  fontFamily: '"Times New Roman", Times, serif',
  flowchart: { htmlLabels: false },
  themeVariables: { background: 'transparent', fontSize: '18px' },
});

function firstLine(node) {
  const label = node.querySelector('.nodeLabel, .label');
  if (!label) return '';
  // htmlLabels:false renders <g class="label"><text><tspan class="row">…;
  // htmlLabels:true renders text nodes separated by <br> inside a span.
  const tspan = label.querySelector('tspan');
  if (tspan && tspan.textContent.trim()) return tspan.textContent.trim();
  let text = '';
  for (const child of label.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent;
    } else if (child.nodeName === 'BR') {
      break;
    }
  }
  return (text || label.textContent).trim();
}

function positionTooltip(tooltip, x, y) {
  const margin = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = x + margin;
  let top = y + margin;
  if (left + rect.width > window.innerWidth - margin) left = x - rect.width - margin;
  if (top + rect.height > window.innerHeight - margin) top = y - rect.height - margin;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

async function main() {
  // Guard against double execution (e.g. a live-preview server reloading the
  // page mid-session): running twice would double-wire pan/zoom listeners.
  // A window flag works even while mermaid's async render is still pending.
  if (window.__diagramPanzoomWired) return;
  window.__diagramPanzoomWired = true;
  if (!mermaid) {
    document.querySelectorAll('.diagram-card .mermaid')
      .forEach((el) => { el.textContent = 'Diagram library failed to load.'; });
    return;
  }
  try {
    await mermaid.run({ querySelector: '.diagram-card .mermaid' });
  } catch (err) {
    document.querySelectorAll('.diagram-card .mermaid')
      .forEach((el) => { el.textContent = 'Diagram failed to render.'; });
    console.error('diagram-panzoom: mermaid render failed', err);
    return;
  }

  let wired = 0;
  for (const card of document.querySelectorAll('.diagram-card')) {
    const viewport = card.querySelector('.diagram-viewport');
    const canvas = viewport.querySelector('svg');
    if (!canvas) continue;
    const tooltip = card.querySelector('.diagram-tooltip');
    // The reveal animation leaves a transform on the card, which turns it
    // into the containing block for fixed descendants and breaks tooltip
    // positioning. Relocate the tooltip to body so fixed = viewport.
    document.body.appendChild(tooltip);
    const context = CONTEXT[card.dataset.diagram] || {};

    // mermaid leaves width="100%" on the svg, which collapses to a sliver
    // inside the viewport. Size it to its natural viewBox instead.
    const vb = canvas.viewBox.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      canvas.removeAttribute('width');
      canvas.removeAttribute('height');
      canvas.style.width = `${vb.width}px`;
      canvas.style.height = `${vb.height}px`;
      canvas.style.maxWidth = 'none';
    }

    // Initial view shows the whole diagram (contain-fit): the map is scaled so
    // it fits entirely inside the viewport, centered with a small margin —
    // drag to pan, wheel to zoom, double-click to reset. Resize refits only
    // until the user has interacted.
    const base = canvas.getBoundingClientRect();
    const baseWidth = base.width;
    const baseHeight = base.height;
    const recenterBtn = card.querySelector('.diagram-recenter-btn');
    let tx = 12, ty = 12, k = 1;
    // Scale at which the whole diagram fits the viewport (the initial full
    // view). Wheel-zoom below it stretches the diagram with resistance, and
    // a continuous monotonic pull eases it back to the centered full view.
    let fitK = 1;
    const ZOOM_MAX = 4;
    // Pinch/ctrl-wheel zoom speed: log-step per deltaY unit (user-tuned,
    // 0.0015 × 6). Plain two-finger wheel pan is unaffected.
    const ZOOM_SPEED = 0.009;
    // The uncompressed scale the wheel has dialed; below fitK or above
    // ZOOM_MAX it is mapped onto a resisted visual scale.
    let rawK = 1;
    let touched = false;
    const pad = 12;
    const computeFitK = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      if (baseWidth <= 0 || baseHeight <= 0 || vw <= 0 || vh <= 0) return fitK;
      const cw = Math.max(1, vw - 2 * pad);
      const ch = Math.max(1, vh - 2 * pad);
      return Math.min(cw / baseWidth, ch / baseHeight);
    };
    const fitTarget = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const kk = computeFitK();
      return { k: kk, tx: (vw - baseWidth * kk) / 2, ty: (vh - baseHeight * kk) / 2 };
    };
    // The recenter control hides while the view already sits at the centered
    // fit state and reappears as soon as the diagram pans or zooms away.
    const updateRecenterVisibility = () => {
      const t = fitTarget();
      const centered = Math.abs(k - t.k) < 0.005 && Math.abs(tx - t.tx) < 0.5 && Math.abs(ty - t.ty) < 0.5;
      recenterBtn.classList.toggle('is-centered', centered);
    };
    const apply = () => {
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
      updateRecenterVisibility();
    };
    // Map the raw (uncompressed) scale the wheel has dialed onto the visible
    // state: inside [fitK, ZOOM_MAX] the identity, below fitK or above
    // ZOOM_MAX a 70%-resisted stretch, always anchored at the focal point.
    // Returns 'min' | 'max' when the state landed in a band, else null. The
    // raw accumulator itself is never re-synced from the visual value.
    const applyRawZoom = (px, py) => {
      let target = rawK;
      let band = null;
      if (rawK < fitK) { target = 0.7 * fitK + 0.3 * rawK; band = 'min'; }
      else if (rawK > ZOOM_MAX) { target = ZOOM_MAX + 0.3 * (rawK - ZOOM_MAX); band = 'max'; }
      tx = px - (px - tx) * (target / k);
      ty = py - (py - ty) * (target / k);
      k = target;
      touched = true;
      apply();
      return band;
    };
    canvas.style.transformOrigin = '0 0';
    const fit = () => {
      const t = fitTarget();
      fitK = t.k;
      rawK = t.k;
      k = t.k; tx = t.tx; ty = t.ty;
      apply();
    };
    fit();
    new ResizeObserver(() => {
      fitK = computeFitK();
      if (!touched) fit();
      else if (k < fitK || k > ZOOM_MAX) scheduleJelly();
      else apply();
    }).observe(viewport);

    // Pan: drag anywhere in the diagram area — pointer capture on the
    // viewport, so empty margins (fullscreen) pan too, not only the svg.
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    viewport.addEventListener('pointerdown', (e) => {
      cancelAnim();
      cancelJelly();
      cancelMomentum();
      dragging = true;
      viewport.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; ox = tx; oy = ty;
      viewport.classList.add('dragging');
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      touched = true;
      tx = ox + (e.clientX - sx);
      ty = oy + (e.clientY - sy);
      apply();
    });
    const endDrag = () => {
      dragging = false;
      viewport.classList.remove('dragging');
      // Released while stretched past a limit: the spring-back resumes.
      if (k < fitK || k > ZOOM_MAX) scheduleJelly();
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    // Zoom: pinch/modified wheel around the cursor. Plain two-finger wheel
    // scrolling pans the map in both axes instead of changing its scale.
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      cancelAnim();
      cancelMomentum();
      const rect = viewport.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // Gesture parity with the architecture graph (d3.zoom defaults): every
      // wheel event zooms — a mouse wheel notch, a trackpad two-finger
      // scroll, and a pinch alike. Plain wheels use d3's deltaMode-aware
      // sensitivity curve; pinch (ctrl/meta) keeps the user-tuned speed.
      const now = performance.now();
      const isPinch = e.ctrlKey || e.metaKey;
      const inst = isPinch
        ? -e.deltaY * ZOOM_SPEED
        : -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * Math.LN2;
      const since = now - zoomLast;
      zoomVel = since > 120
        ? inst / Math.max(since, 8)
        : zoomVel * 0.5 + (inst / Math.max(since, 8)) * 0.5;
      zoomLast = now;
      zoomPx = px;
      zoomPy = py;
      rawK *= Math.exp(inst);
      rawK = Math.min(ZOOM_MAX + ZOOM_MAX / 0.3, rawK);
      scheduleMomentum();
      if (applyRawZoom(px, py)) scheduleJelly();
      else cancelJelly();
    }, { passive: false });

    // Double-click or the recenter button glides back to the initial
    // whole-diagram view (instant under prefers-reduced-motion). Interaction
    // cancels a glide in progress.
    let animFrame = 0;
    const cancelAnim = () => {
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
    };
    // Jelly (rubber band): while the input holds the diagram past a limit
    // the scale stretches with 70% resistance; when the gesture stops
    // (wheel has no release event — a short idle window stands in), a
    // spring-back with a slight overshoot snaps it exactly onto the limit.
    // Below fitK the spring lands on the centered full view; above ZOOM_MAX
    // it lands on the ceiling keeping the current translation.
    let jellyTimer = 0;
    let jellyFrame = 0;
    const cancelJelly = () => {
      if (jellyTimer) { clearTimeout(jellyTimer); jellyTimer = 0; }
      if (jellyFrame) { cancelAnimationFrame(jellyFrame); jellyFrame = 0; }
    };
    const scheduleJelly = () => {
      cancelJelly();
      if (motionReduced.matches) {
        if (k < fitK) {
          const t = fitTarget();
          fitK = t.k;
          rawK = t.k;
          k = t.k; tx = t.tx; ty = t.ty;
        } else {
          rawK = ZOOM_MAX;
          k = ZOOM_MAX;
        }
        touched = false;
        apply();
        return;
      }
      jellyTimer = setTimeout(() => { jellyTimer = 0; jellySpring(); }, 180);
    };
    const jellySpring = () => {
      cancelAnim();
      cancelMomentum();
      const below = k < fitK;
      const target = below ? fitTarget() : { k: ZOOM_MAX, tx, ty };
      if (below) fitK = target.k;
      // Re-engage the stretch from the boundary: a wheel mid-spring starts
      // at the edge (accepted ≤4% one-frame correction) instead of the raw
      // depth the gesture dialed.
      rawK = target.k;
      const start = { k, tx, ty };
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const ease = t => (t >= 1 ? 1 : 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2);
      const duration = 450;
      const began = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - began) / duration);
        const e = ease(t);
        k = start.k + (target.k - start.k) * e;
        tx = start.tx + (target.tx - start.tx) * e;
        ty = start.ty + (target.ty - start.ty) * e;
        apply();
        if (t < 1) { jellyFrame = requestAnimationFrame(step); return; }
        jellyFrame = 0;
        k = target.k; tx = target.tx; ty = target.ty;
        touched = false;
        apply();
      };
      jellyFrame = requestAnimationFrame(step);
    };
    // Zoom momentum: a pinch that stops keeps gliding and eases out — the
    // same gradual stop a two-finger swipe gets from the trackpad's own
    // inertia events. Wheel has no release event, so the glide starts
    // after a short idle timeout; any further input cancels it. Velocity
    // is log-space (log-rawK per ms), EMA-smoothed by the wheel handler;
    // the glide decays exponentially around the gesture's last focal
    // point, and hands off to the recover glides when it crosses the
    // resisted zones.
    let zoomVel = 0;
    let zoomLast = 0;
    let zoomPx = 0;
    let zoomPy = 0;
    let momentumTimer = 0;
    let momentumFrame = 0;
    let momentumLast = 0;
    const cancelMomentum = () => {
      if (momentumTimer) { clearTimeout(momentumTimer); momentumTimer = 0; }
      if (momentumFrame) { cancelAnimationFrame(momentumFrame); momentumFrame = 0; }
    };
    const momentumStep = (now) => {
      // Integrate the real elapsed time — exact at any frame rate, so a
      // throttled tab (1 fps bursts) glides identically to a 60 fps one.
      const dt = Math.max(0, now - momentumLast);
      momentumLast = now;
      zoomVel *= Math.exp(-dt / 158.6); // τ ≈ 159ms per-frame friction
      const nextRaw = rawK * Math.exp(zoomVel * dt);
      if (nextRaw < fitK) {
        const stretched = 0.7 * fitK + 0.3 * nextRaw;
        tx = zoomPx - (zoomPx - tx) * (stretched / k);
        ty = zoomPy - (zoomPy - ty) * (stretched / k);
        k = stretched;
        touched = true;
        apply();
        momentumFrame = 0;
        startRecover('fit');
        return;
      }
      if (nextRaw > ZOOM_MAX) {
        const stretched = ZOOM_MAX + 0.3 * (nextRaw - ZOOM_MAX);
        tx = zoomPx - (zoomPx - tx) * (stretched / k);
        ty = zoomPy - (zoomPy - ty) * (stretched / k);
        k = stretched;
        touched = true;
        apply();
        momentumFrame = 0;
        startRecover('max', tx, ty);
        return;
      }
      rawK = nextRaw;
      tx = zoomPx - (zoomPx - tx) * (rawK / k);
      ty = zoomPy - (zoomPy - ty) * (rawK / k);
      k = rawK;
      apply();
      if (Math.abs(zoomVel) < 1e-5) { momentumFrame = 0; return; }
      momentumFrame = requestAnimationFrame(momentumStep);
    };
    const scheduleMomentum = () => {
      if (motionReduced.matches) return;
      cancelMomentum();
      momentumTimer = setTimeout(() => {
        momentumTimer = 0;
        zoomVel *= 0.15;
        // Below/above the resisted zones the recover glides already give
        // the gradual stop; skip momentum so the two never fight.
        if (Math.abs(zoomVel) < 5e-6 || rawK <= fitK || rawK >= ZOOM_MAX) {
          zoomVel = 0;
          return;
        }
        momentumLast = performance.now();
        momentumFrame = requestAnimationFrame(momentumStep);
      }, 100);
    };
    const recenter = () => {
      cancelAnim();
      cancelRecover();
      cancelMomentum();
      if (motionReduced.matches) { fit(); return; }
      const start = { k, tx, ty };
      const end = fitTarget();
      fitK = end.k;
      rawK = fitK;
      const duration = 320;
      const startedAt = performance.now();
      const ease = x => 1 - (1 - x) ** 3;
      const step = (now) => {
        const t = Math.min(1, (now - startedAt) / duration);
        const e = ease(t);
        k = start.k + (end.k - start.k) * e;
        tx = start.tx + (end.tx - start.tx) * e;
        ty = start.ty + (end.ty - start.ty) * e;
        apply();
        if (t < 1) {
          animFrame = requestAnimationFrame(step);
        } else {
          animFrame = 0;
          touched = false;
        }
      };
      animFrame = requestAnimationFrame(step);
    };
    viewport.addEventListener('dblclick', recenter);
    recenterBtn.addEventListener('click', recenter);

    // Fullscreen: like the architecture graph, the card itself fills the
    // viewport (inset 3svh/3vw) with a ::after backdrop, the same icon
    // button toggles back, and Escape exits. While fullscreen the card is
    // reparented to <body>: position:fixed children of the flex
    // .next-generation-screen container are laid out at their static
    // (centered) position with the insets ignored, while as a body child
    // the card fixes to the viewport exactly like the graph.
    let openParent = null;
    let openAnchor = null;
    const fullscreenBtn = card.querySelector('.diagram-fullscreen-btn');
    const enterFullscreen = () => {
      cancelMomentum();
      openParent = card.parentElement;
      openAnchor = card.nextSibling;
      document.body.appendChild(card);
      card.classList.add('is-fullscreen');
      document.body.classList.add('diagram-fullscreen-open');
      requestAnimationFrame(() => {
        fit();
        touched = false;
      });
    };
    const exitFullscreen = () => {
      cancelMomentum();
      card.classList.remove('is-fullscreen');
      document.body.classList.remove('diagram-fullscreen-open');
      if (openAnchor && openAnchor.parentNode === openParent) {
        openParent.insertBefore(card, openAnchor);
      } else {
        openParent.appendChild(card);
      }
      openParent = null;
      openAnchor = null;
      requestAnimationFrame(() => {
        fit();
        touched = false;
      });
    };
    fullscreenBtn.addEventListener('click', () => {
      if (card.classList.contains('is-fullscreen')) exitFullscreen();
      else enterFullscreen();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && card.classList.contains('is-fullscreen')) exitFullscreen();
    });

    // Hover: context tooltip for nodes and mid-edge labels.
    for (const label of canvas.querySelectorAll('g.node, g.edgeLabel')) {
      const text = context[firstLine(label)];
      if (!text) continue;
      label.style.cursor = 'crosshair';
      label.addEventListener('pointerenter', (e) => {
        tooltip.textContent = text;
        tooltip.hidden = false;
        positionTooltip(tooltip, e.clientX, e.clientY);
      });
      label.addEventListener('pointermove', (e) => positionTooltip(tooltip, e.clientX, e.clientY));
      label.addEventListener('pointerleave', () => { tooltip.hidden = true; });
      wired += 1;
    }
  }
  console.log(`diagram-panzoom: wired ${wired} context nodes`);
}

main();
