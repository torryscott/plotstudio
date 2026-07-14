# Smoke test: the missing-data disclosure note, focused on the scatter
# NA-group edge case the adversarial review caught (a scatter draws raw
# per-row points, so an NA GROUP value is still plotted and must NOT be
# counted as an exclusion; only non-finite x/y — and, when faceted, an
# NA facet — remove a point from the drawn chart).
.self <- gsub("~+~", " ", sub("--file=", "", grep("--file=", commandArgs(FALSE), value = TRUE)[1]), fixed = TRUE)
ROOT <- normalizePath(file.path(dirname(.self), "..", ".."))
setwd(ROOT)
if (!requireNamespace("jmvcore", quietly = TRUE)) {
    message("smallwins-missing-note: jmvcore not installed - skipping")
    quit(status = 2)
}
suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R"); source("R/utils.R")
    source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/xyplotbuilder.h.R"); source("R/xyplotbuilder.b.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))
.gb2_widget_js <- function() "/* stub */"
environment(graphbuilder2_html) <- globalenv()

# Intercept graphbuilder2_html to capture the missing_note arg.
captured <- new.env()
graphbuilder2_html <- function(...) { captured$mn <- list(...)$missing_note; "<div>stub</div>" }
environment(graphbuilder2_html) <- globalenv()

FAILS <- 0L
ok <- function(l, c) { if (!isTRUE(c)) FAILS <<- FAILS + 1L
    cat(sprintf("  %-56s %s\n", l, if (isTRUE(c)) "PASS" else "FAIL")) }

run_xy <- function(df, ...) {
    captured$mn <- NA_character_
    xyplotbuilderClass$new(options = xyplotbuilderOptions$new(xvar = "x", yvar = "y", ...),
                           data = df)$run()
    captured$mn
}
run_cg <- function(df, ...) {
    captured$mn <- NA_character_
    plotbuilderClass$new(options = plotbuilderOptions$new(xvar = "cx", yvar = "y", ...),
                         data = df)$run()
    captured$mn
}

set.seed(1); n <- 100
xyb <- data.frame(x = rnorm(n), y = rnorm(n),
                  g = rep(c("A", "B"), n / 2), f = rep(c("P", "Q"), n / 2),
                  stringsAsFactors = FALSE)

# --- Scatter: NA group is DRAWN (ungrouped), so it is not an exclusion.
d <- xyb; d$g[c(3, 7, 11, 19, 23)] <- NA
ok("scatter NA-group (no facet) -> empty note", identical(run_xy(d, groupVar = "g"), ""))

d <- xyb; d$x[c(2, 4, 6)] <- NA
ok("scatter NA-x -> '3 of 100'", grepl("^3 of 100", run_xy(d, groupVar = "g")))

d <- xyb; d$f[c(5, 10)] <- NA
ok("scatter NA-facet -> '2 of 100'", grepl("^2 of 100", run_xy(d, groupVar = "g", facetVar = "f")))

d <- xyb; d$g[c(1, 2, 3, 4)] <- NA; d$f[50] <- NA
ok("scatter NA-group ignored under facet -> '1 of 100'",
   grepl("^1 of 100", run_xy(d, groupVar = "g", facetVar = "f")))

# --- Compare Groups AGGREGATES (droplevels), so an NA group/x genuinely
# vanishes from the drawn bars and SHOULD be counted.
cgb <- data.frame(cx = rep(c("L", "M", "H"), length.out = n), y = rnorm(n),
                  g = rep(c("A", "B"), n / 2), stringsAsFactors = FALSE)
d <- cgb; d$g[c(1, 2, 3)] <- NA
ok("CG NA-group -> counted '3 of 100' (aggregating module)",
   grepl("^3 of 100", run_cg(d, groupVar = "g")))
d <- cgb; d$y[c(9, 18)] <- NA
ok("CG NA-y -> counted '2 of 100'", grepl("^2 of 100", run_cg(d)))
ok("CG clean data -> empty note", identical(run_cg(cgb), ""))

cat(sprintf("\n%s (%d failures)\n", if (FAILS == 0) "ALL PASS" else "FAILED", FAILS))
quit(status = if (FAILS == 0) 0 else 1)
