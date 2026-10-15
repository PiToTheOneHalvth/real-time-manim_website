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
let futureStart = 0;
let futureDistance = 1;
let futureFadeStart = 0;
let futureFadeEnd = 1;
let futureFaded = false;
let previousFutureFade = 0;
let futureReturnReplayStarted = false;

function measureFuture() {
  const viewport = window.innerHeight;
  futureStart = futureScroll.getBoundingClientRect().top + window.scrollY;
  // One viewport: "Just You Wait." rises over a single swipe. The rest of the
  // future content now lives in the manteraction finale stack. The container
  // spans two viewports — one for the rise, one of pinned hold at the end —
  // because the page ends here and needs that room to pin the finale at all.
  futureDistance = viewport * 1.0;
  futureScroll.style.setProperty('--future-pin-top', '0px');
  futureScroll.style.setProperty('--future-scroll-height', `${viewport * 2.0}px`);
  futureScroll.style.setProperty('--future-center', `${viewport / 2}px`);
  // Fade window for "What it will have": from the section centered (top = 0)
  // to "Just You Wait." centered (entrance = 1), linear across the whole
  // span. The section holds its position through the window.
  futureFadeStart = futureStart - futureSection.offsetHeight;
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
  // The finale settles within the first half of the budget, then the pin
  // releases right as "What it will have" scrolls in from below. That section
  // is plain document flow — it never participates in this pinned phase.
  manteractionDistance = viewport * 0.7;
  manteractionScroll.style.setProperty('--manteraction-pin-top', `${pinTop}px`);
  manteractionScroll.style.setProperty('--manteraction-scroll-height', `${stage + manteractionDistance}px`);
  manteractionScroll.style.setProperty('--manteraction-center', `${viewport / 2 - pinTop}px`);
  // Stacked handoff: when the pin releases, the future section's top should
  // sit 50px below the explanation text's bottom. Both then scroll 1:1, so a
  // static margin correction pins that gap for the whole pass. The section
  // stays plain flow — the margin is geometry, not a scroll coupling.
  const touchHeight = manteractionFinale.getBoundingClientRect().height;
  const blockHeight = manteractionFinaleBlock.getBoundingClientRect().height;
  const settledBlockBottom = (viewport / 2 - pinTop) - touchHeight / 2 + blockHeight;
  const releaseSectionTop = pinTop + stage;
  // The visible handoff is the h2, which starts one top-padding below the
  // section box — subtract that padding so the heading itself lands 50px
  // under the explanation text.
  const sectionPadding = parseFloat(getComputedStyle(futureSection).paddingTop) || 0;
  futureSection.style.marginTop = `${50 - (releaseSectionTop - settledBlockBottom) - sectionPadding}px`;
}

function updateManteraction() {
  const progress = Math.max(0, Math.min(1, (window.scrollY - manteractionStart) / manteractionDistance));
  const smooth = value => value * value * (3 - 2 * value);
  const settle = Math.max(0, Math.min(1, (progress - .05) / .50));
  const viewport = window.innerHeight;
  const touchHeight = manteractionFinale.getBoundingClientRect().height;
  // "You'll touch it." rises from below the viewport and settles centered with
  // the details flush beneath it. That ends the pinned phase: the stack then
  // scrolls off naturally and "What it will have" follows in normal flow.
  const startY = viewport / 2 + touchHeight;
  const settleY = -touchHeight / 2;
  const y = startY + (settleY - startY) * smooth(settle);
  manteractionScroll.style.setProperty('--manteraction-stack-y', `${y}px`);
  manteractionScroll.style.setProperty('--manteraction-visibility', progress >= .1 ? 'visible' : 'hidden');
  manteractionScroll.style.setProperty('--manteraction-opacity', 1 - smooth(Math.min(1, progress * 3)));
  manteractionStage.setAttribute('aria-hidden', progress >= .4 ? 'true' : 'false');
  manteractionFinaleBlock.setAttribute('aria-hidden', progress < .1 ? 'true' : 'false');
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
    installTop: right.top + window.scrollY,
    installTop: right.top + window.scrollY,
    mergeAt: right.top + window.scrollY + right.height / 2,
    bottom: Math.max(left.bottom, right.bottom) + window.scrollY,
    buttonTop: button.top - right.top, buttonWidth: button.width, buttonHeight: button.height,
    scale: left.height / 52,
  };
}

function applyBannerState(progress) {
  const g = controlGeometry;
  const lerp = (a, b) => a + (b - a) * progress;
  const height = 60 * g.scale;
  const bannerTop = lerp(0, (height - g.height) / 2);
  banner.hidden = false;
  // The SVG paths and both controls use the same scroll-derived progress, so
  // dragging the page never leaves an element in a time-based middle state.
  banner.style.setProperty('--banner-top', `${bannerTop}px`);
  banner.style.setProperty('--banner-height', `${height}px`);
  // The center title rides the merged banner's vertical center line.
  centerTitle.style.setProperty('--banner-center-y', `${height / 2}px`);
  social.style.left = `${g.left}px`;
  social.style.top = `${bannerTop}px`;
  installation.style.left = `${lerp(g.right, window.innerWidth - g.rightWidth - 12 * g.scale)}px`;
  // At progress 0, this is exactly the installation panel's natural viewport
  // position when its midpoint reaches the top edge. Further scroll is carried
  // by --command-shift while the panel itself stays in the banner.
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
  installation.style.removeProperty('--download-top');
  installation.style.removeProperty('--download-width');
  installation.style.removeProperty('--download-height');
  installation.style.removeProperty('--download-radius');
  installation.style.removeProperty('--download-font-size');
  installation.style.removeProperty('--command-shift');
  banner.style.removeProperty('--banner-top');
  banner.style.removeProperty('--banner-height');
  centerTitle.style.removeProperty('--banner-center-y');
}

function updateBanner() {
  if (!controlGeometry) return;
  const g = controlGeometry;
  const pinned = window.scrollY >= g.pinAt;
  const merged = window.scrollY >= g.mergeAt;
  const morphDistance = window.innerHeight * .15;
  const scrollProgress = Math.max(0, Math.min(1, (window.scrollY - g.mergeAt) / morphDistance));
  const progress = reducedMotion.matches && merged ? 1 : scrollProgress;
  social.classList.toggle('is-pinned', pinned);
  social.classList.toggle('is-banner', merged);
  installation.classList.toggle('is-banner', merged);
  // The command has scrolled away; prevent keyboard focus behind the banner.
  command.parentElement.inert = merged;

  if (merged) {
    applyBannerState(progress);
    if (progress >= 1) {
      social.classList.add('entrance-complete');
      installation.classList.add('entrance-complete');
      centerTitle.classList.add('is-visible');
    } else {
      centerTitle.classList.remove('is-visible');
    }
    return;
  }

  clearBannerStyles();
  social.classList.remove('is-banner');
  installation.classList.remove('is-banner');
  centerTitle.classList.remove('is-visible');
  social.style.left = pinned ? `${g.left}px` : '';
  social.style.top = pinned ? '0px' : '';
  banner.hidden = true;
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
