# Seed the "APA 7" chart style into the user's real style library.
#
# Grounded in the APA Publication Manual (7th ed.) figure guidelines
# (apastyle.apa.org "Figure setup" + Purdue OWL):
#   - sans serif font, 8-14 pt, within the figure image
#   - no gridlines / shading / 3-D unless essential
#   - legible in grayscale for print; grayscale fills for bars
#   - clean axes (no frame), figure title italic, Note block below
proj <- getwd()  # run from the repo root: Rscript scripts/seed-apa-style.R
source(file.path(proj, "R", "palette_library.R"))
source(file.path(proj, "R", "style_library.R"))

ts <- function(id, size, col = "#000000", bold = FALSE, italic = FALSE) {
    list(id = id, fontSize = size, color = col, bold = bold,
         italic = italic, rotation = 0, align = "")
}

opts <- list(
    # --- colors: grayscale ramp (k groups sample dark -> light;
    #     legible in print, the manual's B&W-legibility rule) -------
    chartPalette = "grayscale",

    # --- text: sans serif (the widget's Sans-serif default face),
    #     black, everything inside the 8-14 pt window ---------------
    chartFontFamily = "",
    chartTextColor  = "#000000",
    textStyles = list(
        ts("chartTitle", 12, italic = TRUE),  # APA figure titles are italic
        ts("xTitle", 12),
        ts("yTitle", 12),
        ts("xTickLabel", 11),
        ts("yTickLabel", 11),
        ts("groupTitle", 11),
        ts("chartNote", 11),                  # the Note. block below the figure
        ts("barValueLabel", 10)
    ),

    # --- axes: plain black axes + outward ticks, NO gridlines ------
    chartGrid = "none",
    chartGridMinorEnabled = FALSE,
    xAxisThickness = 1,   yAxisThickness = 1,
    xAxisStyle = "solid", yAxisStyle = "solid",
    xAxisColor = "#000000", yAxisColor = "#000000",
    xTickColor = "#000000", yTickColor = "#000000",
    xTickDirection = "out", yTickDirection = "out",
    xTickLength = 6, yTickLength = 6,
    xTickThickness = 1, yTickThickness = 1,
    xMinorTicks = FALSE, yMinorTicks = FALSE,
    xAxisBreak = FALSE, yAxisBreak = FALSE,
    likertGridShow = FALSE,

    # --- bars & elements: square, fully opaque, black 1px borders
    #     (keeps the light ramp end readable), black error bars,
    #     open black circles on scatter (classic print treatment) ---
    barOpacity = 1,
    barCornerRadius = 0,
    barBorderColor = "#000000", barBorderWidth = 1,
    barBorderOpacity = 1, barBorderStyle = "solid",
    barPattern = "",
    errorBarColor = "#000000", errorBarThickness = 1.4, errorBarCapSize = 1,
    lineWidth = 2,
    linePointSize = -1,           # type default (7 line / 10 dot)
    linePointColor = "",
    linePointOutlineWidth = 0,
    xyPointSize = 5, xyPointShape = "circleOpen",
    xyPointOpacity = 1, xyPointColor = "#000000", xyPointOutlineWidth = 0,
    histOutlineColor = "#000000", histOutlineWidth = 1,
    histOutlineStyle = "solid", histOutlineOpacity = 1,
    sliceBorderColor = "#000000", sliceBorderWidth = 1,
    sliceBorderStyle = "solid", sliceBorderOpacity = 1,
    likertLegendTextColor = "#000000",

    # --- background & frame: white, no border, plain facet strips --
    chartBackground = "#ffffff",
    chartBorder = "none",
    facetStripBackground = "none"
)
# Deliberately OMITTED: customPalette (would clobber the user's
# build-your-own seed; grayscale is a built-in id so no fallback is
# needed) and grid colors (grid is off; leave the target's latent
# colors alone).

pl  <- .gb_palette_lib_read()
lib <- .gb_style_lib_read(pl$machineId)
had <- !is.null(lib$styles[["APA 7"]])
lib$styles[["APA 7"]] <- list(
    groups = list("colors", "text", "axes", "bars", "background"),
    opts   = opts)
.gb_style_lib_write(lib)

chk <- .gb_style_lib_read(pl$machineId)
stopifnot(!is.null(chk$styles[["APA 7"]]))
stopifnot(length(chk$styles[["APA 7"]]$groups) == 5)
stopifnot(identical(as.character(chk$styles[["APA 7"]]$opts$chartPalette), "grayscale"))
cat(if (had) "APA 7 style REPLACED in" else "APA 7 style seeded into",
    .gb_style_lib_file(), "\n")
cat("styles in library:", paste(names(chk$styles), collapse = ", "), "\n")
