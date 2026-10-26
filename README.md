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
docs/
  architecture.md                 Layout and implementation guidance
reference_for_real_time_manim/
  slogan.mp4                      Existing design/reference material
```

The Real-Time Manim desktop page is implemented with its own stylesheet
(`assets/css/real-time-manim.css`) and clipboard script
(`assets/js/real-time-manim.js`). The live homepage currently runs: the hero
opening, the top-bar hand-off, the stack section, and a 1.5-screen particle
geometry stage. The stack's Python/C/Vulkan marks are assembled by
`assets/js/stack-particles.js` from `assets/images/python.svg`,
`assets/images/c.svg` and `assets/images/vulkan.svg`; the three marks are
enlarged and overlap (Python tilted top-left, C centre-right, Vulkan V
bottom-left), with no frames, no captions and no numbering — the design note on
the right carries the names and roles. The marks stay drawn as particles (the
SVGs are hidden sampling targets; reduced motion or no JS shows them) until the
shape stage reuses them. The marks now form from the hero's big
M, and `assets/js/shape-particles.js` continues the chain: it starts from the
exact dots the settled stack canvas exposes (`window.rtmStackDots()`), fades the
stack canvas and flies the same batch into a large wireframe torus and seven
smaller solids and flat figures (cube, sphere, pyramid, octahedron, circle,
triangle, hexagon) placed at random. They turn, draw a faint mesh, a dust ring
orbits the torus, and the whole field is scrubbed by the scroll wheel —
formation, turn and final field all follow the scroll, with no pulse or scale
breathing, and the stage is still whenever the wheel is. The top bar finishes
opening exactly at the stage's bottom. `assets/js/scroll-snap.js` adds a gentle
magnetic settle at the opening, the stack content (40px from the top), the
stage fully in view, the stage release (bar fully open — the page bottom), and
on a phone the page bottom; it only acts after the wheel stops within ~150px
of one of those. The
particle background is `assets/js/network-background.js`, wheel speed is capped
by `assets/js/scroll-speed.js`, and the magnetic settle is
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
