# Consolidated retirement guard (Jul 2026): the "Summary table" jamovi
# result + its Plot-Setup checkbox were retired across all six chart
# modules in favor of the on-chart Sigma panel (whose Descriptives /
# Counts / Item-means / All-pairs tabs now carry the same numbers, with
# a Copy-table -> Word/Excel export). This asserts, per module, that:
#   - the `summary` Table result no longer exists,
#   - the `showSummaryTable` tombstone option still constructs (old .omv
#     files store it; kept hidden in the a.yaml),
#   - the widget still renders.
# freqplotbuilder ALSO retired its `pairwise` jamovi table (Jul 2026) in
# favor of the Sigma panel's Pairwise tab; asserted below.
# distplotbuilder keeps its own guard (it ALSO retired the binTable).
# Rscript spells spaces in --file= as "~+~"; undo that before using it.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    message("summary-smoke-retired: jmvcore not installed in this R library - skipping")
    quit(status = 2)
}
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    for (m in c("plotbuilder", "rmplotbuilder", "xyplotbuilder",
                "freqplotbuilder", "corrplotbuilder", "likertplotbuilder")) {
        source(sprintf("R/%s.h.R", m)); source(sprintf("R/%s.b.R", m))
    }
}))
.gb2_widget_js <- function() "/* stub bundle for retirement smoke test */"
environment(graphbuilder2_html) <- globalenv()

FAILS <- 0L
ok <- function(label, cond) {
    if (!isTRUE(cond)) FAILS <<- FAILS + 1L
    cat(sprintf("  %-52s %s\n", label, if (isTRUE(cond)) "PASS" else "FAIL"))
}

set.seed(7)
n <- 48
d <- data.frame(
    x  = factor(sample(c("A", "B", "C"), n, TRUE)),
    y  = rnorm(n, 50, 10),
    x2 = rnorm(n, 5, 2),
    g  = factor(sample(c("G1", "G2"), n, TRUE)),
    t1 = rnorm(n, 3, 1), t2 = rnorm(n, 3.5, 1), t3 = rnorm(n, 4, 1),
    i1 = factor(sample(1:5, n, TRUE)), i2 = factor(sample(1:5, n, TRUE)),
    i3 = factor(sample(1:5, n, TRUE)),
    v1 = rnorm(n), v2 = rnorm(n), v3 = rnorm(n))

guard <- function(label, an, tombstone = TRUE) {
    tryCatch(an$run(), error = function(e)
        cat(sprintf("    (%s run warning: %s)\n", label, conditionMessage(e))))
    ok(paste0(label, ": summary result retired"),
       tryCatch(is.null(an$results$summary), error = function(e) TRUE))
    # plotbuilder went further than retire-to-tombstone: the chartSpec
    # migration (speed pass Phase 2) DELETED showSummaryTable outright
    # (dev mode, no backwards compat), so it has no tombstone to construct.
    if (tombstone)
        ok(paste0(label, ": tombstone option constructs"),
           isTRUE(an$options$showSummaryTable))
    wHtml <- tryCatch(an$results$widget$content, error = function(e) "")
    ok(paste0(label, ": widget renders"),
       is.character(wHtml) && nchar(wHtml) > 200)
}

guard("plotbuilder", plotbuilderClass$new(
    options = plotbuilderOptions$new(xvar = "x", yvar = "y"), data = d),
    tombstone = FALSE)
guard("rmplotbuilder", rmplotbuilderClass$new(
    options = rmplotbuilderOptions$new(measures = c("t1", "t2", "t3")), data = d),
    tombstone = FALSE)
guard("xyplotbuilder", xyplotbuilderClass$new(
    options = xyplotbuilderOptions$new(xvar = "x2", yvar = "y"), data = d),
    tombstone = FALSE)
fq_an <- freqplotbuilderClass$new(
    options = freqplotbuilderOptions$new(var = "x"), data = d)
guard("freqplotbuilder", fq_an, tombstone = FALSE)
# freq's chartSpec migration (Phase 2) DELETED the showSummaryTable AND
# freqPairwiseTable tombstones outright (dev mode). The pairwise jamovi
# result stays retired.
ok("freqplotbuilder: pairwise result retired",
   tryCatch(is.null(fq_an$results$pairwise), error = function(e) TRUE))
guard("corrplotbuilder", corrplotbuilderClass$new(
    options = corrplotbuilderOptions$new(vars = c("v1", "v2", "v3")), data = d),
    tombstone = FALSE)
guard("likertplotbuilder", likertplotbuilderClass$new(
    options = likertplotbuilderOptions$new(items = c("i1", "i2", "i3")), data = d),
    tombstone = FALSE)

cat(sprintf("\n%s (%d failures)\n", if (FAILS == 0) "ALL PASS" else "FAILED", FAILS))
quit(status = if (FAILS == 0) 0 else 1)
