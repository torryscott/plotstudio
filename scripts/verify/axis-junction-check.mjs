// Regression checks for the Cartesian X/Y axis junction. The two axes keep
// independent widths, but their center/outer-edge geometry must overlap
// cleanly so fractional SVG strokes do not leave a notch at the origin.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [process.env.GB2_NODE_BASE, process.cwd(), '/tmp', '/private/tmp'].filter(Boolean);
    for (const base of bases) {
        try { return createRequire(path.join(base, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    throw new Error('playwright not found (set GB2_NODE_BASE)');
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

let failures = 0;
function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) failures++;
}
function near(a, b, epsilon = 0.01) {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= epsilon;
}

async function rerenderWith(changes) {
    await page.evaluate(patch => {
        let payload = window.__gb2_payload;
        if (!payload) {
            const script = document.querySelector('script')?.textContent || '';
            const marker = 'var __gb2_payload = ';
            const start = script.indexOf(marker) + marker.length;
            const end = script.indexOf(';\nvar __gb2_id =', start);
            if (start < marker.length || end < 0)
                throw new Error('Embedded GraphBuilder payload not found');
            payload = JSON.parse(script.slice(start, end));
        }
        payload = JSON.parse(JSON.stringify(payload));
        Object.assign(payload, patch);
        const id = document.querySelector('.graphbuilder2-host')?.id;
        window.__gb2_payload = payload;
        window.GraphBuilder2.render(id, payload);
    }, changes);
    await page.waitForTimeout(20);
}

async function geometry() {
    return page.evaluate(() => {
        function read(role) {
            const el = document.querySelector('[data-role="' + role + '"]');
            if (!el) return null;
            return {
                tag: el.tagName.toLowerCase(),
                x1: +(el.getAttribute('x1') || NaN),
                x2: +(el.getAttribute('x2') || NaN),
                y1: +(el.getAttribute('y1') || NaN),
                y2: +(el.getAttribute('y2') || NaN),
                width: +(el.getAttribute('stroke-width') || NaN),
                linecap: el.getAttribute('stroke-linecap') || ''
            };
        }
        return { x: read('x-axis-line'), y: read('y-axis-line') };
    });
}

await page.goto('file://' + path.join(OUT, 'cg_dot.html'));
await page.waitForSelector('svg', { timeout: 10000 });

const widthCases = [
    { label: 'default widths', x: 1.5, y: 1.5 },
    { label: 'thick X / thin Y', x: 4, y: 1 },
    { label: 'thin X / thick Y', x: 1, y: 4 },
    { label: 'fractional X / thick Y', x: 0.75, y: 4 },
    { label: 'thick X / fractional Y', x: 4, y: 0.75 }
];

for (const c of widthCases) {
    await rerenderWith({
        xAxisThickness: c.x,
        yAxisThickness: c.y,
        xAxisStyle: 'solid',
        yAxisStyle: 'solid',
        xAxisBreak: false,
        yAxisBreak: false,
        hiddenElements: []
    });
    const g = await geometry();
    check(c.label + ' renders both axes', !!g.x && !!g.y);
    if (!g.x || !g.y) continue;
    check(c.label + ' preserves independent stroke widths',
        near(g.x.width, c.x) && near(g.y.width, c.y),
        'X=' + g.x.width + ', Y=' + g.y.width);
    check(c.label + ' meets Y endpoint to X centerline',
        near(g.y.y2, g.x.y1),
        'Y end=' + g.y.y2 + ', X center=' + g.x.y1);
    check(c.label + ' starts X at Y outer edge',
        near(g.x.x1, g.y.x1 - g.y.width / 2),
        'X start=' + g.x.x1 + ', Y outer=' + (g.y.x1 - g.y.width / 2));
    check(c.label + ' uses deterministic butt caps',
        g.x.linecap === 'butt' && g.y.linecap === 'butt');
}

// A hidden adjoining axis must not leave a width-dependent phantom stub.
await rerenderWith({
    xAxisThickness: 1,
    yAxisThickness: 2,
    hiddenElements: ['xAxisLine']
});
const hiddenXThin = await geometry();
await rerenderWith({
    xAxisThickness: 4,
    yAxisThickness: 2,
    hiddenElements: ['xAxisLine']
});
const hiddenXThick = await geometry();
check('hidden X removes only the X line',
    !hiddenXThin.x && !!hiddenXThin.y && !hiddenXThick.x && !!hiddenXThick.y);
check('hidden X width does not move the visible Y endpoint',
    !!hiddenXThin.y && !!hiddenXThick.y && near(hiddenXThin.y.y2, hiddenXThick.y.y2),
    hiddenXThin.y && hiddenXThick.y
        ? hiddenXThin.y.y2 + ' vs ' + hiddenXThick.y.y2 : 'missing Y line');

await rerenderWith({
    xAxisThickness: 2,
    yAxisThickness: 1,
    hiddenElements: ['yAxisLine']
});
const hiddenYThin = await geometry();
await rerenderWith({
    xAxisThickness: 2,
    yAxisThickness: 4,
    hiddenElements: ['yAxisLine']
});
const hiddenYThick = await geometry();
check('hidden Y removes only the Y line',
    !!hiddenYThin.x && !hiddenYThin.y && !!hiddenYThick.x && !hiddenYThick.y);
check('hidden Y preserves the independent visible X width',
    !!hiddenYThin.x && !!hiddenYThick.x &&
        near(hiddenYThin.x.width, 2) && near(hiddenYThick.x.width, 2),
    hiddenYThin.x && hiddenYThick.x
        ? hiddenYThin.x.width + ' vs ' + hiddenYThick.x.width : 'missing X line');

check('axis-junction page has no runtime errors', pageErrors.length === 0, pageErrors.join(' | '));

await ctx.close();
await browser.close();

if (failures) {
    console.error('\n' + failures + ' axis-junction check(s) failed');
    process.exit(1);
}
console.log('\naxis-junction checks passed');
