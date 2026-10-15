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

  // Shared fullscreen overlay: the card itself moves in and out, so all
  // pan/zoom/tooltip listeners survive.
  const overlay = document.createElement('div');
  overlay.className = 'diagram-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  const closeBtn = document.createElement('button');
  closeBtn.className = 'diagram-overlay-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Exit fullscreen');
  closeBtn.textContent = '✕';
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
  let openCard = null;
  let openParent = null;
  let openAnchor = null;

  const closeFullscreen = () => {
    if (!openCard) return;
    overlay.hidden = true;
    if (openAnchor && openAnchor.parentNode === openParent) {
      openParent.insertBefore(openCard, openAnchor);
    } else {
      openParent.appendChild(openCard);
    }
    document.body.classList.remove('diagram-fullscreen-open');
    openCard = null;
  };
  closeBtn.addEventListener('click', closeFullscreen);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeFullscreen();
  });

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
    // The uncompressed scale the wheel has dialed; below fitK it is mapped
    // onto the visual scale with 30% resistance (see the wheel handler).
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
      else if (k < fitK) startRecover();
      else apply();
    }).observe(viewport);

    // Pan: drag anywhere in the diagram area — pointer capture on the
    // viewport, so empty margins (fullscreen) pan too, not only the svg.
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    viewport.addEventListener('pointerdown', (e) => {
      cancelAnim();
      cancelRecover();
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
      // Released while stretched below the full view: resume the recovery
      // instead of leaving the diagram stuck smaller than the viewport.
      if (k < fitK) startRecover();
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    // Zoom: wheel around the cursor. Zooming out below the initial full view
    // stretches the diagram with resistance: the visual scale keeps following
    // the wheel but only 30% of the way past the fit size, so it can never
    // shrink below 0.7×fitK. Recovery to the centered full view starts
    // immediately (no idle wait) and eases monotonically — the pull runs
    // every frame while the wheel keeps pushing back.
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      cancelAnim();
      const rect = viewport.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      rawK = Math.min(4, rawK * Math.exp(-e.deltaY * 0.0015));
      if (rawK < fitK) {
        const stretched = 0.7 * fitK + 0.3 * rawK;
        tx = px - (px - tx) * (stretched / k);
        ty = py - (py - ty) * (stretched / k);
        k = stretched;
        touched = true;
        apply();
        startRecover();
        return;
      }
      cancelRecover();
      touched = true;
      tx = px - (px - tx) * (rawK / k);
      ty = py - (py - ty) * (rawK / k);
      k = rawK;
      apply();
    }, { passive: false });

    // Double-click or the recenter button glides back to the initial
    // whole-diagram view (instant under prefers-reduced-motion). Interaction
    // cancels a glide in progress.
    let animFrame = 0;
    const cancelAnim = () => {
      if (animFrame) { cancelAnimationFrame(animFrame); animFrame = 0; }
    };
    // Continuous recovery: whenever the diagram sits below the full view,
    // it eases back to the centered fit state. Exponential decay is
    // monotonic — the scale rises toward fitK without ever overshooting it —
    // and it starts on the first overshoot event, not when the gesture ends.
    // Scale recovers slightly faster than position so the full-view size
    // returns promptly while the recentering follows.
    let recoverFrame = 0;
    let recoverLast = 0;
    const cancelRecover = () => {
      if (recoverFrame) { cancelAnimationFrame(recoverFrame); recoverFrame = 0; }
    };
    const recoverStep = (now) => {
      const t = fitTarget();
      const dt = Math.min(64, now - recoverLast);
      recoverLast = now;
      const sk = 1 - Math.exp(-dt * 0.006);
      const sp = 1 - Math.exp(-dt * 0.003);
      k += (t.k - k) * sk;
      tx += (t.tx - tx) * sp;
      ty += (t.ty - ty) * sp;
      apply();
      if (Math.abs(k - t.k) < 0.0005 && Math.abs(tx - t.tx) < 0.5 && Math.abs(ty - t.ty) < 0.5) {
        k = t.k; tx = t.tx; ty = t.ty;
        rawK = t.k;
        apply();
        recoverFrame = 0;
        touched = false;
        return;
      }
      recoverFrame = requestAnimationFrame(recoverStep);
    };
    const startRecover = () => {
      if (motionReduced.matches) { fit(); touched = false; return; }
      if (recoverFrame) return;
      recoverLast = performance.now();
      recoverFrame = requestAnimationFrame(recoverStep);
    };
    const recenter = () => {
      cancelAnim();
      cancelRecover();
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

    // Fullscreen: move the whole card into the overlay; position preserved
    // on return via the sibling anchor.
    const fullscreenBtn = card.querySelector('.diagram-fullscreen-btn');
    fullscreenBtn.addEventListener('click', () => {
      if (openCard) return;
      openCard = card;
      openParent = card.parentElement;
      openAnchor = card.nextSibling;
      overlay.appendChild(card);
      overlay.hidden = false;
      document.body.classList.add('diagram-fullscreen-open');
      requestAnimationFrame(() => {
        fitK = computeFitK();
        if (!touched) fit();
        else if (k < fitK) startRecover();
        else apply();
      });
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
