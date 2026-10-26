// The opening page: the install command's copy button, and the top bar the
// hero controls become. Everything below the opening was removed on 2026-10-26;
// the full page lives in real_time_manim_full.html with its own frozen
// real-time-manim.full.css / .full.js.

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

const social = document.querySelector('.social-links');
const installation = document.querySelector('.installation');
const banner = document.querySelector('.banner-background');
const bannerTitle = banner.querySelector('.banner-title');
const bannerSocial = banner.querySelector('.banner-social');
const bannerDownload = banner.querySelector('.banner-download');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
// The hand-off is timed to finish with the particle stage: 1.28 viewports
// puts the full wipe right at the sticky stage's release, so the bar is
// completely open when that stage is scrolled to its end.
const BANNER_SWEEP_SCREENS = 0.70;
let controlGeometry;
let scrollFrame = 0;

bannerTitle.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
});

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function measureControls() {
  const left = social.getBoundingClientRect();
  const right = installation.getBoundingClientRect();
  controlGeometry = {
    mergeAt: Math.min(left.top, right.top) + window.scrollY,
  };
}

function updateBanner() {
  const g = controlGeometry;
  if (!g) return;
  const distance = Math.max(1, window.innerHeight * BANNER_SWEEP_SCREENS);
  const progress = reducedMotion.matches
    ? (window.scrollY >= g.mergeAt ? 1 : 0)
    : Math.max(0, Math.min(1, (window.scrollY - g.mergeAt) / distance));
  // The bar no longer follows the particle band (there is no sideways band):
  // it is still fully retracted at the stack's resting content position, and
  // finishes at the stage's release.
  const wipe = smoothstep(Math.max(0, Math.min(1, (progress - 0.45) / 0.41)));
  const open = progress > 0;

  banner.hidden = !open;
  banner.style.setProperty('--banner-wipe', `${(1 - wipe) * 100}%`);
  const front = window.innerWidth * (1 - wipe);
  banner.style.setProperty('--banner-front', `${front}px`);
  banner.style.setProperty('--banner-feather', `${Math.min(1, wipe * 10)}`);
  banner.inert = !open;
  banner.style.pointerEvents = wipe > 0.01 ? 'auto' : 'none';
  banner.setAttribute('aria-hidden', open ? 'false' : 'true');

  // The fill is clipped from the right; each cluster fades in once that hard
  // edge has travelled past its left side, so nothing is sliced mid-glyph.
  // A cluster is only interactive after its own fade has begun.
  const setCluster = (element, reveal) => {
    element.style.setProperty('--reveal', `${reveal}`);
    element.inert = reveal < 0.5;
    element.style.pointerEvents = reveal < 0.5 ? 'none' : 'auto';
  };
  if (open) {
    const reveal = element => {
      const box = element.getBoundingClientRect();
      const fade = Math.max(1, Math.min(64, box.left));
      return smoothstep(Math.max(0, Math.min(1, (box.left - front) / fade)));
    };
    setCluster(bannerSocial, reveal(bannerSocial));
    setCluster(bannerTitle, reveal(bannerTitle));
    setCluster(bannerDownload, reveal(bannerDownload));
  } else {
    setCluster(bannerSocial, 0);
    setCluster(bannerTitle, 0);
    setCluster(bannerDownload, 0);
  }

  // network-background.js turns this into the top-edge sweep.
  window.dispatchEvent(new CustomEvent('rtm-banner-sweep', { detail: { progress } }));
}

function queueBanner() {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0;
    updateBanner();
  });
}

window.addEventListener('scroll', queueBanner, { passive: true });
window.addEventListener('resize', () => {
  measureControls();
  updateBanner();
});
window.addEventListener('load', () => {
  measureControls();
  updateBanner();
});
document.fonts?.ready?.then(() => {
  measureControls();
  updateBanner();
});
reducedMotion.addEventListener('change', queueBanner);

measureControls();
updateBanner();
// The network script registers its sweep listener after this file runs.
requestAnimationFrame(() => {
  measureControls();
  updateBanner();
});
