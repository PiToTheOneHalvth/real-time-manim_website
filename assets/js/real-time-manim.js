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
// Scroll budget per pinned stage, in viewports. Kept short so the page does not
// eat extra swipes with "dead" scroll: the scrub covers the clip in half a
// viewport of scrolling (faster scrub = fewer swipes to get through the page).
const scrubScreens = 0.5;
// Slogan video is cropped to its content (1250x268, black padding removed):
// the baked text spans y=8..260 of the 268px frame. Anchors are fractions of
// the cropped height (text center, text top).
const textAnchorY = 133 / 268;
const textTopY = 8 / 268;
let scrubStart = 0;
let scrubDistance = 1;
let targetTime = 0;
let scrollFrame = 0;
const futureScroll = document.querySelector('.future-scroll');
const futurePin = document.querySelector('.future-pin');
const futureSection = document.querySelector('.future-section');
const futureFinale = document.querySelector('.future-finale');
let futureStart = 0;
let futureDistance = 1;
let previousFutureProgress = 0;
let featureReturnArmed = false;

function measureFuture() {
  const viewport = window.innerHeight;
  const height = futureSection.getBoundingClientRect().height;
  const top = Math.min(0, viewport - height);
  futureStart = futureScroll.getBoundingClientRect().top + window.scrollY - top;
  // One viewport: the feature list fades out and the finale settles within a
  // single swipe instead of one and a half.
  futureDistance = viewport * 1.0;
  futureScroll.style.setProperty('--future-pin-top', `${top}px`);
  futureScroll.style.setProperty('--future-scroll-height', `${height + futureDistance}px`);
  futureScroll.style.setProperty('--future-center', `${viewport / 2 - top}px`);
}

function updateFuture() {
  const progress = Math.max(0, Math.min(1, (window.scrollY - futureStart) / futureDistance));
  // Re-arm after reaching the finale, then run a time-based animation on
  // return. Scroll position never drives or reverses the animation itself.
  if (progress >= .95) featureReturnArmed = true;
  if (featureReturnArmed && progress < .95 && progress < previousFutureProgress) {
    const list = document.querySelector('.future-features');
    list.classList.remove('features-returning');
    void list.offsetWidth;
    list.classList.add('features-returning');
    featureReturnArmed = false;
  }
  previousFutureProgress = progress;
  const smooth = value => value * value * (3 - 2 * value);
  const entrance = Math.max(0, Math.min(1, (progress - .25) / .75));
  futureScroll.style.setProperty('--future-opacity', 1 - smooth(progress));
  const travel = window.innerHeight / 2 + futureFinale.getBoundingClientRect().height / 2 + 1;
  futureScroll.style.setProperty('--finale-offset', `${travel * (1 - entrance)}px`);
  futureScroll.style.setProperty('--finale-visibility', entrance > 0 ? 'visible' : 'hidden');
  futureSection.setAttribute('aria-hidden', progress === 1 ? 'true' : 'false');
  futureFinale.setAttribute('aria-hidden', progress <= .25 ? 'true' : 'false');
}

const manteractionScroll = document.querySelector('.manteraction-scroll');
const manteractionStage = document.querySelector('.manteraction-stage');
const manteractionFinale = document.querySelector('.manteraction-finale');
let manteractionStart = 0;
let manteractionDistance = 1;

function measureManteraction() {
  const viewport = window.innerHeight;
  const stage = manteractionStage.getBoundingClientRect().height;
  const pinTop = Math.min(0, viewport - stage);
  manteractionStart = manteractionScroll.getBoundingClientRect().top + window.scrollY - pinTop;
  // One viewport: the trio fades out and the finale settles in a single swipe.
  manteractionDistance = viewport * 1.0;
  manteractionScroll.style.setProperty('--manteraction-pin-top', `${pinTop}px`);
  manteractionScroll.style.setProperty('--manteraction-scroll-height', `${stage + manteractionDistance}px`);
  manteractionScroll.style.setProperty('--manteraction-center', `${viewport / 2 - pinTop}px`);
}

function updateManteraction() {
  const progress = Math.max(0, Math.min(1, (window.scrollY - manteractionStart) / manteractionDistance));
  const smooth = value => value * value * (3 - 2 * value);
  const entrance = Math.max(0, Math.min(1, (progress - .25) / .75));
  manteractionScroll.style.setProperty('--manteraction-opacity', 1 - smooth(progress));
  const travel = window.innerHeight / 2 + manteractionFinale.getBoundingClientRect().height / 2 + 1;
  manteractionScroll.style.setProperty('--manteraction-offset', `${travel * (1 - entrance)}px`);
  manteractionScroll.style.setProperty('--manteraction-visibility', entrance > 0 ? 'visible' : 'hidden');
  manteractionStage.setAttribute('aria-hidden', progress === 1 ? 'true' : 'false');
  manteractionFinale.setAttribute('aria-hidden', entrance <= 0 ? 'true' : 'false');
}
const social = document.querySelector('.social-links');
const installation = document.querySelector('.installation');
const socialSlot = document.querySelector('.social-slot');
const installationSlot = document.querySelector('.installation-slot');
const banner = document.querySelector('.banner-background');
const bannerLeft = document.querySelector('.banner-left');
const bannerRight = document.querySelector('.banner-right');
const bannerResult = document.querySelector('.banner-result');
const download = document.querySelector('.download');
const centerTitle = document.querySelector('.center-title');
let controlGeometry;

// The merged-banner center title returns to the top of the page.
centerTitle.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
});

function drawLiquidBanner(g, progress, height) {
  const scale = g.height / 52;
  const lerp = (a, b) => a + (b - a) * progress;
  const width = window.innerWidth;
  const middle = width / 2;
  // Outer edges approach the viewport progressively, retaining their initial
  // inset and rounding. Inner edges stretch farther to meet at the top first.
  const reach = Math.sin(Math.PI * progress) * width * .20;
  const left = {
    start: lerp(g.left, 0), end: lerp(g.left + g.width, middle + 40 * scale) + reach,
    height: lerp(g.height, height), outer: lerp(g.height / 2, 0),
    inner: lerp(g.height / 2, 0) + Math.sin(Math.PI * progress) * 60 * scale,
    top: g.height / 2 * Math.max(0, 1 - progress * 5) ** 2,
  };
  const right = {
    start: lerp(g.right, middle - 40 * scale) - reach,
    end: lerp(g.right + g.rightWidth, width),
    height: lerp(g.rightHeight / 2, height), outer: lerp(20 * scale, 0),
    inner: lerp(20 * scale, 0) + Math.sin(Math.PI * progress) * 60 * scale, top: 0,
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
  const softness = 8 * scale * Math.sin(Math.PI * progress) ** 2;
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
  // Release old pixel measurements before measuring a resized layout.
  socialSlot.style.width = '';
  socialSlot.style.height = '';
  installationSlot.style.height = '';
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
    scale: left.height / 52,
  };
}

// Banner morph is TIME-based, not scroll-based (issue #9, refined): crossing
// mergeAt triggers a short animation that plays through to completion even if
// scrolling stops immediately, so there is never a persistent middle state.
// Scrolling back re-triggers the reverse the same way. 400ms, sigmoid easing
// (slow start, fast middle, slow settle).
const BANNER_MORPH_MS = 400;
let bannerProgress = 0; // 0 = hero/pinned, 1 = merged bar
let morphDir = -1;      // 1 = merged side, -1 = unmerged side
let morphRaf = 0;
let morphStart = 0;
let morphFrom = 0;

// Logistic sigmoid, normalized to hit exactly 0 at t=0 and 1 at t=1:
// slow start, fast middle, slow settle.
function sigmoid(t) {
  const k = 8;
  const s = x => 1 / (1 + Math.exp(-k * (x - 0.5)));
  const s0 = s(0);
  const s1 = s(1);
  return (s(t) - s0) / (s1 - s0);
}

function applyBannerState(progress) {
  const g = controlGeometry;
  const lerp = (a, b) => a + (b - a) * progress;
  const height = 60 * g.scale;
  const bannerTop = lerp(0, (height - g.height) / 2);
  banner.hidden = false;
  // The SVG paths already use viewport coordinates. Only share the vertical
  // offset with the social pill; applying a second horizontal offset would
  // make the background drift away from both controls during reversal.
  banner.style.setProperty('--banner-top', `${bannerTop}px`);
  banner.style.setProperty('--banner-height', `${height}px`);
  // The center title rides the merged banner's vertical center line.
  centerTitle.style.setProperty('--banner-center-y', `${bannerTop + height / 2}px`);
  social.style.left = `${g.left}px`;
  social.style.top = `${bannerTop}px`;
  installation.style.left = `${lerp(g.right, window.innerWidth - g.rightWidth - 12 * g.scale)}px`;
  installation.style.top = `${-g.rightHeight / 2}px`;
  installation.style.height = `${g.rightHeight}px`;
  installation.style.setProperty('--download-top', `${lerp(g.buttonTop, g.rightHeight / 2 + (height - 34 * g.scale) / 2)}px`);
  installation.style.setProperty('--download-width', `${lerp(g.buttonWidth, 132 * g.scale)}px`);
  installation.style.setProperty('--download-height', `${lerp(g.buttonHeight, 34 * g.scale)}px`);
  installation.style.setProperty('--download-radius', `${lerp(12, 12) * g.scale}px`);
  installation.style.setProperty('--download-font-size', `${lerp(22, 18) * g.scale}px`);
  // Keep the command scrolling upward after the lower panel pins.
  installation.style.setProperty('--command-shift', `${-(window.scrollY - g.mergeAt)}px`);
  drawLiquidBanner(g, progress, height);
}

function clearBannerStyles() {
  social.style.left = '';
  social.style.top = '';
  installation.style.left = '';
  installation.style.top = '';
  installation.style.height = '';
  banner.style.removeProperty('--banner-top');
  banner.style.removeProperty('--banner-height');
  centerTitle.style.removeProperty('--banner-center-y');
}

function startMorph() {
  morphFrom = bannerProgress;
  morphStart = performance.now();
  cancelAnimationFrame(morphRaf);
  morphRaf = requestAnimationFrame(morphStep);
}

function morphStep(now) {
  const target = morphDir === 1 ? 1 : 0;
  if (morphFrom === target) { morphRaf = 0; return; }
  const t = reducedMotion.matches ? 1 : Math.min(1, (now - morphStart) / BANNER_MORPH_MS);
  bannerProgress = morphFrom + (target - morphFrom) * sigmoid(t);
  // Keep the banner visible for every intermediate reverse frame, including
  // the final frame just before the original controls are restored.
  if (bannerProgress > 0 || morphFrom > 0) {
    social.classList.add('is-banner');
    installation.classList.add('is-banner');
    applyBannerState(bannerProgress);
  }
  if (t >= 1) {
    morphRaf = 0;
    if (bannerProgress >= 1) {
      social.classList.add('entrance-complete');
      installation.classList.add('entrance-complete');
      centerTitle.classList.add('is-visible');
    } else {
      clearBannerStyles();
      social.classList.remove('is-banner');
      installation.classList.remove('is-banner');
      banner.hidden = true;
      centerTitle.classList.remove('is-visible');
    }
    return;
  }
  morphRaf = requestAnimationFrame(morphStep);
}

function updateBanner() {
  if (!controlGeometry) return;
  const g = controlGeometry;
  const pinned = window.scrollY >= g.pinAt;
  const merged = window.scrollY >= g.mergeAt;
  const morphing = merged || morphRaf !== 0 || bannerProgress > 0;
  social.classList.toggle('is-pinned', pinned);
  social.classList.toggle('is-banner', morphing);
  installation.classList.toggle('is-banner', morphing);
  // The command has scrolled away; prevent keyboard focus behind the banner.
  command.parentElement.inert = morphing;

  if (merged && morphDir !== 1) {
    morphDir = 1;
    if (bannerProgress < 1) startMorph();
  } else if (!merged && morphDir !== -1) {
    morphDir = -1;
    centerTitle.classList.remove('is-visible');
    if (bannerProgress > 0) startMorph();
  }

  if (merged) {
    // Steady merged state; also heals inline styles cleared by
    // measureControls() on resize. While a morph is running, morphStep owns
    // the visuals.
    if (!morphRaf) applyBannerState(bannerProgress);
  } else if (bannerProgress === 0) {
    // Idle hero/pinned state: instant pinning, clean inline styles.
    cancelAnimationFrame(morphRaf);
    morphRaf = 0;
    social.style.left = pinned ? `${g.left}px` : '';
  social.style.top = pinned ? '0px' : '';
    installation.style.left = '';
    installation.style.top = '';
    installation.style.height = '';
    banner.hidden = true;
  }
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
  updateFuture();
  updateManteraction();
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
  const videoHeight = sloganVideo.getBoundingClientRect().height;
  const pinTop = viewport / 2 - videoHeight * textAnchorY;
  // Keep the initial text just below the current viewport.
  const heroBottom = document.querySelector('.hero').getBoundingClientRect().bottom + window.scrollY;
  const entranceGap = viewport * .03;
  const videoTop = viewport + entranceGap - videoHeight * textTopY;
  slogan.style.setProperty('--slogan-overlap', `${videoTop - heroBottom}px`);
  const sectionTop = slogan.getBoundingClientRect().top + window.scrollY;
  const pinStart = sectionTop - pinTop;
  // Use original document positions, not the now-persistent banner controls.
  const controlsBottom = controlGeometry.bottom;
  scrubStart = Math.max(pinStart, controlsBottom);
  scrubDistance = viewport * scrubScreens;
  const stageHeight = viewport - pinTop;
  slogan.style.setProperty('--slogan-stage-height', `${stageHeight}px`);
  slogan.style.setProperty('--slogan-top', `${pinTop}px`);
  // The heading lives in the real-life band now; end the scrub section when
  // the clip finishes so the page bottom coincides with its last frame.
  slogan.style.setProperty('--slogan-height', `${stageHeight + scrubStart - pinStart + scrubDistance}px`);
  slogan.style.setProperty('--slogan-tail', '0px');
  measureManteraction();
  measureFuture();
  updateSlogan();
}

window.addEventListener('scroll', () => {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateSlogan);
}, { passive: true });
window.addEventListener('resize', measureSlogan);
window.visualViewport?.addEventListener('resize', measureSlogan);
window.addEventListener('load', measureSlogan);
document.querySelector('.installation').addEventListener('animationend', measureSlogan);
document.fonts.ready.then(measureSlogan);
sloganVideo.addEventListener('loadedmetadata', measureSlogan);
sloganVideo.addEventListener('loadeddata', updateSlogan);
// Coalesce rapid scroll events while a previous video seek is still decoding.
sloganVideo.addEventListener('seeked', seekSlogan);
reducedMotion.addEventListener('change', updateSlogan);
measureSlogan();
const futureResizeObserver = new ResizeObserver(() => {
  measureFuture();
  updateFuture();
});
futureResizeObserver.observe(futureSection);

// The manteraction stage height drives the section's scroll height, which
// shifts the future section below it — re-measure both together.
const manteractionResizeObserver = new ResizeObserver(() => {
  measureManteraction();
  measureFuture();
  updateFuture();
  updateManteraction();
});
manteractionResizeObserver.observe(manteractionStage);

const details = document.querySelector('.real-life-details');
const features = document.querySelector('.future-features');
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  features.querySelectorAll('li').forEach((item, index) => {
    item.style.setProperty('--feature-delay', `${index * 100}ms`);
  });
  features.classList.add('reveal-pending');
  const featuresObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    features.classList.remove('reveal-pending');
    features.classList.add('reveal-visible');
    featuresObserver.disconnect();
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  featuresObserver.observe(features);
}
const nextGenerationSection = document.querySelector('.next-generation-section');
if ('IntersectionObserver' in window && !reducedMotion.matches && nextGenerationSection) {
  nextGenerationSection.classList.add('reveal-pending');
  const ngObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    nextGenerationSection.classList.remove('reveal-pending');
    nextGenerationSection.classList.add('reveal-visible');
    ngObserver.disconnect();
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  ngObserver.observe(nextGenerationSection);
}
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  details.classList.add('reveal-pending');
  const detailsObserver = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    details.classList.remove('reveal-pending');
    details.classList.add('reveal-visible');
    detailsObserver.disconnect();
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });
  detailsObserver.observe(details);
}
