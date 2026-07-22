# Render real Scatter outputs for the results-delivery churn regression.
#
# The critical sequence is the user's actual workflow: a fresh analysis has
# no snapshot, Group By changes the chart, then the first chartSnapshot write
# arrives several seconds later. Separate calls create separate widget ids and
# timing metadata, just as separate jamovi runs do.

args <- commandArgs(trailingOnly = TRUE)
OUT <- Sys.getenv("GB2_SNAPCHURN_OUT",
                  if (length(args)) args[[1]] else "/tmp/gb2-snapchurn")
BUNDLE <- Sys.getenv("GB2_BUNDLE", "source")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

if (!requireNamespace("jmvcore", quietly = TRUE))
    quit(status = 2)

suppressWarnings(suppressMessages({
    library(jmvcore)
    library(R6)
    source("R/palette_library.R")
    source("R/style_library.R")
    source("R/utils.R")
    source("R/gb_family_core.R")
    source("R/spec_explode.R")
    source("R/widget.R")
    source("R/xyplotbuilder.h.R")
    source("R/xyplotbuilder.b.R")
}))

.gb2_widget_js <- function() {
    path <- if (identical(BUNDLE, "min"))
        "inst/widget/graphbuilder2.min.js"
    else
        "inst/widget/graphbuilder2.js"
    paste(readLines(path, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
}
environment(graphbuilder2_html) <- globalenv()

get_html <- function(result) {
    value <- tryCatch(result$widget$content, error = function(e) NULL)
    if (is.null(value))
        value <- tryCatch(result$widget$.__enclos_env__$private$.content,
                          error = function(e) "")
    value
}

write_result <- function(name, group = NULL, snapshot = "", y_shift = 0) {
    set.seed(31)
    d <- data.frame(
        x = rnorm(90),
        y = rnorm(90) + y_shift,
        g = factor(rep(c("A", "B", "C"), 30))
    )
    # do.call passes the variable-role strings as values. A direct call from
    # inside this helper would let the generated NSE wrapper capture the local
    # symbol `group` rather than its value.
    result <- do.call(xyplotbuilder, list(
        data = d,
        xvar = "x",
        yvar = "y",
        groupVar = group,
        facetVar = NULL,
        sizeVar = NULL,
        labelVar = NULL,
        chartSnapshot = snapshot
    ))
    con <- file(file.path(OUT, paste0(name, ".html")), open = "wb")
    writeLines(get_html(result), con, useBytes = TRUE)
    close(con)
}

snapshot_svg <- function(fill, cx) {
    paste0(
        '<svg xmlns="http://www.w3.org/2000/svg" width="700" height="450" ',
        'viewBox="0 0 700 450"><rect width="700" height="450" fill="white"/>',
        '<circle cx="', cx, '" cy="225" r="80" fill="', fill, '"/>',
        '<text x="350" y="420" text-anchor="middle" font-size="20">',
        'Static snapshot regression fixture</text></svg>'
    )
}
snapshot_value <- function(svg, key) paste0(nchar(svg), ":", key, "|", svg)

s1 <- snapshot_value(snapshot_svg("#3E6DA9", 300), 101)
s2 <- snapshot_value(snapshot_svg("#C44E52", 400), 202)

write_result("ungrouped-empty")
write_result("grouped-empty", group = "g")
write_result("grouped-snap1", group = "g", snapshot = s1)
write_result("grouped-snap1-again", group = "g", snapshot = s1)
write_result("grouped-snap2", group = "g", snapshot = s2)
write_result("grouped-real-change", group = "g", snapshot = s2, y_shift = 0.75)

cat("wrote snapchurn fixtures to", OUT, "\n")
