# Obsidian-Style Wiki Graph View Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Assess whether the Obsidian vault graph can be reproduced in the static website and define an executable path in which each graph node opens its corresponding wiki page.

**Architecture:** Do not embed Obsidian's desktop application or scrape its internal graph UI. Export a safe, build-time graph model from an approved Markdown source tree, render that model in the existing static site with a local D3-based force graph, and route node clicks to same-origin wiki URLs. The wiki page shell will read a generated manifest and display the selected note from generated HTML fragments.

**Tech Stack:** Plain HTML/CSS/JavaScript, local D3 v7 bundle (`d3-force`, `d3-selection`, `d3-zoom`, `d3-drag`), a build-time Markdown renderer, Python or Node standard filesystem tooling, the existing static HTTP deployment model, and Playwright/CDP browser checks.

---

## Executive Feasibility Decision

### Recommended decision: GO for an Obsidian-style reproduction; NO-GO for a literal embed

The requested user-visible effect is feasible, but the implementation should reproduce the behavior rather than attempt to insert Obsidian's own Graph View into the page.

Obsidian documents Graph View as a core plugin: notes are nodes, internal links are edges, node size reflects the number of references, hovering highlights connections, clicking opens the note, and dragging/scrolling navigates the graph.[1] Those behaviors can be implemented in a browser from the Markdown files and their links.

A literal embed is not the right architecture for this repository. The current project is a static HTML site, and the official material describes Obsidian Graph View as an Obsidian core-plugin feature rather than as an embeddable web component or public graph-rendering API.[1] Obsidian's plugin documentation describes code loaded inside a dedicated Obsidian vault, not a way to mount the desktop application's internal view in an unrelated static site.[3] Scraping or bundling private Obsidian internals would be brittle, version-dependent, and unsuitable for GitHub Pages.

Obsidian Publish can host notes as a wiki or documentation site,[4] but it does not by itself solve the requested custom graph surface inside this repository. It is a possible alternative if the website should link to an external Publish site, not the recommended solution for same-origin node-to-page navigation.

### Feasibility scores

| Target | Feasibility | Reason |
|---|---:|---|
| Reproduce the global graph's visible behavior | High, 8/10 | The graph can be generated from Markdown link relationships and rendered with a browser force simulation. |
| Click a node and open its matching wiki page | High, 9/10 | The build can emit a stable note ID and same-origin `wiki.html?note=...` URL for every node. |
| Reproduce pan, zoom, drag, hover highlighting, and degree-sized nodes | High, 8/10 | These are ordinary client-side graph interactions. |
| Reproduce search, filters, arrows, groups, and local graph depth | Medium-high, 7/10 | Each requires explicit UI and data-model work, but none requires Obsidian itself. |
| Reproduce every Obsidian setting and context-menu action | Medium, 5/10 | The behavior is implementable, but parity would require a larger product surface and ongoing maintenance. |
| Embed the actual Obsidian Graph View UI in this static site | Low, 1/10 | No supported public embed contract is documented; private internals would be fragile. |
| Live-sync a private local vault into a public static site | Low without a build pipeline; medium-high with CI | A browser cannot safely read the user's local vault. The graph must be exported and reviewed before deployment. |

### What “same effect” should mean for version 1

Version 1 should match the core visual and interaction contract, not every settings panel:

- A circle for every included note.
- A line for every resolved internal link, with duplicate edges collapsed.
- Node radius derived from in-degree plus out-degree, with a visible minimum size.
- Hover or keyboard focus highlighting the node and its directly connected edges.
- Click or Enter navigation to the matching wiki page.
- Pointer drag for node repositioning; wheel or trackpad zoom; background drag for panning; a recenter control.
- A search field that dims or filters nodes by title.
- Responsive behavior at desktop and mobile widths.
- A reduced-motion mode that settles the graph without decorative animation.

Arrows, tags, attachments, color groups, local-graph depth, context menus, time-lapse playback, and advanced force controls should be phase-2 features unless exact parity is a hard requirement.

---

## Repository Context and Assumptions

The current repository is a static five-page scaffold with no existing build step.[local: README.md] `pages/en/wiki.html` is currently empty, so the wiki route can be designed without preserving an existing page contract. The repository already contains a local Mermaid bundle and a pan/zoom interaction implementation in `assets/js/diagram-panzoom.js`; those establish local-vendor and interaction conventions, but Mermaid should not be used as the graph data engine. Mermaid is declaration-driven and is not a substitute for a force-directed graph whose nodes come from a vault.

The tracked `test_wiki_file/` tree contains 72 Markdown files arranged as nested wiki content. Its current links are ordinary relative Markdown links such as `guide/index.md`, not Obsidian `[[wikilinks]]`. The configured fallback Obsidian vault at `~/Documents/Obsidian Vault` currently contains four Markdown notes and should be treated as a private source until the user explicitly approves an export. The generator must support both formats so the fixture and a real Obsidian export can exercise the same pipeline.

Recommended source policy:

1. Keep the public build input in a repository-owned export directory or an explicit allowlisted source directory.
2. Never copy the whole local vault automatically.
3. Fail the build if a configured source path is missing or if a note resolves outside the allowlist.
4. Treat the generated graph and page fragments as deployment artifacts that are reviewed before committing.

The first implementation should use `test_wiki_file/` as a deterministic fixture, then accept an approved Obsidian export through the same command. This makes the graph work testable without publishing private notes.

---

## Proposed URL and Data Contract

Use a single static wiki shell with a query parameter:

```text
pages/en/wiki.html?note=guide%2Findex
```

The value is the normalized source-relative note ID without the `.md` suffix. It is not a filesystem path and is resolved only through the generated manifest. A node click must never navigate to a local path, an `obsidian://` URI, or an unvalidated user-provided path.

Generate these artifacts:

```text
assets/data/wiki-graph.json
assets/data/wiki-manifest.json
assets/data/wiki-pages/<stable-slug>.html
```

`wiki-graph.json` should contain:

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "guide/index",
      "title": "Guide Overview",
      "href": "wiki.html?note=guide%2Findex",
      "page": "wiki-pages/guide--index-<hash>.html",
      "degree": 3,
      "aliases": []
    }
  ],
  "edges": [
    {"source": "index", "target": "guide/index"}
  ],
  "unresolved": []
}
```

The exact slug format may differ, but it must be deterministic, URL-safe, collision-resistant, and independent of the absolute source path. The manifest should be the only authority for mapping a note ID to an article fragment.

The parser must support this initial link subset, including Obsidian's documented internal-link form.[2]

- Obsidian wikilinks: `[[Note]]`.
- Aliased wikilinks: `[[Note|Visible label]]`.
- Heading/block suffixes: `[[Note#Heading]]` and `[[Note^block]]`, resolved to the note while preserving the suffix for article anchors if supported.
- Relative Markdown links to `.md` files, as used by `test_wiki_file/`.
- Frontmatter `title` and `aliases` when present.
- External links as article links only; they must not become graph edges.

Resolution order should be explicit and tested: exact normalized relative path, source-relative path, then a unique basename or alias. Ambiguous and unresolved targets must be reported instead of silently choosing a page.

---

## Execution Plan

### Task 1: Freeze the source and URL contract

**Objective:** Make the graph's source-of-truth, privacy boundary, note IDs, and URL format unambiguous before implementation.

**Files:**
- Create: `tools/wiki-source.example.json`
- Modify: `README.md`
- Modify: `docs/architecture.md` after implementation, not during this planning turn

**Steps:**

1. Define `sourceRoot`, `include`, `exclude`, and `outputRoot` in the example configuration.
2. Document that the first fixture source is `test_wiki_file/` and that a real vault export requires explicit approval.
3. Document `wiki.html?note=<encoded-note-id>` as the public URL contract.
4. Record the supported Markdown/link subset and the unresolved-link policy.
5. Commit the contract separately so later parser changes do not silently change URLs.

**Verification:** Run the configuration validator against the fixture and expect a successful source-root and output-root check. Pass a missing source path and expect a non-zero exit with a clear error.

### Task 2: Create a minimal graph-extraction fixture and failing tests

**Objective:** Test link resolution independently of HTML rendering and browser behavior.

**Files:**
- Create: `tools/tests/fixtures/wiki-mini/index.md`
- Create: `tools/tests/fixtures/wiki-mini/guide.md`
- Create: `tools/tests/fixtures/wiki-mini/second.md`
- Create: `tools/tests/test_wiki_builder.py`

**Steps:**

1. Create a four-note fixture containing one normal wikilink, one aliased wikilink, one relative `.md` link, one missing link, and one ambiguous basename.
2. Write failing tests for normalized IDs, edge de-duplication, alias resolution, missing-link reporting, and traversal rejection.
3. Run `python3 -m unittest tools.tests.test_wiki_builder -v` and confirm the tests fail because the builder does not yet exist.
4. Keep the expected graph counts in the test, rather than relying on the number of files in the large lorem-ipsum fixture.

**Acceptance:** The tests describe the data contract precisely enough that a future parser cannot pass by merely counting files.

### Task 3: Implement the build-time Markdown and graph builder

**Objective:** Turn an approved Markdown tree into deterministic graph, manifest, and article artifacts.

**Files:**
- Create: `tools/build_wiki.py` or `tools/build_wiki.mjs` (choose one runtime and keep it consistent)
- Create: `tools/wiki_source.py` or the equivalent parser module if the implementation is split
- Create: `assets/data/.gitkeep` if generated artifacts are not committed initially
- Modify: `tools/tests/test_wiki_builder.py`

**Steps:**

1. Walk only the configured source root and collect `.md` files in stable lexical order.
2. Parse frontmatter and derive a display title from `title`, the first H1, or the filename.
3. Normalize source-relative paths to POSIX note IDs without changing case or silently repairing identifiers.
4. Extract wikilinks and relative Markdown links with a structured parser or carefully scoped regular expressions; do not rewrite arbitrary code blocks into edges.
5. Resolve targets using the documented order and emit warnings for unresolved or ambiguous links.
6. Create one node per included note and one de-duplicated edge per resolved source-target pair.
7. Compute degree metadata without treating unresolved links as real nodes in the default `existing files only` mode.
8. Render the supported Markdown subset to escaped HTML fragments at build time. Disable or sanitize raw HTML and sanitize generated link destinations; article rendering must not create an XSS path from note content.
9. Rewrite internal article links to the same `wiki.html?note=...` URL contract.
10. Emit deterministic JSON with stable key ordering and stable artifact names so generated diffs are reviewable.
11. Return non-zero for configuration, source traversal, parser, or output-write errors. Return a warning summary for unresolved links unless strict mode is requested.

**Dependency decision:** Prefer an established Markdown renderer over writing a Markdown parser. If a Node implementation is chosen, pin the renderer in `package.json` and vendor or build the required browser/runtime assets. If a Python implementation is chosen, pin the parser in a dedicated requirements file and make the generated artifacts independent of the runtime after the build. The static site must not fetch a Markdown package from a CDN at runtime.

**Verification:** Run the unit tests, build the mini fixture twice, and compare the generated JSON and file list byte-for-byte. Then build `test_wiki_file/` and verify that all 72 tracked notes are discovered, the unresolved-link report is explicit, and no output path escapes `assets/data/`.

### Task 4: Add the wiki page shell

**Objective:** Make `pages/en/wiki.html` a usable static wiki route before adding the graph renderer.

**Files:**
- Modify: `pages/en/wiki.html`
- Create: `assets/css/wiki.css`
- Create: `assets/js/wiki.js`

**Steps:**

1. Add the existing site favicon and a minimal site navigation link back to the product page.
2. Add a graph control region, graph viewport, search input, recenter button, and article region with loading, empty, and error states.
3. Load only local scripts and generated data; do not add a CDN dependency.
4. Parse `URLSearchParams`, look up the exact note ID in the manifest, and render the selected article fragment.
5. Use `history.pushState` or a normal same-origin navigation consistently. The initial node click behavior should update the URL and load the corresponding article; direct deep links must work on refresh.
6. Ensure missing or invalid note IDs show a clear not-found state without attempting a filesystem fetch.
7. Keep article link handling inside the same route contract and preserve external links as external links.

**Verification:** Open `pages/en/wiki.html` with a local static server and confirm the empty state is readable before generated data is present. With generated data, load the root route and a direct `?note=` route and confirm the article title and body appear.

### Task 5: Add the local force-directed graph renderer

**Objective:** Reproduce the core Obsidian Graph View visual and interaction behavior in the site.

**Files:**
- Add: `assets/js/vendor/d3.v7.min.js` or a smaller pinned D3 bundle
- Create: `assets/js/wiki-graph.js`
- Modify: `pages/en/wiki.html`
- Modify: `assets/css/wiki.css`

**Steps:**

1. Vendor a pinned D3 build locally and record its version and license in `assets/js/vendor/README.md` or the project license notes.
2. Create an SVG graph inside a responsive viewport. Use `d3-force` for link, charge, center, and collision forces; use `d3-zoom` and `d3-drag` for navigation and node movement.[5]
3. Set a deterministic initial layout seed or deterministic initial positions so browser screenshots do not change randomly on every load.
4. Size node circles from degree with a bounded scale and render links beneath nodes.
5. Highlight a hovered or keyboard-focused node, its neighbors, and their links; dim unrelated elements.
6. Make nodes keyboard-focusable or provide an equivalent accessible list/search path. Enter and Space should activate the same route as a pointer click.
7. Distinguish click from drag so moving a node does not unexpectedly navigate.
8. Add background pan, wheel/trackpad zoom, drag, recenter, and a no-data state.
9. Respect `prefers-reduced-motion`: settle the force simulation promptly and avoid decorative pulse effects.
10. Keep graph state separate from article state so changing the selected note does not rebuild the graph unnecessarily.

**Verification:** In a browser, assert that the SVG has a non-zero bounding box, the node count equals the generated node count, at least one link has a non-zero rendered length, and the graph remains visible at 1440x900, 390x844, and 240x700. Capture screenshots for visual inspection rather than treating DOM existence as proof of a visible graph.

### Task 6: Wire node navigation to wiki pages

**Objective:** Make every graph node open its exact corresponding article.

**Files:**
- Modify: `assets/js/wiki-graph.js`
- Modify: `assets/js/wiki.js`
- Modify: `assets/css/wiki.css`
- Regenerate: `assets/data/wiki-graph.json`, `assets/data/wiki-manifest.json`, and `assets/data/wiki-pages/*`

**Steps:**

1. Store the generated `href` on every node datum and use it as the single navigation source.
2. On click, update the URL to the encoded note ID and render the matching article.
3. On initial load, read the query parameter and select the corresponding node visually when it exists.
4. On browser Back and Forward, restore the article and selected-node state.
5. Add a visible route back to the full graph from an article view.
6. Make internal links in article fragments use the same route, including links from the existing `test_wiki_file` fixture.
7. Reject IDs not present in the manifest and show a not-found state.

**Acceptance:** For every generated node, clicking it changes the URL to a valid same-origin wiki route; the resulting article title and source-relative ID match the node's manifest record. No click may produce an `obsidian://` URL or a local filesystem URL.

### Task 7: Add parity controls only after the core path is stable

**Objective:** Extend the core graph without making the first implementation dependent on optional Obsidian settings.

**Files:**
- Modify: `pages/en/wiki.html`
- Modify: `assets/js/wiki-graph.js`
- Modify: `assets/css/wiki.css`
- Modify: `assets/data/wiki-graph.json` if tags/groups are added

**Order:**

1. Search and title filtering.
2. Toggle unresolved nodes, if the product requirement wants Obsidian's non-existing-link behavior.
3. Directional arrows.
4. Tag and folder color groups.
5. Local graph mode with a depth control.
6. Attachments and media nodes.
7. Context menu actions that are meaningful on a website.

Each control must have an explicit data and accessibility contract. Do not add a settings panel merely to imitate the Obsidian surface; add a control only when the website has a supported behavior behind it.

### Task 8: Build browser verification and regression checks

**Objective:** Verify the complete static workflow, not just that JavaScript executes.

**Files:**
- Create: `tools/verify_wiki.mjs` or `tools/verify_wiki.js`
- Create: `tools/verification/` fixtures or snapshots if useful
- Modify: `README.md`
- Modify: `docs/architecture.md` after implementation

**Verification commands:**

```bash
python3 tools/build_wiki.py --config tools/wiki-source.json --strict
python3 -m unittest tools.tests.test_wiki_builder -v
python3 -m http.server 8123
node tools/verify_wiki.mjs --base-url http://127.0.0.1:8123
```

Before starting the server, check whether port 8123 is already serving this repository and reuse it if so. Do not kill an existing user-owned server.

The browser verifier must check:

- No page errors or console errors on the root wiki route.
- Generated node and edge counts match the graph JSON.
- The SVG viewport is nonblank and remains inside the page at desktop and mobile widths.
- Hovering a node changes the opacity or highlight state of its neighbors.
- Dragging changes the node position without navigating.
- Zooming changes the graph transform and recenter restores the fitted state.
- Clicking a node changes the query route and loads the matching article title.
- Direct deep links, Back, and Forward restore the expected article.
- Invalid note IDs show a not-found state and do not fetch arbitrary paths.
- Article internal links navigate through the same route contract.
- A 72-note `test_wiki_file` build completes with deterministic output.
- At least one narrow viewport has no horizontal overflow and no control/text overlap.
- Reduced-motion mode does not leave nodes permanently hidden.

Take before/after screenshots only when changing visual behavior. For interactive behavior, record the DOM state and URL transitions in addition to the screenshot.

### Task 9: Document deployment and source synchronization

**Objective:** Make the graph reproducible and prevent private-vault leakage or stale graph artifacts.

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Create or modify: `tools/wiki-source.example.json`
- Create or modify: `.gitignore` if local vault exports are excluded

**Steps:**

1. Document the exact build command and the approved source directory.
2. State whether generated graph/page artifacts are committed or generated in CI. For the current static GitHub Pages model, committing reviewed artifacts is the simpler first deployment path.
3. Add a pre-deploy check that rejects absolute source paths, unapproved directories, unresolved strict-mode links, and generated files outside the output root.
4. Record the graph renderer, URL contract, force constants, and source policy in `docs/architecture.md` after the implementation is complete. The architecture log must describe actual behavior and constants from the files on disk.
5. Search the generated output for the absolute vault path and for excluded note names before deployment.
6. Keep the public export separate from the private Obsidian vault and make the synchronization step deliberate.

---

## Acceptance Criteria

The work is complete only when all of these are true:

- The website contains a visible graph generated from the approved Markdown source.
- Every included note has a stable node ID and a corresponding same-origin wiki route.
- Clicking a node opens the matching wiki article, and direct article URLs work on refresh.
- The graph supports hover highlighting, drag, pan, zoom, and recenter.
- The graph's node/link relationships come from parsed source links, not hand-authored JavaScript.
- The build supports both Obsidian wikilinks and the repository fixture's relative `.md` links.
- Missing and ambiguous links are reported and never resolved by guesswork.
- The source allowlist prevents accidental publication of the full local vault.
- No runtime CDN is required for the graph, Markdown output, or site controls.
- Browser checks pass at desktop, normal mobile, and narrow mobile viewports with zero page errors.
- Generated output is deterministic and can be regenerated from a clean checkout.
- The plan's literal-embed limitation is preserved in the documentation so a future change does not quietly replace the supported architecture with Obsidian-internal scraping.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The local vault contains private notes or attachments | Critical | Require an explicit export/allowlist; never default to the whole vault. Scan generated output for absolute paths and excluded names. |
| Duplicate basenames make wikilinks ambiguous | High | Resolve exact relative IDs first; warn or fail on ambiguous fallback resolution. Preserve the original target in diagnostics. |
| Markdown features exceed the renderer subset | Medium | Publish a supported-syntax matrix; render unsupported constructs as readable source or explicit placeholders; do not silently drop content. |
| Force layout moves between loads | Medium | Use deterministic initial positions and fixed simulation settings for the initial layout; allow user dragging afterward. |
| Large graphs become slow or visually noisy | Medium | Measure node count and frame rate; use SVG for the expected fixture first, then move to Canvas or level-of-detail labels if the approved vault requires it. |
| A graph node can be dragged accidentally into navigation | Medium | Use D3 drag state and a movement threshold before treating pointerup as a click. Test both paths. |
| Raw HTML or unsafe links in notes create XSS | High | Disable or sanitize raw HTML at build time, sanitize link destinations, and render only generated trusted fragments. |
| Obsidian changes its private implementation | Low for recommended design | Do not depend on Obsidian's DOM, private bundles, or desktop protocol. Depend only on exported Markdown and documented link syntax. |
| Static hosting does not rewrite arbitrary routes | Low | Use `wiki.html?note=...`, which works with a static file server and GitHub Pages without server-side routing. |

---

## Open Decisions Before Implementation

1. **Source of truth:** Should the public wiki be generated from the tracked `test_wiki_file/`, a new repository-owned export directory, or a user-approved export of the real Obsidian vault?
2. **Publication scope:** Which folders, notes, attachments, and frontmatter are public? Is the graph global across all public notes or limited to a product subset?
3. **Page model:** Is the query-route shell acceptable, or is a separate generated HTML file per note required for SEO and external linking?
4. **Parity target:** Is core graph behavior sufficient, or are tags, attachments, arrows, groups, local graph depth, context menus, and time-lapse animation required?
5. **Rendering scope:** Which Obsidian Markdown features must work on day one: callouts, embeds, block references, Dataview, Mermaid, math, task lists, and tables?
6. **Deployment cadence:** Should generated artifacts be committed to the static repository, or should a CI build regenerate them on every approved content change?

The recommended defaults are: repository-owned public export, query-route shell, global core graph only, standard Markdown plus wikilinks, and committed reviewed artifacts for the first release.

---

## Suggested Delivery Sequence

1. Prove graph extraction and URL mapping on the four-note mini fixture.
2. Build the 72-note `test_wiki_file` artifact and inspect unresolved-link output.
3. Implement the wiki shell and article route.
4. Add the local D3 renderer and core interactions.
5. Verify node-to-page navigation and browser history.
6. Run responsive, accessibility, security, and deterministic-build checks.
7. Obtain approval for the real public Obsidian export.
8. Regenerate, review the diff, and deploy the public graph.
9. Add phase-2 parity controls only from observed requirements.

A small proof of concept should establish the architecture quickly. Production quality depends less on the force layout than on source selection, link resolution, Markdown coverage, URL stability, privacy controls, and browser verification.

## Sources

[1] Obsidian Help, Graph view: https://help.obsidian.md/plugins/graph
[2] Obsidian Help, Links to notes and files: https://help.obsidian.md/linking/links-to-notes-and-files
[3] Obsidian Developer Documentation, Build a plugin: https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin
[4] Obsidian Help, Introduction to Obsidian Publish: https://help.obsidian.md/Obsidian+Publish/Introduction+to+Obsidian+Publish
[5] D3, Force simulations: https://d3js.org/d3-force
