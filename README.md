# Club PHormation and Real-Time Manim website

A static, five-page scaffold. Plain HTML and shared CSS; no build step.

## Structure

```text
pages/
  en_US/
    real_time_manim.html           Real-Time Manim product page
    manteraction.html              Manteraction product page
    try.html                       Try Real-Time Manim placeholder
    wiki.html                      Dynamic Markdown wiki and note reader
    phormation.html                Club PHormation page
  zh_CN/                           Chinese pages (wiki + mind map)
wiki/
  agent/                           Agent-facing reference (see AGENTS.md, llms.txt)
assets/
  css/main.css                    Shared minimal layout
  videos/
    export-window.mp4             Export page demo clip (supplied separately)
docs/
  architecture.md                 Layout and implementation guidance
reference_for_real_time_manim/
  slogan.mp4                      Existing design/reference material
```

The Real-Time Manim desktop page is implemented with its own stylesheet
(`assets/css/real-time-manim.css`) and clipboard script
(`assets/js/real-time-manim.js`). The live homepage currently runs: the hero
opening, the top-bar hand-off, the stack section, the export page, and a
1.5-screen particle geometry stage. The stack's Python/C/Vulkan marks are
assembled by `assets/js/stack-particles.js` from `assets/images/python.svg`,
`assets/images/c.svg` and `assets/images/vulkan.svg`; the three marks are
enlarged and overlap (Python tilted top-left, C centre-right, Vulkan V
bottom-left), with no frames, no captions and no numbering — the design note on
the right carries the names and roles. The marks stay drawn as particles (the
SVGs are hidden sampling targets; reduced motion or no JS shows them) until the
export page reuses them. The marks form from the hero's big M, and
`assets/js/export-particles.js` continues the same batch: it takes the settled
stack dots (`window.rtmStackDots()`), flies them right into a monitor built from
its own normalized point set (bezel, chin, neck, base, LED), and leaves the
screen interior to a real DOM video slot. The clip belongs at
`assets/videos/export-window.mp4`; until it is supplied, the screen shows a
dashed "Video slot" placeholder with that path. When the clip ends the monitor
compresses from both sides into a horizontal line, the video fades, and the line
unfolds into the nine export routes from `wiki/agent/runtime.md`:
`fast_record_scene`, `record_scene`, `start_record`/`stop_record`,
`enable_fast_record`, `Timeline.render_mp4`, `FrameServer.export_frames`,
`FrameServer.save_frame`, `FramePreview` and `export_srt`. Without a clip the
page demonstrates the same collapse on a short timer, and
`window.rtmExportDots()` exposes the final list dots. `assets/js/shape-particles.js`
then starts from those dots, falls back to the stack dots on a deep link, and
begins only once the export page is three quarters gone; the export canvas and
copy fade as the shape takes over. It flies the batch into a large wireframe
torus and seven smaller solids and flat figures (cube, sphere, pyramid,
octahedron, circle, triangle, hexagon) placed at random. They turn, draw a faint
mesh, a dust ring orbits the torus, and the whole field is scrubbed by the
scroll wheel — formation, turn and final field all follow the scroll, with no
pulse or scale breathing, and the stage is still whenever the wheel is.
`assets/js/scroll-snap.js` adds a gentle magnetic settle at the opening, the
stack content (40px from the top), the export content (96px from the top, below
the open bar), the stage fully in view, the stage release (the page bottom), and
on a phone the page bottom; it only acts after the wheel stops within ~150px of
one of those. The particle background is `assets/js/network-background.js`,
wheel speed is capped by `assets/js/scroll-speed.js`, and the magnetic settle is
`assets/js/scroll-snap.js`. The older content sections (slogan, real-life,
next generation, starts-from, architecture, Manteraction) were removed on
2026-10-26 and kept verbatim in `pages/en_US/real_time_manim_full.html`, which
loads its own frozen assets (`real-time-manim.full.css`,
`real-time-manim.full.js`, `hero-particles.full.js`,
`network-background.full.js`). The full page still contains the architecture
graph whose notes come from the separate real-time-manim repository
(`RTM-Wiki/`), served over cdn.jsdelivr.net with raw.githubusercontent.com as a
fallback. `pages/en_US/wiki.html` provides the same-origin dynamic Markdown
reader for graph-node clicks. The other three HTML files remain empty until
their designs are requested. Mobile layout is implemented for the product and
wiki surfaces.

The RTM page uses the supplied logo, Times New Roman, a black background,
off-white foreground, and charcoal controls. Social icons are 20 px, based on
the approximate icon sizes on https://hermes-agent.nousresearch.com/.
GitHub and PyPI SVGs come from Simple Icons v14 (CC0), with an off-white fill:
https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/github.svg and
https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/pypi.svg. The Python and C
marks in the stack section are the same source, also off-white:
https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/python.svg and
.../c.svg. The Vulkan mark is the public-domain Vulkan V bug from Wikimedia
Commons, recoloured off-white:
https://commons.wikimedia.org/wiki/File:Vulkan_Logo_(Bug).svg.

## Deployment

Serve this directory as the static site root and link directly to the five HTML
pages under pages/en_US/. There is no index page. Relative links support a domain root
or a subdirectory deployment. Hosting configuration is not supplied by this scaffold.

See [architecture notes](docs/architecture.md) before extending the site.
