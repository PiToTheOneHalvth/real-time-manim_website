The gap below the complete “You’ll touch it.” explanation was reduced from 50px to 10px by changing only the static handoff margin in `measureManteraction()`. Browser checks at 1440×900, 390×844, 240×700, and 1440×600 measured a 10px gap within subpixel rounding, with no visible content overlap or horizontal overflow. All eight feature items replayed, and the existing finale fade and centered endpoint passed. Background, CSS, HTML, starfield, pan/zoom, animation timing, and scroll budgets remained unchanged.

# Website architecture

## NOTE: this architecture is fully-AI generated. scrintinize it as any other AI-generted content

The Manteraction finale and “What it will have” share one full-width `.manteraction-future-container`: it wraps `.manteraction-scroll`, `.future-section`, and `.future-scroll`, carries the single gray surface and outer hairlines, and fades that surface to transparent as “Just You Wait.” reaches center. The child future section is transparent so there is no inner boundary. Its static margin is measured from the settled finale block to the visible future heading, leaving a 10px content gap; transparent section padding can overlap the preceding layout box without the text overlapping.

The architecture and Manteraction basis areas now use two full-width sibling `band` sections, matching the existing “Real time, real life.” container treatment instead of small rounded outer cards. The architecture band is explicitly black (`var(--background)`), while the artifact band keeps the gray `var(--band)` surface; the architecture band keeps its diagram placeholder as an inner bordered work area, and the artifact band contains the existing sticky Manteraction stage with no extra horizontal card margin. At 1440×900 and 390×844, both bands span the viewport width, remain vertically separate, and have no browser errors. The “What it will have” sticky section now starts with the same gray `var(--band)` surface and uses its existing `opacity: 1 → 0` handoff to fade the whole viewport-sized section to black exactly as “Just You Wait.” reaches center.

Both next-generation mind-map cards were reduced from 90% to 80% of the available content width. Their flex sizing changed to `.75 1 0`, using three quarters of the remaining vertical space rather than filling it, while each group retained its `100svh` minimum height and centered alignment. At 1440×900 the ManimCE card changed from 1140.5×547.5px to 1013.8×411.1px, and the Vulkan card from 1140.5×522.1px to 1013.8×392.0px. Desktop, phone, narrow-screen, and short-viewport checks preserved the whole-diagram initial fit; fullscreen sizing, pan, pinch zoom, and recenter remained unchanged.

The merged banner now keeps the centered `real-time-manim` title visible while the
taskbar is fully formed. On upward return, the title fades out over 600 ms before
the social/download reverse morph begins; the taskbar and Download geometry stay
at their completed positions during that fade, and reversing direction cancels the
hold.

The “Just You Wait.” finale now starts after the shared Manteraction/future container's feature phase: `measureFuture()` gives `.future-scroll` a `margin-top` of `-futureSection.offsetHeight`, so the two-viewport finale wrapper begins at the future section's document top inside the same outer container. The initial CSS fallback is a `1px` finale offset, and the runtime entrance state places the title's top edge `1px` below the viewport before its one-viewport rise; the future-section fade origin is measured from the section itself.

The Manteraction copy now describes the product as entirely UI-driven: the live product page says no coding is needed and removes the supplemental coding platform claim. The feature list uses “Manteraction is entirely UI-driven,” and the matching Manteraction and real-time-manim markdown drafts carry the same UI-only intent.

Issue #17 keeps the full right-aligned real-life details heading `Real time, real life.` so the section topic is unchanged. At widths below `280px`, the heading scales with `clamp(18px, 10.8vw, 28px)`; at a 240px viewport it remains one line and moves the image up by 30.8px instead of reserving a wrapped row.

The eight feature items now have `6vw` outer padding, a responsive center
gutter (`clamp(24px, 6vw, 86px)`), and content-sized rows with at least
`clamp(18px, 3svh, 32px)` between items. Remaining vertical room is distributed
evenly inside the pinned section, and long labels wrap within the padded columns.

The “What it will have” section pins with `position: sticky` at the viewport
top (z-index 1) instead of riding the Manteraction scroll wrapper. A linear
fade runs across the whole pinned span: it starts when the section is
centered (top = 0) and reaches opacity 0 exactly when “Just You Wait.” is
centered, computed from the section height and the stage distance rather
than a percentage window. The section holds its position through the fade,
and the finale block carries z-index 1 so its text stays above the fading
section’s stacking context. `aria-hidden` flips on at completion.

The eight feature items now play their staggered entrance on the first pass
as well: `.reveal-pending` → `.reveal-visible` triggers the 650 ms fade-in
plus 24 px shift-right (translateX(−24px) → 0, 100 ms stagger per item).
Returning to the section replays the same entrance. Because the section stays
sticky and intersecting while “Just You Wait.” is pinned, the scroll-back replay
starts on the first upward reversal after the fade has begun; the observer still
handles re-entry from above. On that return, the replayed leaf animation and the
parent's scroll-linked opacity/parallax run independently, so neither effect
suppresses the other. Reduced motion omits the leaf animation.

Mind-map navigation: the initial view contain-fits the whole diagram
(centered, 12 px pad) so the full pipeline is visible first. A plain
two-finger wheel now pans in both axes instead of zooming; zoom is
ctrl/meta-wheel (or pinch) around the cursor with ZOOM_SPEED 0.009 — six
times the original 0.0015 after repeated “faster” requests, reaching the
ZOOM_MAX 4 cap in about five wheel events where it took twenty-five. Below
fitK and above ZOOM_MAX the raw scale is visually resisted (0.7·floor +
0.3·raw) and eases back with a recovery glide. A pinch that stops keeps
gliding: after a 100 ms idle the EMA-smoothed log-space velocity continues
with exponential decay (τ ≈ 159 ms) around the gesture’s last focal point,
handing off to the recovery glides at the resisted zones; any input cancels
it. All glides integrate real elapsed time, so throttled tabs animate
identically to 60 fps ones.

The Starts-from picture is centered across the full grid width
(`display: contents` on the copy wrapper, grid-column 1 / −1,
width min(50%, 720px)); the two follow-up paragraphs moved to the left
column, left-aligned, while the first paragraph stays in the right column.

The “What it will have” section remains sticky during its finale transition. Its heading and eight-feature grid fade out through the full pinned handoff window from the section's centered position until “Just You Wait.” is centered, while the final title rises into the center. The section itself is transparent inside the shared gray outer container, whose surface opacity follows the same handoff and reaches zero with the finale. Scrolling upward keeps the same parent opacity fade active in reverse; once the section has begun fading, the feature items independently replay their 650 ms fade-in from 24 px left with a 100 ms stagger.

The parent fade and the leaf-item replay are deliberately separate: the parent
keeps the sticky/parallax position and scroll-linked opacity, while the list items
own the fade-and-shift keyframes. This prevents either animation from replacing
the other during the upward return.

The shared `.manteraction-future-container` owns the continuous gray surface and outer hairlines. `.manteraction-scroll` retains its 0.7 viewport pinned budget and existing finale reserve. `measureManteraction()` computes the separate future-section margin from the settled explanation bottom, stage height, and section padding to leave 10px before the next visible heading. The future heading/features remain sticky through their own fade, and the independent feature-entry animation may run at the same time.

The feature section remains outside the Manteraction pin, follows normal document flow, and now sits inside the same full-width outer container as the finale. On first downward arrival it is fully visible with no fade-in. Its later fade-out is controlled by the shared-container handoff as the “Just You Wait.” stage rises.

The Manteraction introduction uses two responsive columns. The supplied
manteraction_placeholder.png sits on the left, with its top edge aligned
to the explanation paragraph itself. The title occupies a separate row above
the paragraph on the right.

Each return from the finale triggers a time-based 650ms fade-in and rightward
slide from a 24px left offset, retaining the 100ms feature stagger. This
animation completes independently of scroll direction and re-arms on reaching
the finale again. The section's overall scroll fade remains reversible;
reduced motion omits the individual feature animations.

The future handoff remains a two-viewport window: the section is sticky while
its heading and feature grid fade across the full handoff, and “Just you wait.”
rises from below to the center. The parent fade is reversible on upward scrolling;
the independently staggered feature replay can run during that reversal.

The heading now reads “Next generation of Manim Animation” as supplied.
reference_for_real_time_manim/real-time-manim-bessel-placeholder.png sits below
it in the right column, scaling proportionally. The section remains unfinished.

The next-generation section is split into two full-viewport screens
(`.next-generation-screen`, `min-height: 100svh`): screen one holds the heading,
the “Manim plays…” paragraph and the ManimCE pipeline mind map; screen two
holds “We verified the trick…”, the Vulkan pipeline mind map and the closing
line. Each mind-map card occupies 80% of the content width and flexes to
use three quarters of the remaining height; the centered group leaves
breathing room above and below. The diagram contain-fits the card — the
whole map visible, centered with a small margin, pan/zoom to explore
(double-click resets). Heading, paragraph and full map remain visible
at once; the fullscreen overlay still uses its original full-size layout.

## Work-in-progress note

**Next generation manim animation part unfinished.** Keep this status until
the user supplies the remaining content/design. An HTML comment and horizontal
separator mark the boundary after that section. The next section is the
right-aligned “Basis of earth-shaking artifact” introduction, linking
Manteraction to pages/en/manteraction.html and emphasizing “interactive.” Its HTML
also retains the requested note about animating interactive elements.

“Next generation manim animation” follows in the left column beneath the image
row. It has its own once-per-load scroll reveal: 650ms fade and 24px upward
slide, respecting reduced motion independently of the earlier image delay.

The pipeline paragraph section reveals once per page load on entering view:
a 650ms fade with a 24px upward slide. The observer disconnects after triggering,
so scrolling upward does not reverse or replay it. The supplied
mac_interaction_placeholder.png sits in the left column and uses the same
animation with a 500ms start delay after the copy. Reduced motion skips both.

## Organization

pages/ now holds en/ and cn/ subfolders; cn/ is empty until Chinese pages
are requested. Five HTML files live in pages/en/. Only real_time_manim.html
is implemented; manteraction.html, try.html, wiki.html, and phormation.html
remain empty until their designs are requested. There is no overall index or
redirect.
Runtime styles, scripts, and images live under assets/. No build step is needed.
Because the pages sit one directory deeper than the repository root, their
asset references climb two levels (../../assets/ and
../../reference_for_real_time_manim/); moving a page between directories
requires adjusting these prefixes.

## Responsive sizing

All control dimensions use --unit, a viewport-width-based scale bounded between
0.75 and 1.5 of the original 1440px layout. The original fixed panel width is now
responsive. Icon sizes, radii, panel padding, text and banner destinations share
that scale. Installation height remains twice the social pill's height.
Below 600px, hero controls occupy separate rows. Details remain on the right half
and wrap long words. The topic scales to fit the available width and height.

The video width is min(88vw, 120svh) to keep the slogan more compact while
remaining responsive in short viewports.
The topic retains its 6vw right inset and 8% bottom inset independently of the
video width. Scroll geometry is remeasured on window and visual viewport resize;
old slot sizes are cleared first. Banner morph distance is 15% of viewport
height; the initial slogan gap is 3%. These override earlier fixed dimensions.

## Top taskbar

A taskbar strip sits at the very top of the page (z-index 3): nav links on
the left, the download pill on the right, height var(--taskbar-h), hairline
bottom border. Once the page scrolls, the liquid banner takes over the top
edge.

## RTM hero

The desktop design uses Times New Roman, #000000 background, #F5F5F5 foreground,
and #292929 controls. The stacked title is on the left, supplied logo on the
right. The social pill starts as a 52px-high stadium. The installation panel
starts as a 280x104px rounded rectangle, twice the social pill's height.
The pip command and white Download button share the installation panel.
Narrow windows use the responsive layout described above.

## Scroll banner

The social pill pins at its original top-edge threshold. At the installation panel's
midpoint, the lower panel also becomes fixed at its exact current viewport position;
over the next `15%` of viewport height (`135px` at a 900px viewport), shared linear
progress moves the panel horizontally, shrinks/repositions Download, and grows the
liquid contour. The command continues upward by the actual scroll delta, so stopping
the page freezes every intermediate element; reverse dragging retraces the same
mapping. The center title appears only at progress 1.

## Slogan video

The section embeds reference_for_real_time_manim/slogan.mp4 directly. Hermes
measured the first-frame text center at y=539/1080 and top at y=414/1080.
At scroll zero the visible text begins 24px below the viewport bottom. Video
width is 120vw, centered and clipped horizontally; height remains proportional.
The position is remeasured on resize, font load, and metadata load.

The text pins at viewport center on frame zero until the original hero controls
would have left view. Further scrolling scrubs the silent 60fps clip forward or
backward over one viewport. The final sample is frame 59. Banner timing uses
the original control positions, not their pinned positions. Reduced-motion
users see the first video frame and the final banner without the morph.

## Verification

After the topic entrance completes, the slogan's sticky section releases into
normal document scrolling. The supplied two-paragraph Vulkan/pipeline copy
overlaps the section's trailing blank space by 4svh with no top padding,
leaving approximately 4vh below the heading, right-aligned between the viewport midpoint and
the existing 6vw right inset. The supplied placeholder image occupies the left
column, with a 4vw gap before the copy. The image scales proportionally and its
intrinsic dimensions reserve space before loading. Both columns share the
one-time reveal trigger; the section scrolls normally without pinning.

After the video scrub completes, another 0.7 viewport of scrolling brings the
bold right-aligned heading “Real-time, real-life.” upward from below the screen.
The final frame remains pinned during the entrance. The heading ends 8% of the
viewport height above the bottom and 6% of the viewport width from the right,
recalculated on browser resize. Width-responsive
type scales from 44px to 104px. The sticky stage clips excess black video padding
with enough space to reveal the lowered heading on shorter screens. Reverse scrolling
lowers the heading before reversing the video.

Check local asset paths, initial silhouettes, scroll/reverse thresholds,
continuous gray merge, visible social links, and the smaller Download button.
Check browser rendering independently of mathematical geometry tests.
