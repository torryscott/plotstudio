# Aggregation-cache behavioral test: drives the seven analysis classes
# headlessly through jmvcore and asserts the private$.aggCache contract:
#   1. a warm re-run produces a byte-identical payload (cache hit),
#   2. a style-only option change alters ONLY that key in the payload
#      (cached artifacts reused),
#   3. a data-shaping option change recomputes the artifacts.
# Timing lines are informational only (machine/load dependent); the
# three assertions above are deterministic.
#
# Run it after touching any .b.R prelude: a new data-shaping option or
# computed artifact must land in the module's agg_sig / cache bundle,
# or assertion 3 (staleness) / a warm-run crash (missing local) will
# catch it here before jamovi does.
#
# Usage:  Rscript scripts/verify/aggcache-test.R
# Env:    GB2_BUNDLE  "source" (default) or "min"
# Exit:   0 = all assertions pass, 1 = a FAIL, 2 = jmvcore unavailable

# Rscript spells spaces in --file= as "~+~"; undo that before using it.
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    message("aggcache-test: jmvcore not installed in this R library - skipping")
    quit(status = 2)
}
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R");  source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R");     source("R/plotbuilder.b.R")
    source("R/rmplotbuilder.h.R");   source("R/rmplotbuilder.b.R")
    source("R/xyplotbuilder.h.R");   source("R/xyplotbuilder.b.R")
    source("R/distplotbuilder.h.R"); source("R/distplotbuilder.b.R")
    source("R/freqplotbuilder.h.R"); source("R/freqplotbuilder.b.R")
    source("R/corrplotbuilder.h.R"); source("R/corrplotbuilder.b.R")
    source("R/likertplotbuilder.h.R"); source("R/likertplotbuilder.b.R")
}))

.gb2_widget_js <- function() {
    f <- if (identical(BUNDLE, "min")) "inst/widget/graphbuilder2.min.js"
         else "inst/widget/graphbuilder2.js"
    paste(readLines(f, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()

set.seed(7)
N   <- 30000
dat <- data.frame(
    x  = factor(sample(c("A", "B", "C"), N, TRUE)),
    y  = rnorm(N, 50, 10),
    g  = factor(sample(c("G1", "G2"), N, TRUE)),
    f  = factor(sample(c("F1", "F2"), N, TRUE)),
    xc = rnorm(N, 10, 3),
    m1 = rnorm(N), m2 = rnorm(N), m3 = rnorm(N),
    l1 = sample(1:5, N, TRUE), l2 = sample(1:5, N, TRUE),
    l3 = sample(1:5, N, TRUE))
datXY <- dat[seq_len(8000), ]

FAILS <- 0L
payload_of <- function(an) {
    h <- an$results$widget$content
    m <- regmatches(h, regexpr("var __gb2_payload = [^\n]*", h))
    if (length(m) == 0) "NO-PAYLOAD" else m
}
timed_run <- function(an) {
    t <- system.time(an$run())[["elapsed"]] * 1000
    list(t = t, p = payload_of(an))
}
# Test-only: flip an option value on a live analysis. The generated
# Options classes expose read-only actives backed by private$..<name>,
# so reach through the enclosure - never do this outside a test.
poke <- function(an, name, value) {
    pv <- an$options$.__enclos_env__$private[[paste0("..", name)]]
    if (is.null(pv)) stop(paste("poke failed: no option", name))
    pv$value <- value
    invisible(NULL)
}
strip_key <- function(p, key) {
    for (k in key) {
        # quoted STRING value first (chartSpec is a JSON blob whose braces /
        # commas would break a naive [^,}]+ match), then scalar/array values.
        p <- gsub(paste0('"', k, '":"(?:\\\\.|[^"\\\\])*"'), "", p, perl = TRUE)
        p <- gsub(paste0('"', k, '":[^,}]+'), "", p)
    }
    p
}
ok <- function(label, cond) {
    if (!isTRUE(cond)) FAILS <<- FAILS + 1L
    cat(sprintf("  %-52s %s\n", label, if (isTRUE(cond)) "PASS" else "FAIL"))
}

scenario <- function(name, an, styleKey, styleVal, dataKey, dataVal, stripKeys = styleKey) {
    cat(sprintf("== %s ==\n", name))
    r1 <- timed_run(an)                 # cold: computes + stores
    r2 <- timed_run(an)                 # warm: nothing changed
    ok("warm payload identical to cold", identical(r1$p, r2$p))
    poke(an, styleKey, styleVal)        # style-only change
    r3 <- timed_run(an)
    ok(sprintf("style poke [%s] changed ONLY that key", styleKey),
       !identical(r2$p, r3$p) &&
       identical(strip_key(r2$p, stripKeys), strip_key(r3$p, stripKeys)))
    poke(an, dataKey, dataVal)          # data-shaping change
    r4 <- timed_run(an)
    ok(sprintf("shaping poke [%s] recomputes artifacts", dataKey),
       !identical(strip_key(r3$p, dataKey), strip_key(r4$p, dataKey)))
    cat(sprintf("  info: cold %.0f ms | warm %.0f ms | style %.0f ms | shaping %.0f ms\n",
                r1$t, r2$t, r3$t, r4$t))
}

scenario("plotbuilder (30k rows, 3x2x2 cells)",
         plotbuilderClass$new(
             options = plotbuilderOptions$new(xvar = "x", yvar = "y",
                                              groupVar = "g", facetVar = "f"),
             data = dat),
         "chartSpec", "{\"barOpacity\":0.5}", "summaryFunc", "median",
         stripKeys = c("chartSpec", "barOpacity"))

scenario("distplotbuilder (30k rows)",
         distplotbuilderClass$new(
             options = distplotbuilderOptions$new(var = "y", groupVar = "g"),
             data = dat),
         "chartSpec", "{\"histOpacity\":0.4}", "summaryFunc", "median",
         stripKeys = c("chartSpec", "histOpacity"))

scenario("rmplotbuilder (30k rows, 3 measures)",
         rmplotbuilderClass$new(
             options = rmplotbuilderOptions$new(measures = c("m1", "m2", "m3"),
                                                betweenVar = "g"),
             data = dat),
         "chartSpec", "{\"barOpacity\":0.5}", "errorBarMethod", "between",
         stripKeys = c("chartSpec", "barOpacity"))

scenario("xyplotbuilder (8k pts, LOESS fit)",
         xyplotbuilderClass$new(
             options = xyplotbuilderOptions$new(xvar = "xc", yvar = "y",
                                                groupVar = "g",
                                                xyFitType = "loess"),
             data = datXY),
         "chartSpec", "{\"xyPointOpacity\":0.4}", "xyLoessSpan", 0.9,
         stripKeys = c("chartSpec", "xyPointOpacity"))

scenario("freqplotbuilder (30k rows, 3x2x2 cells)",
         freqplotbuilderClass$new(
             options = freqplotbuilderOptions$new(var = "x", groupVar = "g",
                                                  facetVar = "f"),
             data = dat),
         "chartSpec", "{\"barOpacity\":0.5}", "graphType", "pie",
         stripKeys = c("chartSpec", "barOpacity"))

scenario("corrplotbuilder (30k rows, 4 vars)",
         corrplotbuilderClass$new(
             options = corrplotbuilderOptions$new(vars = c("y", "xc", "m1", "m2")),
             data = dat),
         "chartSpec", "{\"corrShowValues\":false}", "corrMethod", "spearman",
         stripKeys = c("chartSpec", "corrShowValues"))

scenario("likertplotbuilder (30k rows, 3 items)",
         likertplotbuilderClass$new(
             options = likertplotbuilderOptions$new(items = c("l1", "l2", "l3")),
             data = dat),
         "chartSpec", "{\"likertShowValues\":false}", "likertCiLevel", 0.99,
         stripKeys = c("chartSpec", "likertShowValues"))

if (FAILS > 0L) {
    cat(sprintf("\n%d ASSERTION(S) FAILED\n", FAILS))
    quit(status = 1)
}
cat("\nALL AGGREGATION-CACHE ASSERTIONS PASSED\n")
