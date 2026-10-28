// Wheel scrolling is speed-limited on purpose.
//
// The homepage's opening and its top-bar hand-off are scroll-linked, so a hard
// flick used to skip the whole sequence. A wheel delta is collected into a
// target, but the target can only lead the page by LEAD pixels and the page
// catches up at no more than MAX_SPEED px/s; excess input is dropped rather than
// queued. Keyboard, scrollbar and touch scrolling are untouched, and
// prefers-reduced-motion opts out entirely.
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MAX_SPEED = 480;   // px/s — the fastest the page may travel under a wheel
  const LEAD = 180;        // px a flick may get ahead of the page before it is cut
  let enabled = !reduced.matches;
  let target = window.scrollY;
  let last = 0;
  let frame = 0;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight);

  function step(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    const current = window.scrollY;
    const diff = target - current;
    if (Math.abs(diff) < 0.5) {
      if (diff) window.scrollTo(0, target);
      frame = 0;
      return;
    }
    const move = Math.min(Math.abs(diff), MAX_SPEED * dt);
    window.scrollTo(0, current + Math.sign(diff) * move);
    frame = requestAnimationFrame(step);
  }

  window.addEventListener('wheel', event => {
    if (!enabled || event.ctrlKey) return;
    // The architecture graph owns the wheel only after it has been clicked:
    // D3 uses it to zoom. An unarmed graph lets the page scroll normally.
    const graph = event.target instanceof Element ? event.target.closest('.architecture-graph') : null;
    if (graph && graph.classList.contains('is-wheel-active')) return;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    let delta = event.deltaY;
    if (!delta) return;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= window.innerHeight;
    delta = clamp(delta, -220, 220);
    event.preventDefault();

    const current = window.scrollY;
    target = clamp(target + delta, current - LEAD, current + LEAD);
    target = clamp(target, 0, maxScroll());
    if (!frame) {
      last = 0;
      frame = requestAnimationFrame(step);
    }
  }, { passive: false });

  // Anything that moves the page outside the wheel loop (keys, scrollbar,
  // anchor links) takes the target with it instead of being fought.
  window.addEventListener('scroll', () => {
    if (!frame) target = window.scrollY;
  }, { passive: true });

  window.addEventListener('resize', () => {
    target = clamp(target, 0, maxScroll());
  });

  reduced.addEventListener('change', () => {
    enabled = !reduced.matches;
    if (!enabled && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      target = window.scrollY;
    }
  });
})();
