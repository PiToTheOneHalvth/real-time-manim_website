# Club PHormation and Real-Time Manim website

A static, five-page scaffold. Plain HTML and shared CSS; no build step.

## Structure

```text
pages/
  real_time_manim.html             Real-Time Manim product page
  manteraction.html                Manteraction product page
  try.html                        Try Real-Time Manim placeholder
  wiki.html                       Real-Time Manim wiki placeholder
  phormation.html                  Club PHormation page
assets/
  css/main.css                    Shared minimal layout
docs/
  architecture.md                 Layout and implementation guidance
reference_for_real_time_manim/
  slogan.mp4                      Existing design/reference material
```

The Real-Time Manim desktop page is implemented with its own stylesheet
(`assets/css/real-time-manim.css`) and clipboard script
(`assets/js/real-time-manim.js`). The other four HTML files remain empty until
their designs are requested. Mobile layout is deferred.

The RTM page uses the supplied logo, Times New Roman, a black background,
off-white foreground, and charcoal controls. Social icons are 20 px, based on
the approximate icon sizes on https://hermes-agent.nousresearch.com/.
GitHub and PyPI SVGs come from Simple Icons v14 (CC0), with an off-white fill:
https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/github.svg and
https://cdn.jsdelivr.net/npm/simple-icons@v14/icons/pypi.svg.

## Deployment

Serve this directory as the static site root and link directly to the five HTML
pages under pages/. There is no index page. Relative links support a domain root
or a subdirectory deployment. Hosting configuration is not supplied by this scaffold.

See [architecture notes](docs/architecture.md) before extending the site.
