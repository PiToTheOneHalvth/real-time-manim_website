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
const futureSection = document.querySelector('.future-section');
const futureFinale = document.querySelector('.future-finale');
const manteractionFutureContainer = document.querySelector('.manteraction-future-container');
let futureStart = 0;
let futureDistance = 1;
let futureFadeStart = 0;
let futureFadeEnd = 1;
let futureFaded = false;
let previousFutureFade = 0;
let futureReturnReplayStarted = false;

function measureFuture() {
  const viewport = window.innerHeight;
  // Start the finale wrapper where the future section reaches the viewport,
  // while keeping its full scroll budget for the title's rise and hold.
  futureScroll.style.marginTop = `${-futureSection.offsetHeight}px`;
  futureStart = futureScroll.getBoundingClientRect().top + window.scrollY;
  // One viewport: "Just You Wait." rises over a single swipe. The rest of the
  // future content now lives in the shared manteraction/future container. The
  // wrapper spans two viewports — one for the rise, one of pinned hold at the
  // end — because the page ends here and needs that room to pin the finale at
  // all.
  futureDistance = viewport * 1.0;
  futureScroll.style.setProperty('--future-pin-top', '0px');
  futureScroll.style.setProperty('--future-scroll-height', `${viewport * 2.0}px`);
  futureScroll.style.setProperty('--future-center', `${viewport / 2}px`);
  // Fade window for "What it will have": from the section centered (top = 0)
  // to "Just You Wait." centered (entrance = 1), linear across the whole
  // span. The section holds its position through the window.
  futureFadeStart = futureStart;
  futureFadeEnd = futureStart + futureDistance;
}

function updateFuture() {
  const progress = Math.max(0, Math.min(1, (window.scrollY - futureStart) / futureDistance));
  // "What it will have" stays fixed in place and fades out linearly from the
  // moment the section is centered until "Just You Wait." is centered —
  // completely invisible exactly at that final state.
  const windowScroll = Math.max(0, Math.min(1, (window.scrollY - futureFadeStart) / (futureFadeEnd - futureFadeStart)));
  // Replay the item entrance as soon as the pinned section starts returning
  // upward. The parent opacity remains scroll-linked, so the replay and the
  // section's fade/parallax run independently instead of one hiding the other.
  const fadePassed = windowScroll >= 0.5;
  const goingUp = windowScroll < previousFutureFade;
  const goingDown = windowScroll > previousFutureFade;
  if (goingDown) {
    futureReturnReplayStarted = false;
  }
  if (goingUp && futureFaded && !futureReturnReplayStarted) {
    replayFeatures();
    futureReturnReplayStarted = true;
  }
  futureSection.style.opacity = `${1 - windowScroll}`;
  manteractionFutureContainer.style.setProperty('--future-surface-opacity', `${1 - windowScroll}`);
  futureSection.setAttribute('aria-hidden', windowScroll >= 1 ? 'true' : 'false');
  futureFaded = fadePassed;
  previousFutureFade = windowScroll;
  // "Just You Wait." rises over the fading section.
  const entrance = Math.max(0, Math.min(1, (progress - .25) / .75));
  const travel = window.innerHeight / 2 + futureFinale.getBoundingClientRect().height / 2 + 1;
  futureScroll.style.setProperty('--finale-offset', `${travel * (1 - entrance)}px`);
  futureScroll.style.setProperty('--finale-visibility', entrance > 0 ? 'visible' : 'hidden');
  futureFinale.setAttribute('aria-hidden', progress <= .25 ? 'true' : 'false');
}

const manteractionScroll = document.querySelector('.manteraction-scroll');
const manteractionStage = document.querySelector('.manteraction-stage');
const manteractionFinaleBlock = document.querySelector('.manteraction-finale-block');
const manteractionFinale = document.querySelector('.manteraction-finale');
let manteractionStart = 0;
let manteractionDistance = 1;

function measureManteraction() {
  const viewport = window.innerHeight;
  const stage = manteractionStage.getBoundingClientRect().height;
  const pinTop = Math.min(0, viewport - stage);
  manteractionStart = manteractionScroll.getBoundingClientRect().top + window.scrollY - pinTop;
  // The finale settles within the first half of the manteraction budget, then
  // the pin releases before the future feature phase begins. Both phases remain
  // siblings inside the shared outer container; the measured clearance below
  // prevents the absolutely positioned finale block from intruding into the
  // future heading/list on narrow screens.
  manteractionDistance = viewport * 0.7;
  const finaleHeight = manteractionFinaleBlock.getBoundingClientRect().height;
  const touchHeight = manteractionFinale.getBoundingClientRect().height;
  const finaleReserve = viewport - pinTop + touchHeight + finaleHeight + 24;
  const settledY = -touchHeight / 2;
  const sectionPadding = parseFloat(getComputedStyle(futureSection).paddingTop) || 0;
  // Place the visible heading 10px below the settled explanation, accounting
  // for the sticky stage's height and the future section's existing padding.
  const handoffClearance = (viewport / 2 - pinTop) + settledY + finaleHeight + 10 - stage - sectionPadding;
  manteractionScroll.style.setProperty('--manteraction-pin-top', `${pinTop}px`);
  manteractionScroll.style.setProperty('--manteraction-scroll-height', `${Math.max(stage + manteractionDistance, finaleReserve)}px`);
  manteractionScroll.style.setProperty('--manteraction-center', `${viewport / 2 - pinTop}px`);
  // Adjust only the static handoff spacing; preserve the scroll budget, pin,
  // background, and both sections' animation settings.
  futureSection.style.marginTop = `${handoffClearance}px`;
}

function updateManteraction() {
  const progress = Math.max(0, Math.min(1, (window.scrollY - manteractionStart) / manteractionDistance));
  const smooth = value => value * value * (3 - 2 * value);
  const settle = Math.max(0, Math.min(1, (progress - .05) / .50));
  const viewport = window.innerHeight;
  const touchHeight = manteractionFinale.getBoundingClientRect().height;
  // The heading settles centered with the explanation beneath it, holds until
  // the pin releases, and then scrolls off with the following future content.
  const startY = viewport / 2 + touchHeight;
  const settleY = -touchHeight / 2;
  const y = startY + (settleY - startY) * smooth(settle);
  manteractionScroll.style.setProperty('--manteraction-stack-y', `${y}px`);
  manteractionScroll.style.setProperty('--manteraction-visibility', progress >= .1 ? 'visible' : 'hidden');
  manteractionScroll.style.setProperty('--manteraction-opacity', 1 - smooth(Math.min(1, progress * 3)));
  manteractionStage.setAttribute('aria-hidden', progress >= .4 ? 'true' : 'false');
  manteractionFinaleBlock.setAttribute('aria-hidden', progress < .1 ? 'true' : 'false');
  // Give the future content its own entrance after the touch block settles:
  // start below the viewport, then rise to 10px beneath the explanation.
  // Move only the content: the measured section and finale fade stay untouched.
  const sectionPadding = parseFloat(getComputedStyle(futureSection).paddingTop) || 0;
  const contentTop = Math.max(0, manteractionFinaleBlock.getBoundingClientRect().bottom + 10 - sectionPadding);
  const entrance = Math.max(0, Math.min(1, (progress - .55) / .45));
  const belowScreen = Math.max(contentTop, viewport + 1 - sectionPadding);
  const entranceTop = belowScreen + (contentTop - belowScreen) * smooth(entrance);
  const sectionTop = Math.max(0, futureSection.getBoundingClientRect().top);
  futureSection.style.setProperty('--future-handoff-offset', `${entranceTop - sectionTop}px`);
}
const social = document.querySelector('.social-links');
const installation = document.querySelector('.installation');
const banner = document.querySelector('.banner-background');
const bannerTitle = banner.querySelector('.banner-title');
const bannerSocial = banner.querySelector('.banner-social');
const bannerDownload = banner.querySelector('.banner-download');
// The controls turn into a bar over one and a half viewports: first the
// background particles stream across the top (network-background.js listens for
// this), then the bar itself wipes in from the right, its contents travelling
// with the wipe. The hero controls are not moved or frozen: they simply scroll
// away.
const BANNER_SWEEP_SCREENS = 1.5;
let controlGeometry;

bannerTitle.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
});

function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function measureControls() {
  // Only document positions matter now: the bar is its own element.
  const left = social.getBoundingClientRect();
  const right = installation.getBoundingClientRect();
  controlGeometry = {
    mergeAt: Math.min(left.top, right.top) + window.scrollY,
    bottom: Math.max(left.bottom, right.bottom) + window.scrollY,
  };
}

function updateBanner() {
  const g = controlGeometry;
  if (!g) return;
  const distance = Math.max(1, window.innerHeight * BANNER_SWEEP_SCREENS);
  const progress = reducedMotion.matches
    ? (window.scrollY >= g.mergeAt ? 1 : 0)
    : Math.max(0, Math.min(1, (window.scrollY - g.mergeAt) / distance));
  // The bar's fill follows the stream's right edge: wherever the particles have
  // cleared, the bar is already there, so no black seam opens between them.
  const travel = Math.max(0, Math.min(1, (progress - 0.12) / 0.74));
  const bandRight = Math.max(0, (window.innerWidth * 2 + 640) * (1 - travel));
  const wipe = Math.max(0, Math.min(1, 1 - bandRight / window.innerWidth));
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
// The network script registers its sweep listener after this file runs, so
// re-publish the current progress once the deferred batch has finished.
requestAnimationFrame(updateBanner);
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
features.querySelectorAll('li').forEach((item, index) => {
  item.style.setProperty('--feature-delay', `${index * 100}ms`);
});
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

// Feature lists: the first pass plays a staggered fade-in + shift-right
// entrance (`.reveal-pending` → `.reveal-visible`, 100ms stagger). Each
// later visibility event replays the same entrance: scrolling the section
// back into view from above (IntersectionObserver) or fading it back in
// from "Just You Wait." (the fade-crossing in updateFuture). Scroll
// position never drives or reverses either animation.
const replayFeatures = () => {
  if (reducedMotion.matches) return;
  if (features.classList.contains('reveal-pending')) return;
  // Remove the class, flush the style change, re-add: restarts the
  // staggered entrance from frame zero.
  features.classList.remove('features-returning');
  void features.offsetWidth;
  features.classList.add('features-returning');
};
if ('IntersectionObserver' in window && !reducedMotion.matches) {
  features.classList.add('reveal-pending');
  let featuresEnteredOnce = false;
  const featuresObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        if (!featuresEnteredOnce) {
          featuresEnteredOnce = true;
          features.classList.remove('reveal-pending');
          features.classList.add('reveal-visible');
          continue;
        }
        replayFeatures();
      } else if (entry.boundingClientRect.bottom < 0) {
        featuresEnteredOnce = true;
      }
    }
  }, { rootMargin: '0px 0px -15% 0px', threshold: 0 });
  featuresObserver.observe(features);
}
