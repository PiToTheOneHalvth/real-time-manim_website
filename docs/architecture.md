The global graph has a black gradient strip at the top, matching the local graph's head strip: a `::before` on the viewport (absolute, top 0, full width, 64px tall, z-index 2, pointer-events: none) with the same `linear-gradient(rgba(23, 23, 23, .92), rgba(23, 23, 23, .55) 65%, transparent)` — the canvas fades into dark behind the toolbar. Verified: computed style carries the exact gradient, the strip sits at the viewport's top edge, toolbar buttons stay clickable (pointer-events none), the strip persists in fullscreen, and all three suites (local graph, search, fullscreen) remain green with zero console errors.

The local-graph panel is now edge-to-edge: the drawn graph fills the square with NO gap between the showing edge and the panel boundary. The panel's padding is gone, the svg spans the whole size×size square (position absolute, inset 0 — measured 353×353 inside the 355 panel, the 2px difference being the border), and the title/connections meta float as a translucent gradient strip over the top (pointer-events: none, so dots beneath stay hoverable). The view itself is fitted to the content's bounding box — dots plus their radii (center 26 / others 18 world units), capped at k = 6 so a lone node doesn't blow up past the zoom ceiling — so the outermost dot edges land exactly on the viewBox boundary (verified: the mapped bbox is exactly 1000 world units wide on the limiting axis, and the dot centers sit inset by exactly their screen radius). The fitted rest scale becomes the label-hiding base: labels hide below 1.2 × the fitted scale (was an absolute 1.2, which would have shown labels at rest since the fit often lands above 1.2) — hidden at rest, shown after zooming in, same feel as the global graph. Recenter now glides back to the fitted rest view (recomputed from current dot positions) instead of identity, labels re-hidden on arrival. Playwright-verified (full Chrome binary, real 8123 server): after open and after recenter the content bbox maps exactly onto the 1000-unit square (touchesEdge, bboxW 1000), recenter transform byte-equals the hand-recomputed fit, labels opacity 0 at rest and 1 after one wheel zoom, and all suites (local graph, search, fullscreen) stay green with zero console errors.

The local-graph trigger is now RIGHT-CLICK (user request, replacing Shift+Enter). Right-clicking a graph node, a search option, or a local-graph dot opens that note's local graph (replacing any open panel); the native browser menu is suppressed on every target and on the graph canvas background (svg-level contextmenu preventDefault), the keydown Shift+Enter handler is deleted, and both hints (the search label and the hover tooltip) now read `right-click` + "open local graph" as a kbd chip. Empty-space LEFT click remains the only exit; right-click on empty space does nothing. While fixing the suites around this, the real root cause of the whole "shifting behaves weird" thread surfaced and was fixed: the shift clamp built its end transform with the Transform.translate METHOD, which in d3-zoom adds k·(dx, dy) — world-space — so every shift moved only k × the needed distance (at k = 0.46: 46%; at k = 0.25: 25%), the panel visually clamped itself so the shortfall was masked, and each re-target re-shifted a geometric remainder. The clamp now builds the end transform with the absolute identity constructor (d3.zoomIdentity.translate(clampedX, clampedY).scale(k)) and lands exactly on the binding edge (measured 393.97 → 250.72, the hand-computed hi; the reopen afterwards fits with zero shift). A half-pixel tolerance was added to the fits check so float noise on the binding edge cannot re-trigger a micro-shift. Playwright-verified (full Chrome binary, real 8123 server): right-click opens/replaces/re-targets everywhere (node, option, local dot), Shift+Enter does nothing, the shift endpoint equals the computed binding edge, reopen-after-exit shifts 0px, and all suites (local graph, search, fullscreen) are green with zero console errors.

The drag's centering forces are RESTORED to the original Obsidian model (user request 2026-10-18, superseding the zeroing below): forceX/forceY toward the origin at strength 0.1 stay active always — during the hold, after release, and through wiki re-renders. The classic elastic drag is unchanged (pickup boosts incident springs ×4, cap 0.95, reheat alphaTarget 0.35; release unpins and restores baseline strengths). The restored centering also fixes the sporadic-point ejection: with centering zeroed, the −1000 repulsion at the hot alphaTarget flung the weakly-connected notes out of the cluster (measured: the unlinked note drifted 3203 world units after a 500-unit hub drag); with centering restored it drifts ~608 units — the cluster's own periphery — and the layout settles back toward the origin after release (centroid origin distance 198 → 62 after the cool-down). A centroid-cohesion force built as a first fix was removed — the restored centering makes it unnecessary. Playwright-verified (full Chrome binary, real 8123 server): drag follows the pointer (hub 500 units), the group follows during the hold (centroid +291, follower +266), no node leaves the group (max 899.8 from the centroid), and all prior suites (local graph, search, fullscreen) stay green with zero console errors.

Opening a local graph no longer leaves a badly-placed node: the panel opens immediately at the node, and if the panel would not fit, the view glides over 400 ms with the normalized-logistic sigmoid (endpoints exactly 0/1), translate only — the zoom level is never changed. Zoomed out: the MINIMAL distance that brings the panel fully inside (the translate is clamped into the feasible interval per axis with the standard margin/floor, so an axis that already fits is untouched and the panel ends exactly at a binding edge — the earlier "19.7px at k = 0.25" reading was the pre-fix k·(needed) shortfall artifact; the clamp now lands exactly on the binding edge at every zoom level). Zoomed in (k > 1): the node glides to the comfortable 20% / 22% viewport anchor instead of being jammed against a boundary (measured k 1.262 → 1.262 with the node at exactly 20%/22%). While the view slides, hover feedback is frozen (shiftingView guard on node and search-option pointer handlers) so the highlight doesn't flicker across whatever the sweep passes under the cursor — it re-settles on the panel's node when the glide ends. The glide interpolates translate only, driven by plain requestAnimationFrame + performance.now() with a 450 ms setTimeout watchdog that completes the glide if rAF stalls — d3.timer's slewed clock was found to freeze the callback mid-frame in headless while rAF kept firing, so the shift owns its clock (the watchdog also covers background-tab rAF suspension). The local-graph panel gained a recenter button (26px, top-right, same icon family as the graph toolbar): it glides the local view back to identity (whole graph visible, labels re-hidden below the 1.2 threshold) with the same 320 ms sigmoid rAF+watchdog pattern. Playwright-verified (full Chrome binary, real 8123 server, auto-reload interval cleared): panel open during the shift at 120 ms; mid-glide transform strictly between start and end with constant k; under prefers-reduced-motion the instant branch lands the panel exactly on the binding edge (bottom = viewport − 12) anchored at the node, and the zoomed-in branch lands k unchanged (1.262 → 1.262) with the node at the 20%/22% anchor; recenter resets the local transform to translate(0,0) scale(1) with labels-hidden restored; zoomed-out re-target shifts 19.7px; all three suites (local graph, search, fullscreen) green with zero console errors.

Fullscreen now goes edge-to-edge everywhere. The architecture graph and both mermaid diagram cards drop their 3svh/3vw inset, border radius, and the dimming `::after` backdrop when fullscreen: the fixed element sits at `inset: 0` spanning the viewport exactly (measured 0/0/1440×900 at 1440×900, radius 0). The local-graph panel follows the same rule — its edge clamp margin and floor drop to 0 while the graph is fullscreen, so a corner-clamped panel sits flush with the screen edge (measured bottom 899/900, previously 12px short), and its resize ceiling still stops at the viewport. The local graph's labels now hide exactly like the global graph's: the local zoom toggles `labels-hidden` below LABEL_ZOOM_THRESHOLD 1.2 (hidden at the identity rest scale, shown after zooming past 1.2 — measured opacity 0 at rest, 1 at k = 1.516), with the same 120ms fade. Local-graph nodes switched from a grab to a pointer cursor on hover (they open notes on click) with grabbing while dragging. Playwright-verified (full Chrome binary, real 8123 server, auto-reload interval cleared): arch graph and diagram card fullscreen rects exactly 0/0/1440×900 with radius 0, local panel bottom flush with the edge in fullscreen, label opacity 0→1 across the zoom threshold, computed cursor pointer, both prior suites still green, zero console errors.

2026-10-18: the architecture-graph drag fought the user — while a dot was held, the Obsidian centering forces (forceX/forceY toward the origin, strength 0.1) acted at the sustained drag alphaTarget 0.35 and kept dragging the whole graph back toward the center. The drag model now zeroes both centering forces on pickup and leaves them zeroed for the rest of the page session (a centeringZeroed flag also carries the zero through wiki-driven re-renders), so the layout neither fights the drag nor slides back toward the center after release. Playwright-measured on the 80-note graph (full Chrome binary, real 8123 server, before/after runs against the same tree with the fix stripped via route interception): with centering ON during a hold the centroid stays near the origin (origin distance 141→86→173→189→180→176 over 3.5 s, 700 ms samples) while the pinned node sits 784 world units away; with centering zeroed the centroid tracks the drag (191→62→264→385→464) and, after release, settles and STAYS where it was dropped (578→592→597 over 4 s). The first pass restored centering on release and the layout slid back to the origin during the cool-down (552→103 in 2.2 s), which the user rejected as "centering force is not zeroed" — that restore is gone. Zero console errors.

The architecture graph's search field is now Bing-style. The field carries a trailing hint `⇧` `⏎` open local graph (kbd chips, right-aligned on the input line after the "Search notes" placeholder, fading out via `:placeholder-shown` while the user types), and typing opens a dropdown of up to 8 matching notes directly below the field — each row shows the note title over its muted vault path on a #171717 panel with hairline border, radius 8, shadow, and 40vh max height. Non-matching graph nodes are dimmed to opacity .3 while typing (was .13, near-hidden — the user asked for dim, not hide) and matching nodes stay at full opacity. Hovering an option behaves exactly like hovering the graph node: highlight() drives the same brightness ladder (the matching node turns is-active white, neighbors brighten, everything else dims per the query) and the tooltip card appears next to the cursor with the note title and the `⇧` `⏎` open local graph hint. Pressing Shift+Enter while hovering an option — or any graph node — opens that note's local-graph panel, replacing any open one (the search input is an allowed keydown target so the shortcut works right after typing). While a panel is open, hovering other nodes or options still drives the brightness ladder as hover feedback but never touches the panel (pointerleave restores the panel's node as active), so Shift+Enter is the hover-then-retarget gesture. Clicking an option jumps to the note's wiki page, or switches the local graph to that note when the panel is already open; the dropdown STAYS open when the user clicks elsewhere (only typing a new query or clearing the field changes/closes it) and rebuilds on every input and graph render. Playwright-verified (full Chrome binary, real 8123 server, auto-reload interval cleared): hint glyphs ⇧/⏎ and text present and visible when empty, hidden (opacity 0) while typing; typing "page-2" lists 8 options with "Core — Page 2" first; non-matching nodes computed opacity 0.3 and matches 1; hovering an option activates exactly the matching graph node and shows the ⇧⏎ tooltip; Shift+Enter opens the panel with the option's title as header; clicking a second option while open switches the panel header; an empty-space click leaves the 8 options open; empty-space click still exits local graph mode; clicking an option navigates to wiki.html?note=index; the full previous local-graph regression suite (anchor, resize grip, drag spring-back, click navigation, meta label) passes; zero console errors.

The local-graph panel now carries a muted `x connections` label directly under the note title (the node's link weight, e.g. "15 connections" for guide/getting-started/page-2), and the local graph itself is interactive: every dot is draggable with the site's classic elastic feel — pinned (fx/fy) while held and reheated at alphaTarget 0.35 so the center and other neighbors get pulled along, then unpinned on release to spring back while the simulation cools (measured 348 world units of hold travel and a 151.7-unit spring-back within 2 s of release on an 80 px screen drag into the 1000-unit local world) — and clickable: a clean click opens that note's wiki page (measured `wiki.html?note=index` from a neighbor dot), while a drag that moved more than 4 world units suppresses the click. Hovering a dot inside the local graph highlights that dot's counterpart in the main graph (brightness feedback) and arms Shift+Enter to re-target the panel to that dot's node — the local dot's main-graph counterpart is used for the highlight and the switch, since the dots carry local-world coordinates. The local graph itself is zoomable and pannable: a d3.zoom on the local svg (scaleExtent .5–6, dblclick disabled, `touch-action: none`) transforms a `.architecture-graph-local-world` group that wraps the edge/node layers — wheel zooms at the cursor (measured k = 1.516 after one −300 wheel) and dragging the background pans (measured translate(123, 62) for a 40×20px drag), while d3.drag's stopImmediatePropagation on the dots keeps dot drags from panning the view, exactly like the main graph; dot drag coordinates stay correct under pan/zoom because d3.pointer uses getScreenCTM. Hovering a neighbor dot brightens it to white as the click affordance, with grab/grabbing cursors. Playwright-verified (full Chrome binary, real 8123 server, auto-reload interval cleared): label text equals the center node's weight, drag pins/holds/releases/springs back with the panel staying in local graph mode, click navigates, and all previous local-graph checks still pass with zero console errors.


Hovering an architecture-graph node now shows the hint `⇧` `⏎` open local graph (kbd chips) in place of the old connection count, and pressing Shift+Enter while hovering expands the hover card into a square local-graph panel — an Obsidian-style local graph of the hovered node: the hovered node plus its direct neighbors, and ONLY edges incident to the hovered node (no lines between two non-hovered neighbors; measured 12 dots / 11 edges for guide/getting-started/page-2). The panel opens with its top-left corner anchored in the right-bottom corner direction of the hovered node — node screen position + zoom-scaled dot radius + 14px — and follows the node through drags, pans, and zooms (positionLocalGraph runs from the sim tick and zoom handlers; the top-left anchor is clamped so the panel stays inside the viewport). Default size is max(240, min(400, 50% viewport width, 55% viewport height)) — 355px at 1440×900. The square resizes ONLY by dragging a diagonal grip at its bottom-right corner: the size delta is the mean of the pointer's dx/dy so it stays square, clamped between 240 and min(900, viewport − anchor − 12); top-left stays fixed, and dragging the panel body does nothing. The ONLY way to leave local graph mode is a click on empty graph space — clicking another node switches the local graph to that node, hovering other nodes gives brightness feedback without hijacking the panel, clicks on the panel itself are inert, and pan drags are suppressed by d3.zoom's click filter. The inner graph lays out in a fixed 1000-unit world (seeded per node, link rest 130–220 world units, repel −330, collision radius 52, 300 settle ticks then a 250 ms cool-down; center dot white r 26, neighbors #9a9a9a r 18, labels Times 22u) that scales with the panel via viewBox + preserveAspectRatio. One real bug was caught and fixed during verification: the first anchor added the UNSCALED world-unit dot radius to screen coordinates, drifting the panel (1−k)·r ≈ 6.5px off at k = 0.46 — radius is now multiplied by transform.k. Playwright-verified (full Chrome binary, real 8123 server, 5s auto-reload interval cleared): hint glyphs ⇧/⏎ present and no "connections" text, square panel ≥300px, 12 dots/11 center-incident edges, anchor = dot right/bottom + 14px exactly (also under viewport clamping), pointer-leave and other-node hover don't close or hijack, node click switches header while staying square, panel click inert, body drag doesn't resize, grip shrink 355→255 and grow back to the 354.8px viewport ceiling with top-left anchored, empty-space click exits and hides the tooltip, URL unchanged, zero console errors.

Wiki code blocks now carry a copy button and VS Code-style syntax highlighting. Every fenced block renders in a `.wiki-codeblock` wrapper (the pre's 28px margins moved to the wrapper) with a `.wiki-code-copy` button pinned top-right: it fades in on block hover/focus (opacity 0→1, −2px rise, 0.18s), hairline border, blur backdrop, copy glyph; clicking copies the code (navigator.clipboard on secure contexts, textarea+execCommand fallback for file://) and flips to a green check + "Copied" with a 0.25s scale pop, reverting after 1.6s (per-button timers in a Map). Highlighting is a zero-dependency tokenizer in wiki.js (`highlightTokens` + per-language configs — python/js/ts/jsx/tsx/c/cpp/h/sh/bash/shell/zsh/json/yaml/yml; mermaid and untagged fences stay plain) run when the \u0002 code-content placeholder is restored; token classes tok-com/tok-str/tok-num/tok-kw/tok-key/tok-cnst/tok-fn paint the VS Code dark+ palette (comments #6a9955 italic, strings #ce9178, numbers #b5cea8, control keywords #c586c0, definitions #569cd6, constants #569cd6, function calls #dcdcaa) on a #1e1e1e pre with #d4d4d4 text (replacing the old var(--wiki-surface)/#e9e9e9 look). markdown-features' python fence gained a string and a float for coverage. Playwright-verified: both fences wrapped + buttoned, token colors exactly rgb(86,156,214)/(220,220,170)/(106,153,85)/(206,145,120)/(181,206,168), textContent identical to source, hover reveals the button, click copies byte-identical text into the clipboard (granted permissions), is-copied state and revert timing hold, plain fence stays unhighlighted, zero console errors.

The wiki no longer renders math at all — removed at Tagin's direction (2026-10-18, "it won't be used"). Deleted: the hand-rolled mini-TeX renderer in wiki.js (~218 lines — the MATH_* maps, mathGroup, mathParse, renderMathTex, renderEnvHTML, the `$…$` inline pass, the `$$…$$` display pass and its `\u0001` placeholder), all `.mmath`/`.wiki-math-display` CSS in wiki.css (43 lines), the math-test.md note and its manifest entry, the markdown-features note's whole math section (plus its two `[[math-test]]` wikilinks and the "and math" wording in its intro), and the repeated "Inline math $E = mc^2$ and display math:" + Gaussian `$$` block template from 34 fixture notes (a Python strip of exact-`$$` pairs across all 79 notes; whitespace-only files were reverted so the diff carries only real removals). Kept deliberately: the `\$` → literal-`$` backslash escape in inline() (plain markdown escape, no math machinery) and mermaid.min.js's internally bundled KaTeX (mermaid's own copy, untouched). Playwright-verified: sidebar shows 79 notes (math-test gone), zero `.mmath`/`.wiki-math-display` in rendered index/markdown-features/reference/index, no `$$` or TeX backslashes in rendered text, zero console errors; wiki.js passes `node --check`.

The wiki sidebar is now collapsible from a chevron button in the sidebar header row (next to "Open graph", 26px, hairline-bordered). Clicking toggles `is-toc-collapsed` on `.wiki-shell`: the grid animates `grid-template-columns` from `minmax(210px, 280px)` to `minmax(42px, 42px)` (0.32s cubic-bezier(.3,.85,.35,1)) and the article reclaims the space (mid-flight widths 58px collapsing / 257px expanding — the sidebar grid item needed `min-width: 0`, without which its automatic minimum clamped the interpolating track to ~280px and the column snapped). The h1, "Open graph" link, search, status, and note list fade out (opacity 1→0, −6px slide, 0.16s, visibility flips after the fade) and back in with a 0.08s delay; the sidebar's right hairline fades to transparent and its padding eases 22px→8px, so the collapsed state is a 42px rail with no vertical line. The button is a direct child of the sidebar, absolutely positioned, and glides on both axes with the same 0.32s curve: from the header's right edge (`left: calc(100% − 48px)`, `top: 32px`) to the rail's top-left corner (`left: 8px`, `top: 28px` — measured x 231 → 8, center y 109 → 105, mid-flight samples between). The header reserves the button zone with an animating `padding-right: 38px → 0` so "Open graph" never underlaps. Its chevron rotates 90°↔−90° and `scale: .88` gives press feedback. State persists in `localStorage` (`wiki-toc-collapsed`). On mobile (≤720px, block layout) the sidebar is `position: relative` (the button's containing block — `static` would anchor it to the viewport over the taskbar), collapsed contents use `display: none` so the bar actually shrinks (354px → 29px), and the button centers in it (center 147 vs rail middle 148). Playwright-verified (full Chrome binary, real 8123 server): settled/mid-flight/persist/mobile states, border alpha 0 in the rail, button inside the rail at every sample, zero console errors.

The architecture graph now renders the wiki notes in a ten-rung brightness ladder (front = brightest): the hovered node is pure white #fff, directly linked neighbor nodes sit at #cfcfcf, edges incident to the hovered node stroke at rgba(245,245,245,.66), edges between two neighbors at .57, resting nodes at #858585 and resting edges at .28. While hovering, nodes outside the neighborhood drop to opacity .41, edges with exactly one linked endpoint stroke at .2, and edges with no linked endpoint at .12 — still visibly above the background. Line crossings are the strokes' natural overlap; a first pass rendering synthetic glow dots produced 36,563 crossing circles on the 79-note graph and was rejected, so no synthetic crossing elements remain. The classes are driven from highlight() on hover/focus/leave and search filtering, with 140 ms transitions. Playwright-verified (full Chrome binary): 79 nodes/626 edges; on hover 1 active + 12 neighbor + 66 unlinked nodes and 12 incident + 55 neighbor-edge + 489 half-unlinked + 70 unlinked edges; computed strokes/fills match the ladder exactly; zero console errors.

Both next-generation mind-map cards now enter fullscreen exactly like the architecture graph: the card itself becomes `position: fixed` at `inset: 0` (edge-to-edge, no gap, radius 0, no backdrop), the same 34px fullscreen icon button stays visible and toggles back, and Escape exits; the view refits on every toggle. The previous `.diagram-overlay` wrapper, its `4svh 4vw` padding, the ✕ close button, and the overlay move bookkeeping were all removed. The card's two buttons were resized from 32px (16px icons) to 34px (17px icons) and moved into the toolbar arrangement: fullscreen at top 12/right 12, recenter 8px to its left at right 54. A blocking layout bug was found along the way: `position: fixed` children of the flex `.next-generation-screen` container are laid out at their static position (the sole-flex-item centered spot — measured 320.9px from the viewport top at scrollY 3030) with the fixed insets ignored, so the card is reparented to `<body>` for the duration of fullscreen and restored via a sibling anchor on exit. Playwright-verified (full Chrome binary) on both cards: fixed rects at the 3svh/3vw edges, backdrop coverage, visible toggle button, title header inside the card top, whole-diagram refit, Escape restore, and zero console errors.

By user request the node drag was restored to the message-1 state — the classic elastic drag: pickup boosts the incident springs ×4 (cap 0.95) and reheats at alphaTarget 0.35 so directly linked nodes are pulled along during the hold; release unpins the node (fx/fy = null) and restores baseline strengths so it is affected by the other nodes' forces again and springs back while the simulation cools (measured 255.0 graph units of return within 700 ms of release, zero console errors). The intervening experiments were reverted and stay on record as rejected alternatives: pickup-time reheat + ×4 boost shrank the hub's bounding diagonal 6.5% in 400 ms; pure-pin pickup and sleep-hold froze everything; neighborhood-follow froze far nodes; elastic spring-follow compressed during the hold and overshot the bounding diagonal +8.9% on release; rigid ride-along (FOLLOW_RATIO 0.65) kept the diagonal byte-identical but was rejected by the user.

“What it will have” now stays 10px below the complete “You’ll touch it.” explanation during the entrance, settled hold, and scroll-off. The earlier static-margin change aligned the text only at pin release; it still left a 293.77px gap at the settled point at 1440×900. `updateManteraction()` now sets `--future-handoff-offset` from the live explanation bottom, and `.future-section > *` uses a relative `top` offset so the heading and feature grid move together without moving the measured section. The correction returns to zero at the existing handoff. Browser checks at 1524×792, 1440×900, 390×844, 240×700, and 1440×600 measured a settled gap of 10px within subpixel rounding and no visible overlap; the existing linear finale fade, centered endpoint, and all eight feature replays passed. Backgrounds, scroll budgets, the touch entrance timing/trajectory, and feature animation settings remained unchanged.

The search fields on both the wiki sidebar (`#wiki-search`) and the architecture graph toolbar (`.architecture-graph-search`) are bare single-line inputs: transparent background, no border except a 1px bottom rule, no border-radius, explicit caret color, and “Search notes” is the input's own placeholder text sitting directly on the line (font 14px/15px with line-height 1, min-height 15px/16px and 1px bottom padding, so the glyphs end ~1px above the rule). Typing natively replaces the placeholder and clearing restores it. Focus brightens the underline to full foreground instead of drawing an outline box. The earlier separate label span, its blank-on-focus `is-blank` logic, and the visually-hidden rules were all removed. Playwright-verified on both pages: placeholder shown when empty, replaced on typing, restored on clear, filtering intact (21 matching note links for “page-1”; graph status 79 notes | 626 connections), and zero console errors.

The wiki sidebar index is now an expandable folder tree in the style of the manim docs sidebar: every folder row carries a chevron arrow at its left (rotating −90° when collapsed, pointing down when expanded), the folder name links to its own `index.md` page (folders without one toggle on click), and child notes/subfolders are indented 13px per level. Expansion animates via a `grid-template-rows: 0fr → 1fr` transition (0.32s cubic-bezier(.3,.85,.35,1)) on `.wiki-folder-children` with an `overflow: hidden; min-height: 0` inner wrapper that also fades opacity (0 → 1 over 0.28s with a 0.06s delay; 0.22s on collapse). The tree renders from note ids via `buildTree()`, folder rows link through `documents.get(path + '/index.md')` (Map keys carry `.md`), the path to the current note auto-expands on load and stays open across the 5s source refresh, and searching force-expands matching folders while hiding empty ones, restoring stored state on clear. Root `index` is not listed. `dataset.noteID` was renamed to `dataset.noteId` so the attribute reads `data-note-id` (dataset camelCase hyphenates each capital, so `noteID` produced the nonstandard `data-note-i-d`); `navigate()` resolves through `entryByID()` rather than `documents.has()` for the same id-vs-path reason. Two bugs fixed along the way: a root-notes loop that ran for every folder in the recursion (doubling each leaf and leaking `index` leaves), and folder-name/index clicks silently falling back to the home note. Playwright-verified (full Chrome binary): 38 folders/38 arrows, 78 notes, default all-collapsed, mid-transition grid-rows sampling (0px → 38.7px → 126px on expand), index jump loads the folder page, deep links auto-expand ancestors, search reports “16 of 78 notes”, and zero console errors.

# Website architecture

## NOTE: this architecture is fully-AI generated. scrintinize it as any other AI-generted content

Each visible graph line now drives a D3 spring with its own deterministic rest length sampled from `[230, 270]` graph units, rather than one fixed stable distance. Spring strength is `min(0.7, 4 * edge.weight / min(source.weight, target.weight))`; reciprocal references increase `edge.weight`, strengthening the single rendered line. During a drag, incident links temporarily use `min(0.95, baseStrength * 4)` at `alphaTarget = 0.35`, then return to their baseline strengths on release. The visible line and spring share the same endpoint nodes. The graph reads the manifest and current Markdown files, renders 79 notes and 626 deduplicated connections, and retains the Obsidian-derived weight, radius, repulsion, centering, and collision model. Seeded edge distances keep refreshes reproducible without assigning every connection the same rest length.
The Manteraction finale and “What it will have” share one full-width `.manteraction-future-container`: it wraps `.manteraction-scroll`, `.future-section`, and `.future-scroll`, carries the single gray surface and outer hairlines, and fades that surface to transparent as “Just You Wait.” reaches center. The child future section is transparent so there is no inner boundary. Its static margin aligns the visible future heading 10px below the finale block at pin release, while a child-only relative offset keeps that same gap during the earlier entrance and settled hold; transparent section padding can overlap the preceding layout box without the text overlapping.

The architecture and Manteraction basis areas now use two full-width sibling `band` sections, matching the existing “Real time, real life.” container treatment instead of small rounded outer cards. The architecture band is explicitly black (`var(--background)`), while the artifact band keeps the gray `var(--band)` surface; the architecture band contains the live graph described above, and the artifact band contains the existing sticky Manteraction stage with no extra horizontal card margin. At 1440×900 and 390×844, both bands span the viewport width, remain vertically separate, and have no browser errors. The “What it will have” sticky section now starts with the same gray `var(--band)` surface and uses its existing `opacity: 1 → 0` handoff to fade the whole viewport-sized section to black exactly as “Just You Wait.” reaches center.

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

The shared `.manteraction-future-container` owns the continuous gray surface and outer hairlines. `.manteraction-scroll` retains its 0.7 viewport pinned budget and existing finale reserve. `measureManteraction()` computes the separate future-section margin from the explanation bottom, stage height, and section padding to leave 10px at pin release. During the earlier entrance and settled hold, `updateManteraction()` applies the child-only handoff offset to maintain that same visible gap. The future heading/features remain sticky through their own fade, and the independent feature-entry animation may run at the same time.

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


The next-generation section is split into two full-viewport screens
(`.next-generation-screen`, `min-height: 100svh`): screen one holds the heading,
the “Manim plays…” paragraph and the ManimCE pipeline mind map; screen two
holds “We verified the trick…”, the Vulkan pipeline mind map and the closing
line. Each mind-map card occupies 80% of the content width and flexes to
use three quarters of the remaining height; the centered group leaves
breathing room above and below. The diagram contain-fits the card — the
whole map visible, centered with a small margin, pan/zoom to explore
(double-click resets). Heading, paragraph and full map remain visible
at once; fullscreen now fixes the card itself at the viewport edges
(`inset: 0`, edge-to-edge), keeping its original layout inside.

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
is implemented; the wiki route is now a dynamic Markdown reader at wiki.html.
The remaining manteraction.html, try.html, and phormation.html files remain
empty until their designs are requested. There is no overall index or redirect.
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
