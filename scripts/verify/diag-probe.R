# Failure-diagnostics probe, page generator (see diag-check.mjs for
# the browser half). Renders the pages the check corrupts/strips to
# simulate the three silent-blank failure modes the Jul 2026
# diagnostics were built for (a jamovi-team field report: module
# installed, UI fine, results widget blank, nothing to go on):
#
#   diag-inline.html  a DATA render on the inline-bundle branch
#                     (fresh analysis: clientBundleHash = ""). Carries
#                     Layer A (static pending box, 6 s CSS reveal),
#                     Layer A.5 (ES5 primer script), and Layer B
#                     (guarded render + red error box).
#   diag-cached.html  the same data render on the cached branch -
#                     used to assert the "Loading chart engine" note
#                     kept its self-heal semantics (engine-absent in
#                     cached mode is NOT an error).
#
# Uses the MINIFIED bundle when present (production shape), else the
# source bundle - the diagnostics live in widget.R, not the bundle,
# so either works; the check only needs ONE bundle flavor.
#
# Exit 2 = jmvcore missing (skipped).
# Env: GB2_DIAG_OUT  output dir (default /tmp/gb2-diag-probe)

ok <- requireNamespace("jmvcore", quietly = TRUE)
if (!ok) { cat("jmvcore not available\n"); quit(status = 2) }

suppressWarnings(suppressMessages({
    library(jmvcore); library(R6)
    source("R/palette_library.R"); source("R/style_library.R")
    source("R/utils.R"); source("R/gb_family_core.R"); source("R/spec_explode.R"); source("R/widget.R")
    source("R/plotbuilder.h.R"); source("R/plotbuilder.b.R")
}))

BUNDLE <- if (file.exists("inst/widget/graphbuilder2.min.js"))
    "inst/widget/graphbuilder2.min.js" else "inst/widget/graphbuilder2.js"
JS_HASH <- unname(tools::md5sum(BUNDLE))
.gb2_widget_js <- function()
    paste(readLines(BUNDLE, warn = FALSE, encoding = "UTF-8"), collapse = "\n")
.gb2_widget_js_hash <- function() JS_HASH
environment(graphbuilder2_html) <- globalenv()
environment(gb2_engine_boot_html) <- globalenv()

OUT <- Sys.getenv("GB2_DIAG_OUT", "/tmp/gb2-diag-probe")
dir.create(OUT, showWarnings = FALSE, recursive = TRUE)

set.seed(1)
dat <- data.frame(grp = factor(sample(c("A", "B", "C"), 120, TRUE)),
                  y = rnorm(120, 50, 10))

getC <- function(res) tryCatch(res$widget$content, error = function(e)
    res$widget$.__enclos_env__$private$.content)
# Binary connection + useBytes: Rscript may run in the C locale, and
# plain writeLines would mangle multibyte chars (see render.R).
wr <- function(html, name) {
    con <- file(file.path(OUT, name), open = "wb")
    writeLines('<meta charset="utf-8">', con, useBytes = TRUE)
    writeLines(html, con, useBytes = TRUE)
    close(con)
}

fails <- 0L
expect <- function(label, cond) {
    if (isTRUE(cond)) cat("  ok:", label, "\n")
    else { cat("  FAIL:", label, "\n"); fails <<- fails + 1L }
}

inline <- getC(plotbuilder(data = dat, xvar = "grp", yvar = "y",
                           groupVar = NULL, facetVar = NULL))
wr(inline, "diag-inline.html")
expect("inline: Layer A pending box present",
       grepl("gb2-diag-pending", inline, fixed = TRUE))
expect("inline: static no-scripts detail present",
       grepl("scripts did not execute in this results view", inline, fixed = TRUE))
expect("inline: Layer A.5 primer present",
       grepl("__gb2_errTrapOn", inline, fixed = TRUE))
expect("inline: Layer B guard present",
       grepl("__gb2_renderErr", inline, fixed = TRUE))
expect("inline: primer is a SEPARATE script tag (parse isolation)", {
    # the primer's closing </script> must appear before the main
    # loader's opening tag - otherwise a bundle parse error kills it
    prim <- regexpr("__gb2_errTrapOn", inline, fixed = TRUE)
    main <- regexpr("__gb2_payload", inline, fixed = TRUE)
    prim > 0 && main > 0 && {
        seg <- substr(inline, prim, main)
        grepl("</script>", seg, fixed = TRUE)
    }
})
expect("inline: version stamp on host div",
       grepl('data-gb2-version="', inline, fixed = TRUE))

cached <- getC(plotbuilder(data = dat, xvar = "grp", yvar = "y",
                           groupVar = NULL, facetVar = NULL,
                           clientBundleHash = JS_HASH))
wr(cached, "diag-cached.html")
expect("cached: pending box present too",
       grepl("gb2-diag-pending", cached, fixed = TRUE))
expect("cached: self-heal note kept (not an error box)",
       grepl("Loading chart engine", cached, fixed = TRUE))

writeLines(JS_HASH, file.path(OUT, "hash.txt"))
cat(sprintf("inline=%d bytes  cached=%d bytes  -> %s\n",
            nchar(inline), nchar(cached), OUT))
if (fails > 0L) quit(status = 1)
