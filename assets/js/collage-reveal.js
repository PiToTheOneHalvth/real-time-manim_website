// The fifth and last page: slice the generated collage into its 21x17 frame
// cells and scrub their opacity from the scroll position. The page pins for two
// extra screens, so scrolling down fades the tiles in one by one in a random
// order with no row or column bias, and scrolling back up fades them out again.
// No transforms, no timers: the wheel is the only clock.
(() => {
  const section = document.querySelector('.wiki-collage-section');
  if (!section) return;
  const pin = section.querySelector('.wiki-collage-pin');
  const grid = section.querySelector('.wiki-collage-grid');
  if (!grid) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const IW = 3416;
  const IH = 1578;
  const COLS = 21;
  const ROWS = 17;
  const CW = 160;
  const CH = 90;
  const GAP = 2;
  const MARGIN = 8;
  const FADE = .10;
  const src = new URL(
    grid.dataset.image || '../../assets/images/feature-collage.jpg?v=2',
    document.baseURI,
  ).href;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  const fragment = document.createDocumentFragment();
  const tiles = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = MARGIN + col * (CW + GAP);
    const y = MARGIN + row * (CH + GAP);
    const tile = document.createElement('span');
    tile.className = 'wiki-collage-tile';
    tile.style.left = `${x / IW * 100}%`;
    tile.style.top = `${y / IH * 100}%`;
    tile.style.width = `${CW / IW * 100}%`;
    tile.style.height = `${CH / IH * 100}%`;
    tile.style.backgroundImage = `url("${src}")`;
    tile.style.backgroundSize = `${IW / CW * 100}% ${IH / CH * 100}%`;
    tile.style.backgroundPosition = `${x / (IW - CW) * 100}% ${y / (IH - CH) * 100}%`;
    tiles.push({ el: tile, threshold: 0, shown: -1 });
    fragment.appendChild(tile);
  }
  grid.appendChild(fragment);

  // Every cell gets a random slot in the reveal: no row or column leads, and
  // the order is different on each load. The slots themselves are spread evenly
  // through the pin so the wall fills at a steady pace; shuffling them makes the
  // sequence random without clumping. The highest threshold stays below
  // 1 - FADE, which leaves every tile fully lit at the end of the pin.
  const slot = .82 / Math.max(1, tiles.length - 1);
  tiles
    .map(tile => ({ tile, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .forEach((entry, i) => {
      entry.tile.threshold = (i + Math.random() * .95) * slot;
    });

  // Clear the inline values so the reduced-motion CSS can show every tile.
  const showAll = () => {
    for (const tile of tiles) {
      if (tile.shown === 1) continue;
      tile.shown = 1;
      tile.el.style.opacity = '';
    }
  };

  let painting = 0;
  const paint = () => {
    painting = 0;
    if (reduced.matches) {
      showAll();
      return;
    }
    const pinHeight = pin ? pin.offsetHeight : window.innerHeight;
    const travel = Math.max(1, section.offsetHeight - pinHeight);
    const progress = clamp(-section.getBoundingClientRect().top / travel, 0, 1);
    for (const tile of tiles) {
      const value = Math.round(clamp((progress - tile.threshold) / FADE, 0, 1) * 1000) / 1000;
      if (value === tile.shown) continue;
      tile.shown = value;
      tile.el.style.opacity = value;
    }
  };

  const queue = () => {
    if (painting) return;
    painting = requestAnimationFrame(paint);
  };

  paint();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', queue, { passive: true });
  }

  reduced.addEventListener('change', () => {
    if (reduced.matches) {
      showAll();
    } else {
      paint();
    }
  });
})();
