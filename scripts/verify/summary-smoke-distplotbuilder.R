# Smoke test: distplotbuilder retired-results tombstone.
# BOTH the Summary Statistics and Frequency Table jamovi results were
# retired (Jul 2026, Torry): per-cell descriptives live in the Sigma
# panel's Descriptives tab and the class-interval table in its
# Frequency table tab (with a Copy-table TSV export) — both value-
# verified against R in the bracket-probe suite. This guard keeps the
# results retired, the tombstone option loadable, and the module
# rendering.
# Rscript spells spaces in --file= as "~+~"; undo that before using it.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    message("summary-smoke: jmvcore not installed in this R library - skipping")
    quit(status = 2)
}
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R");  source("R/spec_explode.R"); source("R/widget.R")
    source("R/distplotbuilder.h.R"); source("R/distplotbuilder.b.R")
}))
.gb2_widget_js <- function() "/* stub bundle for table smoke test */"
environment(graphbuilder2_html) <- globalenv()

FAILS <- 0L
ok <- function(label, cond) {
    if (!isTRUE(cond)) FAILS <<- FAILS + 1L
    cat(sprintf("  %-58s %s\n", label, if (isTRUE(cond)) "PASS" else "FAIL"))
}

set.seed(11)
dat <- data.frame(
    y = rnorm(60, 40, 8),
    g = factor(sample(c("G1", "G2"), 60, TRUE)))

# The chartSpec migration (Phase 2) DELETED the showSummaryTable tombstone
# outright (dev mode). The summary + binTable jamovi results stay retired.
an <- distplotbuilderClass$new(
    options = distplotbuilderOptions$new(var = "y", groupVar = "g",
                                         histBins = 5),
    data = dat)
an$run()
ok("summary result stays retired",
   tryCatch(is.null(an$results$summary), error = function(e) TRUE))
ok("frequency-table result stays retired",
   tryCatch(is.null(an$results$binTable), error = function(e) TRUE))
wHtml <- tryCatch(an$results$widget$content, error = function(e) "")
ok("widget still renders", is.character(wHtml) && nchar(wHtml) > 200)

cat(sprintf("\n%s (%d failures)\n", if (FAILS == 0) "ALL PASS" else "FAILED", FAILS))
quit(status = if (FAILS == 0) 0 else 1)
