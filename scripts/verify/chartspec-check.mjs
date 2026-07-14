// chartSpec migration probe — browser driver (speed pass Phase 2).
// Verifies the core mechanism end-to-end on a real Compare Groups page:
//   1. route  - a style commit (_setOption) folds into ONE chartSpec
//               option instead of committing the individual key;
//   2. explode - an R echo carrying a populated chartSpec paints the
//               style values (data.* is reconstructed from the blob);
//   3. undo   - a routed style edit is per-key undoable + redoable;
//   4. persist - the committed chartSpec blob accumulates keys (a 2nd
//               edit keeps the 1st).
// Env: GB2_CHARTSPEC_OUT (default /tmp/gb2-chartspec)  GB2_NODE_BASE
import { createRequire } from 'node:module';
import path from 'node:path';
function loadPW() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(new URL('.', import.meta.url).pathname, process.cwd(), '/tmp', '/private/tmp');
    for (const b of bases) { try { return createRequire(path.join(b, 'x.js'))('playwright'); } catch {} }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPW();
const OUT = process.env.GB2_CHARTSPEC_OUT || '/tmp/gb2-chartspec';
let fails = 0;
const ok = (l, c) => { console.log((c ? '  ok: ' : '  FAIL: ') + l); if (!c) fails++; };

const MOCK = `window.__opts = [];
window.setOption = function (k, v) { window.__opts.push([k, v]); };`;

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addInitScript(MOCK);

// ---- fresh page: routing + persistence + undo ----
const p = await ctx.newPage();
await p.goto('file://' + path.join(OUT, 'fresh.html'));
await p.waitForFunction(() => document.querySelector('.graphbuilder2-host svg [data-bar-cat]'), null, { timeout: 20000 });

// The real-key set is built, chartSpec seeded empty.
ok('specRealSet built from payload', await p.evaluate(() =>
    !!window.gb2_undo && !!window.gb2_undo.getData().specRealKeys));

// Simulate a handler style edit: poke data (as handlers do) + commit via
// the exposed inner writer (the routing choke point). Wait past the 250ms
// undo debounce so the snapshot is taken (mirrors undo-check.mjs).
await p.evaluate(() => {
    const d = window.gb2_undo.getData();
    d.barCornerRadius = 14;                 // handler poke
    window.__gb2_setOption('barCornerRadius', 14);   // -> routes to chartSpec
});
await p.waitForTimeout(300);
// Force the debounced flush so the mock records the commit.
await p.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
const commit1 = await p.evaluate(() => (window.__opts || []).slice());
const routed = commit1.filter(o => o[0] === 'chartSpec');
ok('style edit commits chartSpec, NOT the raw key',
   routed.length === 1 && !commit1.some(o => o[0] === 'barCornerRadius'));
ok('chartSpec blob carries the edited key',
   routed.length === 1 && JSON.parse(routed[0][1]).barCornerRadius === 14);
ok('data.chartSpec poked for the hash', await p.evaluate(() => {
    try { return JSON.parse(window.gb2_undo.getData().chartSpec).barCornerRadius === 14; }
    catch { return false; }
}));

// Persistence: a 2nd edit keeps the 1st key in the blob.
await p.evaluate(() => {
    const d = window.gb2_undo.getData();
    d.barOpacity = 0.5;
    window.__gb2_setOption('barOpacity', 0.5);
});
await p.waitForTimeout(300);
await p.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
const blob2 = await p.evaluate(() => {
    const c = (window.__opts || []).filter(o => o[0] === 'chartSpec');
    return c.length ? JSON.parse(c[c.length - 1][1]) : {};
});
ok('2nd edit keeps 1st key (blob accumulates)',
   blob2.barCornerRadius === 14 && blob2.barOpacity === 0.5);

// Undo: the routed style key is per-key undoable (data reverts instantly).
ok('barCornerRadius is undo-tracked (per-key)', await p.evaluate(() =>
    window.gb2_undo.keys().indexOf('barCornerRadius') >= 0));
ok('chartSpec is NOT undo-tracked (denylisted)', await p.evaluate(() =>
    window.gb2_undo.keys().indexOf('chartSpec') < 0));
await p.evaluate(() => window.gb2_undo.undo());
await p.waitForTimeout(150);
ok('undo reverts the last routed edit (barOpacity)', await p.evaluate(() =>
    window.gb2_undo.getData().barOpacity !== 0.5));
await p.evaluate(() => window.gb2_undo.redo());
await p.waitForTimeout(150);
ok('redo restores it', await p.evaluate(() =>
    window.gb2_undo.getData().barOpacity === 0.5));
await p.close();

// ---- echo page: explode reconstructs data.* from a populated blob ----
const e = await ctx.newPage();
await e.goto('file://' + path.join(OUT, 'echo.html'));
await e.waitForFunction(() => document.querySelector('.graphbuilder2-host svg [data-bar-cat]'), null, { timeout: 20000 });
const exploded = await e.evaluate(() => {
    const d = window.gb2_undo.getData();
    return { corner: d.barCornerRadius, bg: d.chartBackground };
});
ok('echo explodes chartSpec into data.barCornerRadius', exploded.corner === 14);
ok('echo explodes chartSpec into data.chartBackground', exploded.bg === '#eef');
// Title re-derivation: a COMMITTED (not inline-typed) axis title rides
// chartSpec, so the render-entry re-derivation must set the rendered xLabel.
ok('echo re-derives xLabel from the routed title override', await e.evaluate(() =>
    window.gb2_undo.getData().xLabel === 'My X'));
await e.close();

// ---- attack page: allowlist refuses to explode non-style keys ----
const a = await ctx.newPage();
await a.goto('file://' + path.join(OUT, 'attack.html'));
await a.waitForFunction(() => document.querySelector('.graphbuilder2-host svg [data-bar-cat]'), null, { timeout: 20000 });
const atk = await a.evaluate(() => {
    const d = window.gb2_undo.getData();
    return {
        barsLen: Array.isArray(d.bars) ? d.bars.length : -1,
        annEvil: Array.isArray(d.annotations) && d.annotations.some(x => x && x.kind === 'evil'),
        xCats: JSON.stringify(d.xCategories),
        corner: d.barCornerRadius,
    };
});
ok('attack: computed bars NOT clobbered by crafted chartSpec', atk.barsLen > 0);
ok('attack: annotations NOT clobbered by crafted chartSpec', atk.annEvil === false);
ok('attack: xCategories NOT clobbered', atk.xCats !== '["z"]');
ok('attack: legit style key still explodes', atk.corner === 9);
await a.close();

await ctx.close();
await browser.close();
if (fails > 0) { console.error(fails + ' chartspec probe failure(s)'); process.exit(1); }
console.log('chartSpec migration probe: all checks passed');
