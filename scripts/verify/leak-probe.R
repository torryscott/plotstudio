# Build the listener-leak probe page for check-extras.mjs: monkey-
# patches document/window add/removeEventListener to keep net counts,
# then runs six full render cycles (mutated payload each time, exactly
# the jamovi round-trip shape) with an inspector-panel open, a text-
# popover open, and dismiss events between cycles. The page reports
# count snapshots; the checker fails on growth from cycle 2 to 6.
#
# Usage:  Rscript scripts/verify/leak-probe.R
# Env:    GB2_VERIFY_OUT  output dir (default /tmp/gb2-verify)
#         GB2_BUNDLE      "source" (default) or "min"

# Rscript spells spaces in --file= as "~+~"; undo that before using it.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
OUT <- Sys.getenv("GB2_VERIFY_OUT", "/tmp/gb2-verify")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")

suppressWarnings(suppressMessages({
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R");  source("R/spec_explode.R"); source("R/widget.R")
}))
.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else "inst/widget/graphbuilder2.js"
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()

set.seed(1)
bars <- list()
for (ci in 1:2) for (gi in 1:3) {
    v <- rnorm(30, 10 * ci + gi, 2)
    bars[[length(bars) + 1L]] <- list(
        x = paste0("Cat", ci), group = paste0("G", gi),
        mean = mean(v), se = sd(v) / sqrt(30), n = 30, values = as.numeric(v))
}
html <- graphbuilder2_html(bars = bars, graph_type = "bar",
                           x_label = "Condition", y_label = "Score",
                           group_categories = paste0("G", 1:3),
                           client_bundle_hash = "")

page <- paste0(
    "<!DOCTYPE html><html><head><meta charset='utf-8'></head><body>\n",
    "<script>\n",
    "window.setOption = function () {};\n",
    "window.__lcount = {};\n",
    "(function () {\n",
    "  function wrapTarget(t, label) {\n",
    "    var a = t.addEventListener.bind(t), r = t.removeEventListener.bind(t);\n",
    "    t.addEventListener = function (type, h, o) {\n",
    "      window.__lcount[label + ':' + type] = (window.__lcount[label + ':' + type] || 0) + 1;\n",
    "      return a(type, h, o);\n",
    "    };\n",
    "    t.removeEventListener = function (type, h, o) {\n",
    "      window.__lcount[label + ':' + type] = (window.__lcount[label + ':' + type] || 0) - 1;\n",
    "      return r(type, h, o);\n",
    "    };\n",
    "  }\n",
    "  wrapTarget(document, 'doc');\n",
    "  wrapTarget(window, 'win');\n",
    "})();\n",
    "</script>\n",
    html, "\n",
    "<script>\n",
    "var SRC = null;\n",
    "(function () {\n",
    "  var all = document.querySelectorAll('script');\n",
    "  for (var i = 0; i < all.length; i++) {\n",
    "    if (all[i].textContent.indexOf('__gb2_payload') >= 0) { SRC = all[i].textContent; break; }\n",
    "  }\n",
    "})();\n",
    "function tickle() {\n",
    "  try {\n",
    "    var bar = document.querySelector('svg rect[data-bar-group]') || document.querySelector('svg rect');\n",
    "    if (bar) bar.dispatchEvent(new MouseEvent('click', { bubbles: true }));\n",
    "    var txt = document.querySelector('svg text');\n",
    "    if (txt) {\n",
    "      txt.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));\n",
    "      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));\n",
    "      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));\n",
    "    }\n",
    "  } catch (e) {}\n",
    "}\n",
    "function report(obj) {\n",
    "  var d = document.createElement('div');\n",
    "  d.id = 'gb2-leak-result';\n",
    "  d.textContent = 'GB2LEAK::' + JSON.stringify(obj);\n",
    "  document.body.appendChild(d);\n",
    "}\n",
    "var SNAPS = [];\n",
    "setTimeout(function () {\n",
    "  try {\n",
    "    for (var cyc = 0; cyc < 6; cyc++) {\n",
    "      var m = SRC.replace('\"barOpacity\":1,', '\"barOpacity\":0.9' + cyc + ',');\n",
    "      (0, eval)(m);\n",
    "      tickle();\n",
    "      SNAPS.push(JSON.parse(JSON.stringify(window.__lcount)));\n",
    "    }\n",
    "    var first = SNAPS[1], last = SNAPS[5], growth = {};\n",
    "    var keys = Object.keys(last);\n",
    "    for (var k = 0; k < keys.length; k++) {\n",
    "      var d = (last[keys[k]] || 0) - (first[keys[k]] || 0);\n",
    "      if (d !== 0) growth[keys[k]] = d;\n",
    "    }\n",
    "    report({ afterCycle2: first, afterCycle6: last, growthC2toC6: growth });\n",
    "  } catch (e) {\n",
    "    report({ err: String(e) });\n",
    "  }\n",
    "}, 600);\n",
    "</script>\n</body></html>")
writeLines(page, file.path(OUT, "leak-probe.html"))
cat("wrote", file.path(OUT, "leak-probe.html"), "\n")
