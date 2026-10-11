const copyButton = document.getElementById('copy-command');
const command = document.getElementById('install-command');
const status = document.getElementById('copy-status');
let resetStatus;

function copyWithSelection(text) {
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.append(field);
  field.select();
  try {
    if (!document.execCommand('copy')) throw new Error('Copy unavailable');
  } finally {
    field.remove();
    copyButton.focus({ preventScroll: true });
  }
}

copyButton.addEventListener('click', async () => {
  clearTimeout(resetStatus);
  copyButton.disabled = true;
  copyButton.dataset.copied = 'false';
  try {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(command.textContent.trim());
    } catch {
      copyWithSelection(command.textContent.trim());
    }
    status.textContent = 'Copied';
    copyButton.dataset.copied = 'true';
    copyButton.setAttribute('aria-label', 'Command copied');
    copyButton.title = 'Copied';
  } catch {
    status.textContent = 'Select the command to copy it manually.';
    copyButton.setAttribute('aria-label', 'Copy installation command');
    copyButton.title = 'Copy command';
  } finally {
    copyButton.disabled = false;
  }
  resetStatus = setTimeout(() => {
    status.textContent = '';
    copyButton.dataset.copied = 'false';
    copyButton.setAttribute('aria-label', 'Copy installation command');
    copyButton.title = 'Copy command';
  }, 3000);
});

const slogan = document.querySelector('.slogan');
const sloganPin = document.querySelector('.slogan-pin');
const sloganVideo = document.querySelector('.slogan-video');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// One viewport of scroll covers the clip; increase for a slower transition.
const scrubScreens = 1;
const textAnchorY = 539 / 1080;
const textTopY = 414 / 1080;
let scrubStart = 0;
let scrubDistance = 1;
let targetTime = 0;
let scrollFrame = 0;
const social = document.querySelector('.social-links');
const installation = document.querySelector('.installation');
const socialSlot = document.querySelector('.social-slot');
const installationSlot = document.querySelector('.installation-slot');
const banner = document.querySelector('.banner-background');
const bannerLeft = document.querySelector('.banner-left');
const bannerRight = document.querySelector('.banner-right');
const bannerResult = document.querySelector('.banner-result');
const download = document.querySelector('.download');
let controlGeometry;

function drawLiquidBanner(g, progress, height) {
  const lerp = (a, b) => a + (b - a) * progress;
  const width = window.innerWidth;
  const middle = width / 2;
  // Outer edges approach the viewport progressively, retaining their initial
  // inset and rounding. Inner edges stretch farther to meet at the top first.
  const reach = Math.sin(Math.PI * progress) * width * .20;
  const left = {
    start: lerp(g.left, 0), end: lerp(g.left + g.width, middle + 40) + reach,
    height: lerp(g.height, height), outer: lerp(g.height / 2, 0),
    inner: lerp(g.height / 2, 0) + Math.sin(Math.PI * progress) * 60,
    top: g.height / 2 * Math.max(0, 1 - progress * 5) ** 2,
  };
  const right = {
    start: lerp(g.right, middle - 40) - reach,
    end: lerp(g.right + g.rightWidth, width),
    height: lerp(g.rightHeight / 2, height), outer: lerp(20, 0),
    inner: lerp(20, 0) + Math.sin(Math.PI * progress) * 60, top: 0,
  };
  function profile(x, shape, mirrored) {
    if (x < shape.start || x > shape.end) return null;
    const u = mirrored ? shape.end - x : x - shape.start;
    const span = shape.end - shape.start;
    const outer = Math.min(shape.outer, span / 2);
    const inner = Math.min(shape.inner, span / 2);
    const arc = (distance, radius) => radius > 0 && distance < radius
      ? 1 - Math.sqrt(Math.max(0, 1 - (1 - distance / radius) ** 2)) : 0;
    const topRadius = Math.min(shape.top, span / 2);
    return {
      x,
      top: shape.top * Math.max(arc(u, topRadius), arc(span - u, topRadius)),
      bottom: shape.height - Math.max(
        outer * arc(u, outer),
        // The inward edge becomes an elongated liquid neck at the top.
        Math.min(shape.height - shape.top, inner) * arc(span - u, inner)
      ),
    };
  }
  const xs = new Set([left.start, left.end, right.start, right.end]);
  for (let x = Math.min(left.start, right.start); x <= Math.max(left.end, right.end); x += 1) xs.add(x);
  const coordinates = [...xs].sort((a, b) => a - b);
  const a = coordinates.map(x => profile(x, left, false));
  const b = coordinates.map(x => profile(x, right, true));
  const paths = samples => {
    const segments = [];
    let run = [];
    const flush = () => {
      if (run.length) segments.push(`M ${run.map(p => `${p.x} ${p.top}`).join(' L ')} L ${run.reverse().map(p => `${p.x} ${p.bottom}`).join(' L ')} Z`);
      run = [];
    };
    for (const sample of samples) sample ? run.push(sample) : flush();
    flush();
    return segments;
  };
  const connected = left.end >= right.start;
  // Smooth union creates one new contour, with no internal splice. It always
  // encloses the source silhouettes; remove them only after this cover exists.
  const softness = 8 * Math.sin(Math.PI * progress) ** 2;
  const smoothMax = (x, y) => {
    if (!softness) return Math.max(x, y);
    const overlap = Math.max(0, softness - Math.abs(x - y)) / softness;
    return Math.max(x, y) + softness * overlap ** 2 / 4;
  };
  const union = a.map((p, i) => {
    const q = b[i];
    if (!p || !q) return p || q;
    return { x: p.x, top: Math.min(p.top, q.top), bottom: smoothMax(p.bottom, q.bottom) };
  });
  bannerLeft.setAttribute('d', paths(a).join(' '));
  bannerRight.setAttribute('d', paths(b).join(' '));
  bannerRight.removeAttribute('transform');
  bannerResult.setAttribute('d', connected ? paths(union).join(' ') : '');
  bannerLeft.style.visibility = connected ? 'hidden' : 'visible';
  bannerRight.style.visibility = connected ? 'hidden' : 'visible';
}

function measureControls() {
  social.classList.remove('is-pinned', 'is-banner');
  installation.classList.remove('is-banner');
  social.style.left = '';
  social.style.top = '';
  installation.style.left = '';
  installation.style.top = '';
  installation.style.height = '';
  const left = social.getBoundingClientRect();
  const right = installation.getBoundingClientRect();
  const button = download.getBoundingClientRect();
  socialSlot.style.height = `${left.height}px`;
  socialSlot.style.width = `${left.width}px`;
  installationSlot.style.height = `${right.height}px`;
  controlGeometry = {
    left: left.left, width: left.width, height: left.height,
    pinAt: left.top + window.scrollY,
    right: right.left, rightWidth: right.width, rightHeight: right.height,
    mergeAt: right.top + window.scrollY + right.height / 2,
    bottom: Math.max(left.bottom, right.bottom) + window.scrollY,
    buttonTop: button.top - right.top, buttonWidth: button.width, buttonHeight: button.height,
  };
}

function updateBanner() {
  if (!controlGeometry) return;
  const g = controlGeometry;
  const pinned = window.scrollY >= g.pinAt;
  const merged = window.scrollY >= g.mergeAt;
  social.classList.toggle('is-pinned', pinned);
  social.classList.toggle('is-banner', merged);
  social.style.left = pinned ? `${g.left}px` : '';
  social.style.top = pinned ? '0px' : '';
  installation.classList.toggle('is-banner', merged);
  installation.style.left = merged ? `${g.right}px` : '';
  installation.style.top = merged ? `${-g.rightHeight / 2}px` : '';
  installation.style.height = merged ? `${g.rightHeight}px` : '';
  // The command has scrolled away; prevent keyboard focus behind the banner.
  command.parentElement.inert = merged;
  banner.hidden = !merged;
  if (!merged) return;
  const linear = Math.min(1, (window.scrollY - g.mergeAt) / 120);
  const progress = reducedMotion.matches ? 1 : linear;
  if (progress === 1) {
    social.classList.add('entrance-complete');
    installation.classList.add('entrance-complete');
  }
  const lerp = (a, b) => a + (b - a) * progress;
  // Move the shrinking button toward the right edge during the same morph.
  // Its 12px panel inset plus this endpoint leaves a 24px screen margin.
  installation.style.left = `${lerp(g.right, window.innerWidth - g.rightWidth - 12)}px`;
  const height = 36;
  social.style.top = `${lerp(0, (height - g.height) / 2)}px`;
  installation.style.setProperty('--download-top', `${lerp(g.buttonTop, g.rightHeight / 2 + (height - 26) / 2)}px`);
  installation.style.setProperty('--download-width', `${lerp(g.buttonWidth, 112)}px`);
  installation.style.setProperty('--download-height', `${lerp(g.buttonHeight, 26)}px`);
  installation.style.setProperty('--download-radius', `${lerp(12, 10)}px`);
  installation.style.setProperty('--download-font-size', `${lerp(22, 16)}px`);
  // Keep the command scrolling upward after the lower panel pins.
  installation.style.setProperty('--command-shift', `${-(window.scrollY - g.mergeAt)}px`);
  drawLiquidBanner(g, progress, height);
}

function seekSlogan() {
  if (sloganVideo.readyState < 1 || sloganVideo.seeking) return;
  if (Math.abs(sloganVideo.currentTime - targetTime) > 1 / 120) {
    sloganVideo.currentTime = targetTime;
  }
}

function updateSlogan() {
  scrollFrame = 0;
  updateBanner();
  if (!Number.isFinite(sloganVideo.duration)) return;
  const progress = Math.max(0, Math.min(1, (window.scrollY - scrubStart) / scrubDistance));
  // Frame 59 is the final frame of this 60 fps clip; avoid seeking past it.
  const lastFrame = Math.max(0, sloganVideo.duration - 1 / 60);
  targetTime = reducedMotion.matches ? 0 : progress * lastFrame;
  seekSlogan();
}

function measureSlogan() {
  measureControls();
  const viewport = window.innerHeight;
  const videoHeight = sloganPin.getBoundingClientRect().height;
  const pinTop = viewport / 2 - videoHeight * textAnchorY;
  // At scroll zero, the visible text starts 24px below the viewport edge.
  const heroBottom = document.querySelector('.hero').getBoundingClientRect().bottom + window.scrollY;
  const videoTop = viewport + 24 - videoHeight * textTopY;
  slogan.style.setProperty('--slogan-overlap', `${videoTop - heroBottom}px`);
  const sectionTop = slogan.getBoundingClientRect().top + window.scrollY;
  const pinStart = sectionTop - pinTop;
  // Use original document positions, not the now-persistent banner controls.
  const controlsBottom = controlGeometry.bottom;
  scrubStart = Math.max(pinStart, controlsBottom);
  scrubDistance = viewport * scrubScreens;
  slogan.style.setProperty('--slogan-top', `${pinTop}px`);
  slogan.style.setProperty('--slogan-height', `${videoHeight + scrubStart - pinStart + scrubDistance}px`);
  // Leave enough document height to reach the last frame while still centered.
  slogan.style.setProperty('--slogan-tail', `${Math.max(0, viewport - pinTop - videoHeight)}px`);
  updateSlogan();
}

window.addEventListener('scroll', () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateSlogan);
}, { passive: true });
window.addEventListener('resize', measureSlogan);
window.addEventListener('load', measureSlogan);
document.querySelector('.installation').addEventListener('animationend', measureSlogan);
document.fonts.ready.then(measureSlogan);
sloganVideo.addEventListener('loadedmetadata', measureSlogan);
sloganVideo.addEventListener('loadeddata', updateSlogan);
// Coalesce rapid scroll events while a previous video seek is still decoding.
sloganVideo.addEventListener('seeked', seekSlogan);
reducedMotion.addEventListener('change', updateSlogan);
measureSlogan();
