// Static-snapshot fallback probe, browser half (see snapshot-probe.R
// for the page generator). Asserts the full lifecycle:
//
//   1. live machine, snapshot embedded: chart renders, the fallback
//      <img> NEVER becomes visible (not even past the reveal windows)
//   2. module-less machine (cached page, no setOption, empty
//      localStorage), snapshot embedded: after the module-missing
//      window the fallback img is REVEALED and the host is hidden
//   3. module-less machine, NO snapshot (pre-snapshot file): the
//      honest "needs the Plot Studio module" message replaces
//      "Loading chart engine" instead of spinning forever
//   4. snapshot COMMIT: a live content-changed render serializes the
//      settled chart and commits "<sig>|<svg>" through chartSnapshot
//      as a REAL option (not folded into the chartSpec blob - the
//      spec-routing regression guard)
//   5. no re-commit: a render whose payload already carries the
//      matching chartSnapshotKey never commits again (the no-loop
//      guarantee)
//
// Usage: node scripts/verify/snapshot-check.mjs
// Env:   GB2_SNAP_OUT   dir holding the probe pages (default /tmp/gb2-snap-probe)
//        GB2_NODE_BASE  a dir whose node_modules contains playwright

import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(
        new URL('.', import.meta.url).pathname,
        process.cwd(),
        '/tmp',
        '/private/tmp',
    );
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next base */ }
    }
    console.error('playwright not found; cd /tmp && npm i playwright');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_SNAP_OUT || '/tmp/gb2-snap-probe';

let fails = 0;
function expect(label, cond) {
    if (cond) console.log('  ok: ' + label);
    else { console.log('  FAIL: ' + label); fails++; }
}

const browser = await chromium.launch();
async function freshPage(initScript) {
    const ctx = await browser.newContext();
    if (initScript) await ctx.addInitScript(initScript);
    const page = await ctx.newPage();
    return { ctx, page };
}

const snapState = () => ({
    fallback: (() => {
        const d = document.querySelector('[data-role=gb2-static-fallback]');
        if (!d) return null;
        const img = d.querySelector('img');
        const cap = d.querySelector('[data-role=gb2-static-fallback-caption]');
        const save = d.querySelector('[data-role=gb2-snap-save]');
        return {
            shown: getComputedStyle(d).display !== 'none',
            imgOk: !!(img && (img.getAttribute('src') || '').indexOf('data:image/svg+xml;base64,') === 0),
            captionShown: !!(cap && getComputedStyle(cap).display !== 'none'),
            saveWired: !!(save && (save.getAttribute('href') || '').indexOf('data:image/svg+xml;base64,') === 0),
        };
    })(),
    chart: document.querySelectorAll('svg [data-bar-cat]').length,
    hostShown: (() => {
        const h = document.querySelector('.graphbuilder2-host');
        return h ? getComputedStyle(h).display !== 'none' : false;
    })(),
    bodyText: document.body.innerText || '',
});

// ---- 1. live machine: fallback exists but never shows
{
    const { ctx, page } = await freshPage('window.__gb2_mmDelay = 1200;');
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0,
        null, { timeout: 30000 });
    await page.waitForTimeout(7000); // outlast diag reveal + mm window
    const st = await page.evaluate(snapState);
    expect('live: chart drawn', st.chart > 0);
    expect('live: fallback embedded but NEVER revealed',
           st.fallback !== null && !st.fallback.shown);
    await ctx.close();
}

// ---- 2. module-less machine WITH snapshot: INSTANT picture, staged caption
{
    const { ctx, page } = await freshPage('window.__gb2_mmDelay = 1500;');
    await page.goto('file://' + path.join(OUT, 'snap-cached.html'));
    await page.waitForTimeout(350); // scripts have run; timers have NOT
    let st = await page.evaluate(snapState);
    expect('module-less: img revealed IMMEDIATELY (Torry\'s 20 s report)',
           st.fallback !== null && st.fallback.shown && st.fallback.imgOk);
    expect('module-less: caption still held back at load',
           !st.fallback.captionShown);
    expect('module-less: NO "Loading chart engine" noise over the picture',
           st.bodyText.indexOf('Loading chart engine') < 0);
    expect('module-less: host hidden from the start (picture only)',
           !st.hostShown);
    await page.waitForFunction(() => {
        const c = document.querySelector('[data-role=gb2-static-fallback-caption]');
        return c && getComputedStyle(c).display !== 'none';
    }, null, { timeout: 12000 });
    st = await page.evaluate(snapState);
    expect('module-less: caption confirmed after the window', st.fallback.captionShown);
    expect('module-less: Save image link wired to the data URI', st.fallback.saveWired);
    expect('module-less: host (loading note) hidden', !st.hostShown);
    expect('module-less: caption explains + points at install',
           st.bodyText.indexOf('made with the Plot Studio module') >= 0);
    await ctx.close();
}

// ---- 2b. fast path: no setOption bridge at all -> caption at ~3 s,
//          NOT the 8 s worst case (mmDelay pinned high to isolate it)
{
    const { ctx, page } = await freshPage('window.__gb2_mmDelay = 60000;');
    const t0 = Date.now();
    await page.goto('file://' + path.join(OUT, 'snap-cached.html'));
    await page.waitForFunction(() => {
        const c = document.querySelector('[data-role=gb2-static-fallback-caption]');
        return c && getComputedStyle(c).display !== 'none';
    }, null, { timeout: 10000 });
    const dt = Date.now() - t0;
    expect('fast path: caption via the 3 s no-bridge check (' + dt + ' ms)',
           dt < 6000);
    await ctx.close();
}

// ---- 3. module-less machine WITHOUT snapshot: honest message
{
    const { ctx, page } = await freshPage('window.__gb2_mmDelay = 1500;');
    await page.goto('file://' + path.join(OUT, 'plain-cached.html'));
    await page.waitForFunction(() =>
        !!document.querySelector('[data-role=gb2-module-missing]'),
        null, { timeout: 12000 });
    const txt = await page.evaluate(() => document.body.innerText || '');
    expect('no-snapshot: module-missing message shown',
           txt.indexOf('needs the Plot Studio module') >= 0);
    expect('no-snapshot: stale "resolves by itself" note gone',
           txt.indexOf('resolves by itself') < 0);
    await ctx.close();
}

// ---- 4 + 5. commit fires once, as a REAL option, then never re-commits
{
    const MOCK = `window.__setOpts = [];
window.setOption = function (k, v) { window.__setOpts.push([k, v]); };
window.__gb2_snapDelay = 400;`;
    const { ctx, page } = await freshPage(MOCK);
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        (window.__setOpts || []).some(o => o[0] === 'chartSnapshot'),
        null, { timeout: 20000 });
    const commit = await page.evaluate(() =>
        (window.__setOpts || []).filter(o => o[0] === 'chartSnapshot').map(o => o[1]));
    expect('commit: fired through chartSnapshot (REAL option, not chartSpec)',
           commit.length >= 1);
    expect('commit: value is "<sig>|<svg...>"',
           /^\d+:-?\d+\|\s*<svg/.test(commit[0] || ''));
    const specLeak = await page.evaluate(() =>
        (window.__setOpts || []).some(o =>
            o[0] === 'chartSpec' && String(o[1]).indexOf('chartSnapshot') >= 0));
    expect('commit: never folded into the chartSpec blob', !specLeak);

    // 5. re-render with the matching key already in the payload: no commit
    const again = await page.evaluate(async (val) => {
        const key = val.slice(0, val.indexOf('|'));
        const host = document.querySelector('.graphbuilder2-host');
        // rebuild from the embedded payload with chartSnapshotKey patched in
        const marker = 'var __gb2_payload = ';
        const script = [...document.querySelectorAll('script')]
            .map(el => el.textContent || '').find(t => t.includes(marker)) || '';
        const start = script.indexOf(marker) + marker.length;
        const end = script.indexOf(';\nvar __gb2_id =', start);
        const payload = JSON.parse(script.slice(start, end));
        payload.chartSnapshotKey = key;
        window.__gb2_snapKey = null;              // defeat the session fast-path
        const before = (window.__setOpts || []).filter(o => o[0] === 'chartSnapshot').length;
        window.GraphBuilder2.render(host.id, payload);
        await new Promise(r => setTimeout(r, 1400)); // > snapDelay
        const after = (window.__setOpts || []).filter(o => o[0] === 'chartSnapshot').length;
        return { before, after };
    }, commit[0]);
    expect('no-loop: matching chartSnapshotKey suppresses the re-commit',
           again.after === again.before);
    await ctx.close();
}

await browser.close();
console.log(fails === 0 ? 'snapshot-check: ALL OK' : `snapshot-check: ${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
