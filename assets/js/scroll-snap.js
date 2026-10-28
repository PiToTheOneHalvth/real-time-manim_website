// Gentle magnetic scroll correction for the homepage.
//
// The page has a few places that read best when they sit exactly in the
// viewport: the opening, the stack content, the export content, the wiki
// architecture page, the collage page (where the shape stage takes over), the
// particle stage fully in view, the stage release and the page bottom. After the
// wheel/keyboard stops, if the page is within SNAP px of one of those, it glides
// to it over a short ease instead of hard-snapping. Any new wheel/touch/key
// press cancels the glide; reduced motion opts out entirely.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const stack = document.querySelector('.stack-section');
  const exportSection = document.querySelector('.export-section');
  const shape = document.querySelector('.shape-section');
  const stage = shape ? shape.querySelector('.shape-stage') : null;
  const architecture = document.querySelector('.wiki-architecture-section');
  const points = [];
  let frame = 0;
  let idle = 0;
  let snapping = false;
  let pointerDown = false;
  let fromY = 0;
  let toY = 0;
  let startedAt = 0;
  let duration = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const threshold = () => Math.min(150, window.innerHeight * .18);

  function measure() {
    points.length = 0;
    const add = y => {
      if (!Number.isFinite(y)) return;
      const value = clamp(Math.round(y), 0, maxScroll());
      if (!points.some(p => Math.abs(p - value) < 2)) points.push(value);
    };
    add(0);
    if (shape && stage) {
      const top = shape.getBoundingClientRect().top + window.scrollY;
      add(top);                                              // stage fully in view
      add(top + shape.offsetHeight - stage.offsetHeight);     // stage release / bar open
    }
    if (stack) {
      const top = stack.getBoundingClientRect().top + window.scrollY;
      const inner = stack.querySelector('.stack-inner');
      // The stack content, not the section top: 40px of air above it, so the
      // marks and copy sit high in the viewport instead of under 160px of pad.
      if (inner) add(inner.getBoundingClientRect().top + window.scrollY - 40);
      else add(top);
      // A phone-sized stack is taller than the viewport; its bottom is a real
      // resting place. On desktop the bottom is only a few px past the stack,
      // so the stack content is the better stop.
      if (maxScroll() - top > 200) add(maxScroll());
    }
    if (exportSection) {
      const inner = exportSection.querySelector('.export-inner');
      // The bar is fully open by the export page, so stop with the eyebrow just
      // below it instead of under it.
      if (inner) add(inner.getBoundingClientRect().top + window.scrollY - 96);
    }
    if (architecture) {
      add(architecture.getBoundingClientRect().top + window.scrollY);
    }
    add(maxScroll());
    points.sort((a, b) => a - b);
  }

  function nearest(y) {
    let best = null;
    const limit = threshold();
    for (const point of points) {
      const distance = Math.abs(point - y);
      if (distance <= limit && (!best || distance < best.distance)) {
        best = { point, distance };
      }
    }
    return best;
  }

  function step(now) {
    const progress = clamp((now - startedAt) / duration, 0, 1);
    const eased = 1 - (1 - progress) ** 3;
    window.scrollTo(0, fromY + (toY - fromY) * eased);
    if (progress < 1) {
      frame = requestAnimationFrame(step);
    } else {
      frame = 0;
      snapping = false;
    }
  }

  function cancel() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    snapping = false;
  }

  function schedule(delay = 180) {
    if (snapping) return;
    clearTimeout(idle);
    idle = setTimeout(() => {
      idle = 0;
      if (snapping || reduced.matches || pointerDown) return;
      const y = window.scrollY;
      const best = nearest(y);
      if (!best || best.distance < 2) return;
      snapping = true;
      fromY = y;
      toY = best.point;
      startedAt = performance.now();
      duration = clamp(240 + best.distance * 1.2, 260, 420);
      frame = requestAnimationFrame(step);
    }, delay);
  }

  window.addEventListener('scroll', () => {
    if (!snapping) schedule();
  }, { passive: true });

  window.addEventListener('resize', () => {
    measure();
    schedule();
  }, { passive: true });

  window.addEventListener('load', () => {
    measure();
    schedule();
  });

  document.fonts?.ready?.then(() => {
    measure();
    schedule();
  });

  window.addEventListener('wheel', cancel, { passive: true });
  window.addEventListener('touchstart', cancel, { passive: true });
  window.addEventListener('keydown', cancel, { passive: true });
  window.addEventListener('pointerdown', () => {
    pointerDown = true;
    cancel();
  }, { passive: true });
  window.addEventListener('pointerup', () => {
    pointerDown = false;
    schedule();
  }, { passive: true });
  window.addEventListener('pointercancel', () => {
    pointerDown = false;
    schedule();
  }, { passive: true });

  reduced.addEventListener('change', () => {
    if (reduced.matches) cancel();
    else schedule();
  });

  measure();
  schedule();
})();
