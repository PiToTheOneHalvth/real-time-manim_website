# Website architecture

## Organization

Five HTML files live in pages/. Only real_time_manim.html is implemented;
manteraction.html, try.html, wiki.html, and phormation.html remain empty until
their designs are requested. There is no overall index or redirect.
Runtime styles, scripts, and images live under assets/. No build step is needed.

## RTM hero

The desktop design uses Times New Roman, #000000 background, #F5F5F5 foreground,
and #292929 controls. The stacked title is on the left, supplied logo on the
right. The social pill starts as a 52px-high stadium. The installation panel
starts as a 280x104px rounded rectangle, twice the social pill's height.
The pip command and white Download button share the installation panel.
Mobile design is deferred.

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

Check local asset paths, initial silhouettes, scroll/reverse thresholds,
continuous gray merge, visible social links, and the smaller Download button.
Check browser rendering independently of mathematical geometry tests.
