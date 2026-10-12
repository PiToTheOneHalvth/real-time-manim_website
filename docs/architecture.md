# Website architecture

The pipeline paragraph section reveals once per page load on entering view:
a 650ms fade with a 24px upward slide. The observer disconnects after triggering,
so scrolling upward does not reverse or replay it. Reduced motion skips it.

## Organization

Five HTML files live in pages/. Only real_time_manim.html is implemented;
manteraction.html, try.html, wiki.html, and phormation.html remain empty until
their designs are requested. There is no overall index or redirect.
Runtime styles, scripts, and images live under assets/. No build step is needed.

## Responsive sizing

All control dimensions use --unit, a viewport-width-based scale bounded between
0.75 and 1.5 of the original 1440px layout. The original fixed panel width is now
responsive. Icon sizes, radii, panel padding, text and banner destinations share
that scale. Installation height remains twice the social pill's height.
Below 600px, hero controls occupy separate rows. Details remain on the right half
and wrap long words. The topic scales to fit the available width and height.

The video width is min(120vw, 160svh) to keep its text within short viewports.
The topic retains its 6vw right inset and 8% bottom inset independently of the
video width. Scroll geometry is remeasured on window and visual viewport resize;
old slot sizes are cleared first. Banner morph distance is 15% of viewport
height; the initial slogan gap is 3%. These override earlier fixed dimensions.

## RTM hero

The desktop design uses Times New Roman, #000000 background, #F5F5F5 foreground,
and #292929 controls. The stacked title is on the left, supplied logo on the
right. The social pill starts as a 52px-high stadium. The installation panel
starts as a 280x104px rounded rectangle, twice the social pill's height.
The pip command and white Download button share the installation panel.
Narrow windows use the responsive layout described above.

## Scroll banner

The social pill pins at the top edge first. At the original installation panel
midpoint, its lower half pins too. Over 120px of scrolling, one new solid gray
SVG contour grows from the two solids with a smooth fluid union. Its outer edges
travel from their initial inset positions to the screen edges, keeping the first
frame visually stable. The original two shapes stay behind the new contour until
it covers them completely, then are hidden. There is no splice, bridge, opacity
fade, or shading fade; linear scroll progress controls the reversible transition.

The social icons remain visible and clickable. The pip command continues upward
out of view. Download shrinks to a 112x26px white rounded rectangle, retaining
its text and hover effect, and moves to a 24px inset from the right edge.
The original entrance animation is disabled after a complete morph.
Placeholder slots preserve the hero layout and original scroll measurements.

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
the existing 6vw right inset. Its left half remains empty. This content has no
pinning or scroll animation; the top banner retains its existing behavior.

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
