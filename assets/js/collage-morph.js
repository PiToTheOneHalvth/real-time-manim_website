// Magic UI-style morphing headline for the final collage page. Two stacked
// layers cross-fade through blur and opacity; each layer keeps its word while
// visible, so the text never jumps when the cycle swaps.
(() => {
  const heading = document.querySelector('.wiki-collage-heading');
  if (!heading) return;
  const layers = [...heading.querySelectorAll('.wiki-collage-morph-word')];
  if (layers.length < 2) return;

  const words = [
    'Every feature, one frame.',
    'Every test, one frame.',
    'Every demo, one frame.',
  ];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const MORPH = 1.5;
  const COOL = 0.5;

  const set = (el, f) => {
    el.style.filter = `blur(${Math.min(8 / f - 8, 100)}px)`;
    el.style.opacity = `${Math.pow(f, 0.4) * 100}%`;
  };

  let visible = 0;
  let index = 0;
  let morph = 0;
  let cool = 0;
  let last = 0;
  let frame = 0;

  const paint = () => {
    set(layers[0], 1);
    set(layers[1], 0);
  };

  const reset = () => {
    visible = 0;
    index = 0;
    morph = 0;
    cool = 0;
    last = 0;
    layers[0].textContent = words[0];
    layers[1].textContent = words[1];
    paint();
  };

  const tick = now => {
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (cool > 0) {
      cool -= dt;
      if (cool <= 0) {
        const hidden = 1 - visible;
        index = (index + 1) % words.length;
        layers[hidden].textContent = words[(index + 1) % words.length];
        morph = 0;
      }
    } else {
      morph += dt;
      const f = Math.min(morph / MORPH, 1);
      set(layers[visible], 1 - f);
      set(layers[1 - visible], f);
      if (f >= 1) {
        cool = COOL;
        visible = 1 - visible;
      }
    }

    frame = requestAnimationFrame(tick);
  };

  reset();
  if (reduced.matches) return;
  frame = requestAnimationFrame(tick);

  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      reset();
    } else if (!frame) {
      last = 0;
      frame = requestAnimationFrame(tick);
    }
  });
})();
