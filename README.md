# Plot Studio: a jamovi module

Customizable statistical graphics for [jamovi](https://www.jamovi.org), built
around one idea: **drop in a variable or two and get a polished,
publication-ready plot with zero configuration**, then click any part of the
chart to customize it, right on the chart itself.

Plot Studio provides seven main chart analyses plus the **Help Me Choose**
guide:

| Analysis | For | Chart types |
| --- | --- | --- |
| **Compare Groups** | between-subjects designs | bar, line, dot, box, violin, raincloud |
| **Repeated Measures** | within-subjects (wide) data | line, bar, dot, box, violin, raincloud |
| **Scatter** | two continuous variables | scatter, binned density heatmap |
| **Distribution** | one variable at a time | histogram, density, histogram + density, box, violin, raincloud, Q-Q, ECDF |
| **Frequencies** | categorical counts / proportions | bar (side-by-side, stacked, 100%), pie, donut, pareto |
| **Correlation Matrix** | two or more numeric variables | heatmap, circles, numbers, mixed |
| **Likert / Survey** | batteries of rating-scale items | diverging stacked, 100% stacked, item means ± CI |

## How it works

Unlike most jamovi modules, almost nothing lives in the options panel: just
the variable boxes and a short data tip. Everything else is edited
**directly on the chart**:

- **Click any element** (a bar, an axis, the title, a legend entry, or a fit
  line) to open its lower style panel for colors, patterns, sizes, ordering,
  scales, and other relevant controls.
- **The ＋ button** adds overlays: significance brackets, reference lines,
  data points, value/N labels, rug marks, normal curves, Q-Q confidence
  bands, text annotations, and more, depending on the chart type.
- **The toolbar** provides undo/redo, the **Σ Statistics** panel, the
  visibility menu, chart settings, fuzzy **Find a setting** search
  (`Cmd/Ctrl+F`), the add menu, export, and the five-part **?** help family.
- **Export** produces SVG, PNG, JPG, or vector PDF.

Edits persist with the analysis, so a saved `.omv` file reopens with every
customization intact.

## Feature highlights

- **Statistics built in**: module-aware descriptives, assumptions, omnibus
  tests, pairwise comparisons, frequency tests, and correlations in the
  **Σ Statistics** panel; mean/median summaries; SE, SD, and confidence
  intervals for means (Cousineau-Morey-corrected for repeated measures); and
  significance brackets backed by the same test engine.
- **Model fits**: linear, quadratic, cubic, and LOESS fit lines with
  confidence bands, per-group or pooled, plus data ellipses, marginal
  distributions, and rug marks.
- **Large-n scatter**: switch to a binned density heatmap with a
  color-scale legend.
- **Color & pattern system**: curated palettes, a full HSV picker with
  eyedropper, pattern fills, transparent fills, and a
  **palette library** that saves custom palettes across data files.
- **Search and teaching tools**: fuzzy setting and statistical-term search,
  chart-part labels, graph-selection guidance, an integrated glossary, and a
  **Check graph** panel for accessibility and misleading-graph checks.
- **Panels** in the supported analyses and chart families, with per-panel
  plotting and strip-label controls.
- **Layout control**: orientation, spacing, category/group reordering by
  drag, value/N labels on bars, axis ranges/steps/breaks, rotated tick
  labels, legend placement.

## Installation

For review or testing before Plot Studio is listed in the jamovi library:

1. Obtain the `.jmo` file supplied for your platform.
2. In jamovi, click **Modules**, choose **Sideload** (the sideways-arrow
   icon), and select the `.jmo` file.
3. Open the ribbon's **Plots** tab and choose an analysis from the
   **Plot Studio** group.

Once Plot Studio is listed in the jamovi library, choose **Modules → jamovi
library**, find **Plot Studio**, and click **Install**.

## Quick start

- **Compare Groups**: drop a categorical variable on *X-Axis Variable* and
  a numeric outcome on *Y-Axis Variable*; add optional *Group By* and
  *Panels* variables.
- **Repeated Measures**: define the levels under *Repeated Measures
  Factors*, place the wide-format measure columns in *Repeated Measures
  Cells*, and optionally add *Between Subject Factors*.
- **Scatter**: drop continuous *X Variable* and *Y Variable* fields; use
  optional *Group By*, *Panels*, *Label Points By*, or *Size By* fields.
- **Distribution**: drop one numeric *Variable*; optional *Group By* and
  *Panels* fields compare distributions.
- **Frequencies**: drop one categorical *Variable* and its categories are
  counted; optional *Group By* and *Panels* fields break the counts down.
- **Correlation Matrix**: drop two or more numeric *Variables* for an
  r matrix with significance handling and a diverging color scale.
- **Likert / Survey**: drop your rating-scale *Items* for diverging
  stacked rows centered on neutral, or an item-means summary. Drag any
  row up or down to reorder the questions; click an item's label to
  rename or reverse-score it (negatively worded items mirror across
  the scale and gain an "(R)" marker).

Then click anything on the chart you want to change.

## Development

Rendering happens in a custom HTML/SVG widget (`inst/widget/graphbuilder2.js`),
not in R graphics. The R side (`R/*.b.R`) aggregates the data and ships one
JSON payload per render.

```r
# from the project root, with jmvtools installed
jmvtools::prepare()   # regenerate headers + validate the yaml (fast)
```
```bash
# build + side-load into a local jamovi
# (NOT jmvtools::install()/build(); they hang or are not exported under
bash scripts/jmv-build-install.sh
```

- `scripts/minify-widget.sh`: refresh the minified widget bundle (+ its
  committed hash) after editing the widget source.
- `scripts/verify/run.sh [--min]`: headless verification battery that renders
  the chart families and edge cases, then checks them in Playwright/Chromium
  for page errors, missing geometry, NaN coordinates, and expected messages.
- `scripts/release.sh <version>`: sync version numbers, minify, install,
  commit, tag, and push (CI then builds the `.jmo`).

## Author & license

Copyright © 2026 Torry Scott Dennis, PhD.

Plot Studio is free, open-source software licensed under the
[GNU General Public License v3.0](LICENSE) (GPL-3.0): you may use, study,
modify, and share it, but any version you distribute must also be released
under the GPL. It can't be taken closed-source. GPL-3.0 is compatible with
jamovi's `jmvcore` (`GPL (>= 2)`), which this module builds on.

Questions and licensing inquiries are welcome at <tsdennis@smcm.edu>.
