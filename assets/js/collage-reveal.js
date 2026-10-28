// The final page: slice the generated wiki collage into its 21x17 frame cells
// and let them surface one by one over the full-screen page. The text overlay
// is plain DOM; only the tiles animate.
(() => {
  const section = document.querySelector('.wiki-collage-section');
  if (!section) return;
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
  const src = new URL(
    grid.dataset.image || '../../assets/images/feature-collage.jpg?v=2',
    document.baseURI,
  ).href;

  const fragment = document.createDocumentFragment();
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
    // A centre-out wave: the middle of the wall lands first, the corners last.
    const delay = Math.round((Math.abs(col - 10) + Math.abs(row - 8)) * 34 + (i % 7) * 11);
    tile.style.setProperty('--d', `${delay}ms`);
    fragment.appendChild(tile);
  }
  grid.appendChild(fragment);

  const reveal = () => section.classList.add('is-revealed');

  if (reduced.matches) {
    reveal();
    return;
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      reveal();
    }, { threshold: .2 });
    observer.observe(section);
  } else {
    reveal();
  }

  reduced.addEventListener('change', () => {
    if (reduced.matches) reveal();
  });
})();
