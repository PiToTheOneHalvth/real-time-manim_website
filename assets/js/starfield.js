// Dynamic background: a quiet starfield behind the whole page.
// Classic defer script (no ES modules — the site must also work from file://).
// - Fixed full-viewport canvas inserted as the first child of <body> (z-index 0).
// - Twinkle + slow upward drift + a slight scroll parallax.
// - Static under prefers-reduced-motion; rAF loop pauses while the tab is hidden.
// Wrapped in an IIFE: classic scripts share the global lexical scope, and
// real-time-manim.js already declares a top-level `reducedMotion`.
(() => {
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const canvas = document.createElement('canvas');
canvas.id = 'starfield';
canvas.setAttribute('aria-hidden', 'true');
document.body.prepend(canvas);
const ctx = canvas.getContext('2d');

let stars = [];
let width = 0;
let height = 0;
let rafId = 0;
let hidden = false;

function seed() {
  const count = Math.round(Math.min(170, Math.max(70, (width * height) / 15000)));
  stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.4 + Math.random() * 1.1,
      base: 0.25 + Math.random() * 0.45,
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.2,
      depth: 0.3 + Math.random() * 0.7,
    });
  }
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seed();
}

function draw(now) {
  ctx.clearRect(0, 0, width, height);
  const t = now / 1000;
  const scrollY = window.scrollY;
  for (const s of stars) {
    const twinkle = reducedMotion.matches
      ? 1
      : 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
    ctx.globalAlpha = s.base * twinkle;
    // Slow upward drift, and a subtle parallax: stars lag behind the page scroll.
    let y = reducedMotion.matches
      ? s.y
      : (s.y - t * (2 + s.depth * 5) + scrollY * 0.22 * s.depth) % height;
    if (y < 0) y += height;
    ctx.beginPath();
    ctx.arc(s.x, y, s.r, 0, Math.PI * 2);
    ctx.fillStyle = '#F5F5F5';
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  if (!hidden && !document.hidden) draw(now);
  rafId = requestAnimationFrame(frame);
}

function start() {
  cancelAnimationFrame(rafId);
  if (reducedMotion.matches) {
    draw(0); // one static render
    return;
  }
  rafId = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  hidden = document.hidden;
  if (!document.hidden && !reducedMotion.matches) start();
});
window.addEventListener('resize', () => {
  resize();
  if (reducedMotion.matches) draw(0);
});
reducedMotion.addEventListener('change', start);

resize();
start();
})();
