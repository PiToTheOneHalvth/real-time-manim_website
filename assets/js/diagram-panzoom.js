// Interactive mermaid diagrams: render, pan, zoom, per-node context tooltips.
// Used by the next-generation section of real_time_manim.html.
// Mermaid is loaded locally (assets/js/vendor/mermaid.min.js) — no CDN — so
// the diagrams render even where CDNs are unreachable.

const mermaid = window.mermaid;

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

    // Initial view shows the whole diagram (contain-fit; small is fine).
    // Wheel zoom and drag take over; resize refits only until the user
    // has interacted.
    const base = canvas.getBoundingClientRect();
    const baseWidth = base.width;
    const baseHeight = base.height;
    let tx = 12, ty = 12, k = 1;
    let touched = false;
    const apply = () => {
      canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`;
    };
    canvas.style.transformOrigin = '0 0';
    const fit = () => {
      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      if (baseWidth > 0 && baseHeight > 0 && vw > 0 && vh > 0) {
        k = Math.min(1, (vw - 24) / baseWidth, (vh - 24) / baseHeight);
        tx = (vw - baseWidth * k) / 2;
        ty = (vh - baseHeight * k) / 2;
      }
      apply();
    };
    fit();
    new ResizeObserver(() => { if (!touched) fit(); }).observe(viewport);

    // Pan: drag with pointer capture.
    let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY; ox = tx; oy = ty;
      viewport.classList.add('dragging');
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      touched = true;
      tx = ox + (e.clientX - sx);
      ty = oy + (e.clientY - sy);
      apply();
    });
    const endDrag = () => {
      dragging = false;
      viewport.classList.remove('dragging');
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // Zoom: wheel around the cursor.
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      touched = true;
      const rect = viewport.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const next = Math.min(4, Math.max(0.35, k * Math.exp(-e.deltaY * 0.0015)));
      tx = px - (px - tx) * (next / k);
      ty = py - (py - ty) * (next / k);
      k = next;
      apply();
    }, { passive: false });

    // Double-click resets to the initial full-scope view.
    canvas.addEventListener('dblclick', () => {
      touched = false;
      fit();
    });

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
      requestAnimationFrame(() => { if (!touched) fit(); });
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
