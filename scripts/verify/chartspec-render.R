# chartSpec migration probe — renderer (speed pass Phase 2, Jul 2026).
# Renders a real Compare Groups page (full inlined bundle) for
# chartspec-check.mjs to drive the route->explode->undo->persist path.
# Env: GB2_CHARTSPEC_OUT (default /tmp/gb2-chartspec)  GB2_BUNDLE=min|source
ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R")
    source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
jsfile <- if (identical(BUNDLE, "min")) {
    "inst/widget/graphbuilder2.min.js"
} else {
    "inst/widget/graphbuilder2.js"
}
.gb2_widget_js <- function()
    paste(readLines(jsfile, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
.gb2_widget_js_hash <- function() ""   # force inline so the browser has the engine
environment(graphbuilder2_html) <- globalenv()

OUT <- Sys.getenv("GB2_CHARTSPEC_OUT", "/tmp/gb2-chartspec")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)
set.seed(11)
n <- 90
cg <- data.frame(x = factor(rep(c("A", "B", "C"), each = n / 3)),
                 y = rnorm(n, 50, 10),
                 g = factor(rep(c("M", "F"), n / 2)))
getC <- function(res) tryCatch(res$widget$content,
    error = function(e) res$widget$.__enclos_env__$private$.content)
wr <- function(html, name) {
    con <- file(file.path(OUT, name), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(html, con, useBytes = TRUE); close(con)
}
# Fresh chart (empty chartSpec).
wr(getC(plotbuilder(data = cg, xvar = "x", yvar = "y",
                    groupVar = "g", facetVar = NULL, chartSpec = "")),
   "fresh.html")
# Echo page: same chart with a POPULATED chartSpec (simulates R's echo
# after the client committed barCornerRadius + chartBackground + a title).
sp <- as.character(jsonlite::toJSON(
    list(barCornerRadius = 14, chartBackground = "#eef",
         xTitle = "My X", xTitleOverride = TRUE), auto_unbox = TRUE))
wr(getC(plotbuilder(data = cg, xvar = "x", yvar = "y",
                    groupVar = "g", facetVar = NULL, chartSpec = sp)),
   "echo.html")
# Attack page: a crafted chartSpec carrying NON-style keys ("bars",
# "annotations") that must NOT clobber the computed payload fields, plus a
# legit style key that MUST still explode. R ignores the non-style keys
# (not in the spec table) so the payload's bars/annotations are correct;
# the JS allowlist must likewise refuse to explode them.
atk <- paste0('{"bars":[],"annotations":[{"kind":"evil"}],',
              '"xCategories":["z"],"barCornerRadius":9}')
wr(getC(plotbuilder(data = cg, xvar = "x", yvar = "y",
                    groupVar = "g", facetVar = NULL, chartSpec = atk)),
   "attack.html")
cat("chartspec render OK ->", OUT, "\n")
