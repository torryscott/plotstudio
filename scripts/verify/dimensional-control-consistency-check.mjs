// Focused source-contract checks for the July 2026 dimensional-control pass.
// These controls are assembled dynamically inside the widget, so checking the
// renderer sections directly catches accidental drift in preset semantics and
// responsive geometry without requiring every possible inspector route to be
// represented by a rendered fixture.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const source = readFileSync(path.join(ROOT, 'inst/widget/graphbuilder2.js'), 'utf8');
let failures = 0;

function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) failures++;
}

function section(startMarker, endMarker) {
    const start = source.indexOf(startMarker);
    const end = source.indexOf(endMarker, start + startMarker.length);
    if (start < 0 || end < 0) return '';
    return source.slice(start, end);
}

const yAxis = section('function renderInspectorYAxis(body)', 'function renderInspectorXAxis(body)');
const facet = section('function renderInspectorFacet(body, level)', 'function renderInspectorPointStyle(body');
const spacing = section('function _buildSpacingPaneHtml(_showFn, _hasGroups)', 'function _buildOrderPaneHtml(_showFn, _hasGroups)');
const errorBars = section('function renderInspectorErrorBars(body, groupName, opts)', 'function renderInspectorBarStyle(body, groupName)');
const barStyle = section('function renderInspectorBarStyle(body, groupName)', 'function renderInspectorLineStyle(body, groupName)');
const lineStyle = section('function renderInspectorLineStyle(body, groupName)', 'function renderInspectorVisibility(body)');
const fit = section('function renderInspectorFitLine(body, groupName, opts)', 'function renderInspectorXYEllipse');
const fitRendering = section('var _fitAttrs = {', '// ---- 2-D density contours ----');
const qqOutline = section('function _distQQOutlineTab(pane, g)', 'function renderInspectorDistQQ(body, group)');
const distRange = section('function _distRangeHtml(field, mn, mx, step, val, unit, exactNumVal)', 'function _distCheckHtml(field, label, checked)');
const corrCells = section('function _corrCellsCellsTab(pane)', 'function _corrCellsValuesTab(pane)');
const likertBorder = section('function _lkLevelBorderTab(pane, lv)', 'function _lkLevelBarsTab(pane)');
const likertBars = section('function _lkLevelBarsTab(pane)', 'function _lkLevelLayoutTab(pane)');
const shapeRendering = section('function _shapeFillStroke(ann, fillable)', 'function _arrowHeadPathD');
const shapes = section('function _shapeStyleRowsHtml(state, kind)', 'function _wireShapeStyleRows(body');
const facetAccent = section('function renderInspectorFacetAccent(body)', 'function renderInspectorGrid(body)');
const grid = section('function renderInspectorGrid(body)', 'function renderInspectorLegend(body)');
const dataPoints = section('function renderInspectorDataPoints(body)', 'function renderInspectorAnnotation(body, ann)');
const annotationText = section('function renderInspectorAnnotationText(body, ann)', 'function renderInspectorAnnotationStatBox(body, ann)');
const bracket = section('function renderInspectorAnnotationBracket(body, ann)', 'function renderInspectorAnnotationRefLine(body, ann)');
const referenceLine = section('function renderInspectorAnnotationRefLine(body, ann)', 'function renderInspectorDrawShapes(body)');
const singleText = section('function renderInspectorText(body, id)', 'function renderInspectorMultiText(body, ids)');
const multiText = section('function renderInspectorMultiText(body, ids)', 'function _undoTake()');

check('Responsive slider token spans 120–200 px',
    /_GB2_DIM_SLIDER_CSS\s*=\s*[\s\S]*?clamp\(120px,40vw,200px\)[\s\S]*?min-width:120px[\s\S]*?max-width:200px/.test(source));
check('Canonical numeric field is 48 px',
    /_GB2_DIM_NUM_CSS\s*=[\s\S]*?width:48px/.test(source));
check('Auto-attached slider numbers use canonical geometry',
    source.includes('num.style.cssText = _GB2_DIM_NUM_CSS + "margin-left:3px;"'));
check('Distribution-family sliders use responsive geometry',
    source.includes('var _DIST_rangeCss = _GB2_DIM_SLIDER_CSS;'));
check('Legacy fixed 130/200 px lower-panel range rails are gone',
    !/<input type="range"[^\n]*style="width:(?:130|200)px/.test(source) &&
    !/var\s+_[A-Za-z0-9]+\s*=\s*"width:(?:130|200)px;"/.test(source));

check('Bar, box, violin, error-bar, line, and dot dimensions share geometry tokens',
    errorBars.includes('var _ebSliderStyle = _GB2_DIM_SLIDER_CSS;') &&
    errorBars.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    barStyle.includes('var _slider = _GB2_DIM_SLIDER_CSS;') &&
    barStyle.includes('style="\' + _GB2_DIM_SLIDER_CSS + \'"') &&
    barStyle.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    lineStyle.includes('var _slider = _GB2_DIM_SLIDER_CSS;') &&
    lineStyle.includes('style="\' + _GB2_DIM_NUM_CSS + \'"'));
check('Facet accent, grid, and data-point dimensions share geometry tokens',
    facetAccent.includes('style="\' + _GB2_DIM_SLIDER_CSS + \'"') &&
    facetAccent.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    grid.includes('style="\' + _GB2_DIM_SLIDER_CSS + \'"') &&
    grid.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    dataPoints.includes('var _dpSliderStyle = _GB2_DIM_SLIDER_CSS;') &&
    dataPoints.includes('style="\' + _GB2_DIM_NUM_CSS + \'"'));
check('Annotation line widths and rotation pairs share geometry tokens',
    annotationText.includes('data-field="rotation"') &&
    annotationText.includes('style="\' + _GB2_DIM_SLIDER_CSS + \'"') &&
    annotationText.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    bracket.includes('data-field="line-width"') &&
    bracket.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    referenceLine.includes('data-field="line-width"') &&
    referenceLine.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    singleText.includes('data-field="rotation-num"') &&
    singleText.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    multiText.includes('data-field="rotation-num"') &&
    multiText.includes('style="\' + _GB2_DIM_NUM_CSS + \'"'));

// Deliberate compact exceptions: these are dense multi-control rows whose
// one-line layout at the minimum inspector width would be broken by the shared
// 120 px rail + 48 px field. Keep them explicit so a future cleanup does not
// mistake them for missed standard slider/number pairs.
check('Compact facet/gap rows remain declared exceptions',
    spacing.includes('data-field="facet-gap" data-no-num="1"') &&
    spacing.includes('style="width:140px;"') &&
    spacing.includes('data-field="facet-gap-num"') &&
    spacing.includes('style="width:46px;'));
check('Compact pattern composite remains a declared exception',
    barStyle.includes('data-field="density"') &&
    barStyle.includes('style="width:120px;"') &&
    barStyle.includes('data-field="density-num"') &&
    barStyle.includes('style="width:42px;'));
check('Compact text size/B-I rows remain declared exceptions',
    annotationText.includes('data-field="size"') &&
    annotationText.includes('style="width:100px;"') &&
    annotationText.includes('data-field="size-num"') &&
    annotationText.includes('style="width:36px;') &&
    singleText.includes('data-field="size"') &&
    singleText.includes('style="width:100px;"') &&
    multiText.includes('data-field="size"') &&
    multiText.includes('style="width:100px;"'));

check('Y axis line and ticks use shared required-stroke presets',
    yAxis.includes('_renderWidthPresets(_curYThk, "thickness")') &&
    yAxis.includes('_renderWidthPresets(_curTkThk, "tickThickness")') &&
    yAxis.includes('_wireWidthPresets(body)') &&
    !yAxis.includes('function _presetWidthBtn'));
check('Facet divider uses shared required-stroke presets',
    facet.includes('_renderWidthPresets(fDividerWidth, "f-divider-width")') &&
    facet.includes('_wireWidthPresets(body)') &&
    !facet.includes('data-preset-fdiv-width'));

check('Likert border width uses optional-stroke presets on two rows',
    likertBorder.includes('_renderWidthPresets(bd.width, "lkb-w", [0, 0.75, 1.5, 2.5, 4])') &&
    /_renderWidthPresets\(bd\.width,[\s\S]*?flex-basis:100%;height:0;[\s\S]*?_distRangeHtml\("lkb-w"/.test(likertBorder));
check('Scatter fit width uses required-stroke presets',
    fit.includes('_renderWidthPresets(fitWidth, "f-width")') &&
    fit.includes('_wireWidthPresets(body)') &&
    fit.includes('_refreshWidthPresets(body, "f-width"'));
check('Zero-width scatter fit retains a wide transparent click target',
    fit.includes('data-field="f-width" min="0"') &&
    fitRendering.includes('_fitEl.setAttribute("pointer-events", "none")') &&
    fitRendering.includes('stroke: "transparent"') &&
    fitRendering.includes('"stroke-width": Math.max(_gFitWidth + 8, 14)') &&
    fitRendering.includes('"pointer-events": "stroke"') &&
    fitRendering.includes('"data-role": "xy-fit-hit"') &&
    fitRendering.includes('fitHitEl.addEventListener("click"') &&
    fitRendering.includes('dataGroup.appendChild(_fitHitEl)'));
check('Q-Q point outline uses marker-outline presets',
    qqOutline.includes('_renderWidthPresets(outW, "qq-outw", [0, 0.5, 1, 2])') &&
    qqOutline.includes('_wireWidthPresets(pane)') &&
    qqOutline.includes('_refreshWidthPresets(pane, "qq-outw"'));
check('Correlation cell border uses optional-stroke presets',
    corrCells.includes('_renderWidthPresets((typeof data.corrCellBorderWidth') &&
    corrCells.includes('"cr-bw", [0, 0.75, 1.5, 2.5, 4])') &&
    corrCells.includes('_wireWidthPresets(pane)'));

check('Filled-shape outline and line-shape stroke use distinct preset sets',
    shapes.includes('? [0, 0.75, 1.5, 2.5, 4]') &&
    shapes.includes(': [0.75, 1.5, 2.5, 4]') &&
    shapes.includes('_renderWidthPresets(_shLineWidth, "sh-linewidth", _shWidthPresets)'));
check('A filled-shape outline width of 0 is honored safely',
    shapeRendering.includes('ann.lineWidth >= 0') &&
    shapeRendering.includes('stroke === "none" || !(strokeWidth > 0)'));
check('Shape width has responsive slider, 48 px numeric input, and shared wiring',
    shapes.includes('style="\' + _shSlider + \'"') &&
    shapes.includes('data-field="sh-linewidth-num"') &&
    shapes.includes('style="\' + _GB2_DIM_NUM_CSS + \'"') &&
    source.includes('_wireWidthPresets(body);'));

const percentHelper = source.match(/function _gb2PercentUiValue\(fraction\) \{([\s\S]*?)\n        \}/);
let percentRoundTrip = false;
if (percentHelper) {
    const percentUiValue = new Function('fraction', percentHelper[1]);
    const displayed = percentUiValue(0.123);
    percentRoundTrip = displayed === 12.3 && Math.abs(displayed / 100 - 0.123) < 1e-12;
}
check('Fraction-to-percent helper preserves practical saved precision', percentRoundTrip);
check('Explicit percentage number fields accept off-step precision',
    distRange.includes('step="any"') &&
    barStyle.includes('data-field="vl-ib-width-num" min="0" max="100" step="any"'));
check('Violin, correlation, and Likert percentage controls round-trip without integer coercion',
    barStyle.includes('var _bsVBoxPct = _gb2PercentUiValue(_bsVBoxFrac);') &&
    barStyle.includes('function (v) { return v / 100; }') &&
    corrCells.includes('var _crScalePct = _gb2PercentUiValue(') &&
    corrCells.includes('_distRangeHtml("cr-scale", 40, 100, 2, _crScalePct, "% of cell", _crScalePct)') &&
    corrCells.includes('_distWireSlider(pane, "cr-scale", "corrCircleScale", 40, 100, false,') &&
    likertBars.includes('var gapPct = _gb2PercentUiValue(gapF);') &&
    likertBars.includes('_distRangeHtml("lk-rowgap", 0, 70, 5, gapPct, "% of row left empty", gapPct)') &&
    likertBars.includes('_distWireSlider(pane, "lk-rowgap", "likertRowGap", 0, 70, false,'));

if (failures) {
    console.error('\n' + failures + ' dimensional-control consistency check(s) failed');
    process.exit(1);
}
console.log('\ndimensional-control consistency checks passed');
