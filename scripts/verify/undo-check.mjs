// Headless probe for undo/redo COMPLETENESS (generic tracking, Jul 2026).
// Drives a real on-chart edit (poke data[k] + commit, the handler contract)
// for options that were NOT in the old TRACKED_OPTIONS allowlist, across every
// module, then asserts: the key becomes tracked, the snapshot captures it, undo
// reverts data[k] to its pre-edit value AND re-commits it, and redo re-applies.
// Also asserts the denylist (one-shot actions / structural type switch) is never
// tracked. Drives the battery pages in /tmp/gb2-verify (render.R output).
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(new URL('.', import.meta.url).pathname, process.cwd(), '/tmp', '/private/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next base */ }
    }
    throw new Error('playwright not found');
}

const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';
let fails = 0;
const ok = (label, cond) => { console.log((cond ? ' ok  ' : 'FAIL ') + label); if (!cond) fails++; };

const pw = loadPlaywright();
const browser = await pw.chromium.launch();

async function newPage() {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log('PAGE ERROR: ' + e.message); fails++; });
    // Installs BEFORE the widget IIFE, so window.setOption exists at IIFE time
    // and the undo wrapper arms. Records commits + clears any prior undo LS so
    // each page starts with a virgin (first-touch) tracked set.
    await page.addInitScript(() => {
        try {
            for (let i = window.localStorage.length - 1; i >= 0; i--) {
                const k = window.localStorage.key(i);
                if (k && k.indexOf('graphbuilder2.undo.') === 0) window.localStorage.removeItem(k);
            }
        } catch (e) {}
        window.setOption = function (k, v) {
            (window.__probeCommits = window.__probeCommits || []).push([k, v]);
        };
        // Stub of jamovi's Html-item element so the bundle's swap-deferral
        // patch (jmv-results-html render() wrap) can arm in the harness.
        try {
            customElements.define('jmv-results-html', class extends HTMLElement {
                render() { this.__rc = (this.__rc || 0) + 1; }
            });
        } catch (e) {}
    });
    return { ctx, page };
}

// One edit->undo->redo cycle on a previously-untracked key.
async function cycle(page, tag, key, newValFn) {
    const orig = await page.evaluate(k => window.gb2_undo.getData()[k], key);
    const nv = newValFn(orig);
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    ok(tag + ': test value differs from original', !eq(orig, nv));
    const stack0 = await page.evaluate(() => window.gb2_undo.stack.length);
    // Simulate the handler contract: poke data THEN commit.
    await page.evaluate(([k, v]) => {
        const d = window.gb2_undo.getData();
        d[k] = v;
        window.setOption(k, v);
    }, [key, nv]);
    await page.waitForTimeout(350); // > 250ms _undoTake debounce
    const tracked = await page.evaluate(k => window.gb2_undo.keys().indexOf(k) >= 0, key);
    ok(tag + ': key is now tracked', tracked);
    const snapVal = await page.evaluate(k => window.gb2_undo.last()[k], key);
    ok(tag + ': snapshot captured the new value', eq(snapVal, nv));
    const stack1 = await page.evaluate(() => window.gb2_undo.stack.length);
    ok(tag + ': one undo step was pushed', stack1 === stack0 + 1);
    // UNDO -> must revert data AND re-commit the old value. The re-commit
    // rides the NORMAL debounced pipeline (so a mid-gesture flush deferral
    // covers undo too); force the flush via the beforeunload handler before
    // reading the mock.
    await page.evaluate(() => window.gb2_undo.undo());
    const afterUndo = await page.evaluate(k => window.gb2_undo.getData()[k], key);
    ok(tag + ': UNDO reverts data[' + key + '] to original', eq(afterUndo, orig));
    await page.evaluate(() => window.dispatchEvent(new Event('beforeunload')));
    const reCommit = await page.evaluate(k => {
        // A migrated module (chartSpec) routes style commits through ONE
        // blob option; scan back for a direct key commit OR a chartSpec
        // commit carrying the key.
        const commits = window.__probeCommits || [];
        for (let i = commits.length - 1; i >= 0; i--) {
            const [ck, cv] = commits[i];
            if (ck === k) return cv;
            if (ck === 'chartSpec') { try { const o = JSON.parse(cv); if (k in o) return o[k]; } catch (e) {} }
        }
        return undefined;
    }, key);
    ok(tag + ': UNDO re-committed the original to R', eq(reCommit, orig));
    // REDO -> must re-apply the new value.
    await page.evaluate(() => window.gb2_undo.redo());
    const afterRedo = await page.evaluate(k => window.gb2_undo.getData()[k], key);
    ok(tag + ': REDO re-applies the new value', eq(afterRedo, nv));
}

const num = (base) => (o) => (typeof o === 'number' && isFinite(o)) ? o + base : base;
const flip = () => (o) => !o;

const CASES = [
    { page: 'cg_bar_labels', tests: [
        ['CG barValueLabels', 'barValueLabels', flip()],
        ['CG barNLabels', 'barNLabels', flip()],
        ['CG groupOpacities(array)', 'groupOpacities', () => [{ original: '__probe__', opacity: 0.33 }]],
    ]},
    { page: 'dist_density', tests: [
        ['DIST densLineWidth', 'densLineWidth', num(2.5)],
        ['DIST densKernel', 'densKernel', (o) => (o === 'epanechnikov' ? 'gaussian' : 'epanechnikov')],
    ]},
    { page: 'freq_pie', tests: [
        ['FREQ pieHole', 'pieHole', () => 0.3],
        ['FREQ pieStartAngle', 'pieStartAngle', num(45)],
    ]},
    { page: 'corr_heat', tests: [
        ['CORR corrDecimals', 'corrDecimals', num(2)],
        ['CORR corrTriangle', 'corrTriangle', (o) => (o === 'lower' ? 'upper' : 'lower')],
    ]},
    { page: 'likert_div', tests: [
        ['LIKERT likertRowGap', 'likertRowGap', num(6)],
        ['LIKERT likertShowValues', 'likertShowValues', flip()],
    ]},
];

for (const c of CASES) {
    console.log('== ' + c.page);
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, c.page + '.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        // The wrapper only arms when window.setOption existed at IIFE time.
        ok(c.page + ': undo diagnostics + wrapper present',
            await page.evaluate(() => !!(window.gb2_undo && window.gb2_undo.getData && window.gb2_undo.keys)));
        for (const [tag, key, fn] of c.tests) {
            // Only run keys the payload actually has (module-scoped).
            const present = await page.evaluate(k => {
                const d = window.gb2_undo.getData();
                return Object.prototype.hasOwnProperty.call(d, k);
            }, key);
            if (!present) { ok(tag + ': key present in payload', false); continue; }
            await cycle(page, tag, key, fn);
        }
    } catch (e) {
        ok(c.page + ': probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Reorder undo must revert the CHART instantly (not just data). Category order
// is derived at render entry (groupCats / _facetBuckets), so redraw() alone
// can't reflect it - undo must trigger a local re-render. This is the exact
// "drag to a new location, undo is slow" case.
{
    console.log('== reorder undo reverts chart order (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        const ORDER_SEL = '[data-role="x-cat-label"]';
        const readOrder = () => page.evaluate((sel) => {
            const seen = [], out = [];
            document.querySelectorAll(sel).forEach((e) => {
                const t = (e.textContent || '').trim();
                if (t && seen.indexOf(t) < 0) { seen.push(t); out.push(t); }
            });
            return out.join(',');
        }, ORDER_SEL);
        const orig = await readOrder();
        const origArr = orig ? orig.split(',') : [];
        ok('reorder: chart has >= 2 categories to reorder', origArr.length >= 2);
        if (origArr.length >= 2) {
            const reversed = origArr.slice().reverse();
            const reversedStr = reversed.join(',');
            // Commit a reversed order (what a drag-reorder persists), then apply
            // it visually (a real drag re-renders on release).
            await page.evaluate((ro) => { window.gb2_undo.getData().categoryOrder = ro; window.setOption('categoryOrder', ro); }, reversed);
            await page.waitForTimeout(350); // _undoTake pushes the pre-edit snapshot
            await page.evaluate(() => window.GraphBuilder2.render(
                document.querySelector('.graphbuilder2-host').id, JSON.parse(JSON.stringify(window.gb2_undo.getData()))));
            ok('reorder: chart shows the reordered categories', (await readOrder()) === reversedStr);
            // Undo. The probe has NO R backend, so redraw() alone (which cannot
            // rebuild render-entry order state) would leave it reordered forever;
            // a pass proves undo's OWN local re-render reverts it.
            const t0 = Date.now();
            await page.evaluate(() => window.gb2_undo.undo());
            let reverted = false;
            try {
                await page.waitForFunction((args) => {
                    const seen = [], out = [];
                    document.querySelectorAll(args.sel).forEach((e) => { const t = (e.textContent || '').trim(); if (t && seen.indexOf(t) < 0) { seen.push(t); out.push(t); } });
                    return out.join(',') === args.want;
                }, { sel: ORDER_SEL, want: orig }, { timeout: 2000 });
                reverted = true;
            } catch (e) { reverted = false; }
            ok('reorder: UNDO reverts chart order via local re-render (no R wait)', reverted);
            ok('reorder: revert was fast (< 800ms, not waiting on R)', reverted && (Date.now() - t0) < 800);
        }
    } catch (e) {
        ok('reorder probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Echo-race: undo must be seamless against jamovi's TRAILING echoes. jamovi
// re-posts results several times per run; after an edit settles, a duplicate
// echo carrying the just-undone payload can land AFTER the undo and used to
// repaint the pre-undo state for a beat (restored -> pre-undo -> restored, the
// "triple flash"). The fix pins every undone key in __gb2_recentCommits,
// released only by an AUTHORITATIVE render (R echo) that matches it - undo's
// own local re-render must NOT release it. Authoritative echoes are simulated
// by setting window.__gb2_authoritativeRender before render(), exactly as
// widget.R's loader does.
{
    console.log('== echo-race: trailing stale echo after undo (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        const ORDER_SEL = '[data-role="x-cat-label"]';
        const readOrder = () => page.evaluate((sel) => {
            const seen = [], out = [];
            document.querySelectorAll(sel).forEach((e) => {
                const t = (e.textContent || '').trim();
                if (t && seen.indexOf(t) < 0) { seen.push(t); out.push(t); }
            });
            return out.join(',');
        }, ORDER_SEL);
        // Render with an explicit categoryOrder; force past the pre-stamped
        // hash (a real drag needs no repaint - its DOM moved during the drag -
        // so _setOption's hash stamp deliberately skips clone re-renders).
        const render = (order, authoritative) => page.evaluate((args) => {
            const clone = JSON.parse(JSON.stringify(window.gb2_undo.getData()));
            if (args.order) {
                clone.categoryOrder = args.order;
                if (typeof clone.chartSpec === 'string') {
                    let o = {}; try { o = JSON.parse(clone.chartSpec) || {}; } catch (e) {}
                    o.categoryOrder = args.order; clone.chartSpec = JSON.stringify(o);
                }
            }
            window.__gb2_lastRenderedHash = null;
            if (args.authoritative) window.__gb2_authoritativeRender = true;
            window.GraphBuilder2.render(document.querySelector('.graphbuilder2-host').id, clone);
        }, { order, authoritative });
        const pinValue = () => page.evaluate(() => {
            const rc = window.__gb2_recentCommits || {};
            // Migrated module: categoryOrder rides inside the chartSpec pin.
            if (typeof rc.chartSpec === 'string') {
                try { const o = JSON.parse(rc.chartSpec); if ('categoryOrder' in o) return JSON.stringify(o.categoryOrder); } catch (e) {}
            }
            return Object.prototype.hasOwnProperty.call(rc, 'categoryOrder') ? JSON.stringify(rc.categoryOrder) : null;
        });
        const orig = await readOrder();
        const origArr = orig.split(',');
        const reversed = origArr.slice().reverse();
        ok('echo-race: >= 2 categories', origArr.length >= 2);
        // 1. Edit through the REAL debounced pipeline (pending -> flush -> recent),
        //    then the drag-release repaint.
        await page.evaluate((ro) => {
            window.gb2_undo.getData().categoryOrder = ro;
            window.__gb2_setOption('categoryOrder', ro);
        }, reversed);
        await render(null, false);
        ok('echo-race: chart shows the new order pre-flush', (await readOrder()) === reversed.join(','));
        await page.waitForTimeout(1900); // flush (1500ms) + undo snapshot (250ms)
        ok('echo-race: flush pinned the edit in recentCommits', (await pinValue()) === JSON.stringify(reversed));
        // 2. R's settling echo (authoritative, carries the NEW order) releases the pin.
        await render(reversed, true);
        ok('echo-race: settling echo released the pin', (await pinValue()) === null);
        ok('echo-race: chart still on the new order', (await readOrder()) === reversed.join(','));
        // 3. Undo -> instant revert; the reconcile re-pins the RESTORED value
        //    (the pre-edit snapshot - an implicit order persists as []).
        await page.evaluate(() => window.gb2_undo.undo());
        ok('echo-race: UNDO reverts the chart instantly', (await readOrder()) === orig);
        const restoredPin = await page.evaluate(() => JSON.stringify(window.gb2_undo.last().categoryOrder));
        ok('echo-race: undo re-pinned the restored value', (await pinValue()) === restoredPin);
        await page.waitForTimeout(150); // let _gb2RerenderSoon's LOCAL render run
        ok('echo-race: pin SURVIVES undo\'s own local re-render', (await pinValue()) === restoredPin);
        ok('echo-race: chart still restored after the local re-render', (await readOrder()) === orig);
        // 4. THE regression: a trailing authoritative echo still carrying the
        //    pre-undo payload must paint NOTHING new (pre-fix: flashed reversed).
        await render(reversed, true);
        ok('echo-race: trailing stale echo does NOT flash the pre-undo state', (await readOrder()) === orig);
        ok('echo-race: pin still armed after the stale echo', (await pinValue()) === restoredPin);
        // 5. The undo's own echo (authoritative, restored payload) releases the pin.
        await page.evaluate(() => {
            const clone = JSON.parse(JSON.stringify(window.gb2_undo.getData()));
            window.__gb2_lastRenderedHash = null;
            window.__gb2_authoritativeRender = true;
            window.GraphBuilder2.render(document.querySelector('.graphbuilder2-host').id, clone);
        });
        ok('echo-race: undo echo keeps the restored order', (await readOrder()) === orig);
        ok('echo-race: undo echo released the pin', (await pinValue()) === null);
    } catch (e) {
        ok('echo-race probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Multi-step LIFO: three sequential edits must undo in reverse order and redo
// forward ("take me back one step" repeatedly).
{
    console.log('== multi-step LIFO (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        const g = (k) => page.evaluate(kk => window.gb2_undo.getData()[kk], k);
        const orig = { vl: await g('barValueLabels'), op: await g('barOpacity'), cr: await g('barCornerRadius') };
        const targ = { vl: !orig.vl, op: (orig.op === 0.5 ? 0.7 : 0.5), cr: (orig.cr || 0) + 15 };
        const edit = (k, v) => page.evaluate(([kk, vv]) => { window.gb2_undo.getData()[kk] = vv; (window.__gb2_setOption || window.setOption)(kk, vv); }, [k, v]);
        await edit('barValueLabels', targ.vl); await page.waitForTimeout(300);
        await edit('barOpacity', targ.op); await page.waitForTimeout(300);
        await edit('barCornerRadius', targ.cr); await page.waitForTimeout(300);
        ok('multistep: three steps stacked', await page.evaluate(() => window.gb2_undo.stack.length) >= 3);
        // undo 1 -> cornerRadius reverts, others still at target
        await page.evaluate(() => window.gb2_undo.undo());
        ok('multistep: undo1 reverts corner only', (await g('barCornerRadius')) === orig.cr && (await g('barOpacity')) === targ.op && (await g('barValueLabels')) === targ.vl);
        await page.evaluate(() => window.gb2_undo.undo());
        ok('multistep: undo2 reverts opacity', (await g('barOpacity')) === orig.op && (await g('barValueLabels')) === targ.vl);
        await page.evaluate(() => window.gb2_undo.undo());
        ok('multistep: undo3 reverts value-labels (back to start)', (await g('barValueLabels')) === orig.vl && (await g('barOpacity')) === orig.op && (await g('barCornerRadius')) === orig.cr);
        // redo forward
        await page.evaluate(() => window.gb2_undo.redo());
        ok('multistep: redo1 re-applies value-labels', (await g('barValueLabels')) === targ.vl);
        await page.evaluate(() => window.gb2_undo.redo());
        await page.evaluate(() => window.gb2_undo.redo());
        ok('multistep: redo-to-end restores all targets', (await g('barValueLabels')) === targ.vl && (await g('barOpacity')) === targ.op && (await g('barCornerRadius')) === targ.cr);
    } catch (e) {
        ok('multistep probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Persistence across a re-mount: the undo stack must survive the IIFE
// re-executing (jamovi re-runs .run() on every content-changed commit). This is
// the path the elementId-keyed regression broke — the LS key must be STABLE
// (not derived from the per-render random widget_id).
{
    console.log('== persistence across re-mount (corr_heat)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'corr_heat.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        const orig = await page.evaluate(() => window.gb2_undo.getData().corrDecimals);
        await page.evaluate(() => {
            const d = window.gb2_undo.getData();
            d.corrDecimals = (d.corrDecimals || 2) + 3;
            window.setOption('corrDecimals', d.corrDecimals);
        });
        await page.waitForTimeout(350);
        ok('persist: LS key is stable (no per-render id)', await page.evaluate(() => {
            let found = null;
            for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i);
                if (k && k.indexOf('graphbuilder2.undo.') === 0) found = k;
            }
            // must be the bare stable key, not "...v2.gb2-<time>-<rand>"
            return found === 'graphbuilder2.undo.v2';
        }));
        ok('persist: stack written to LS', await page.evaluate(() => {
            const raw = window.localStorage.getItem('graphbuilder2.undo.v2');
            if (!raw) return false;
            const p = JSON.parse(raw);
            return Array.isArray(p.stack) && p.stack.length >= 1 && Array.isArray(p.keys) && p.keys.indexOf('corrDecimals') >= 0;
        }));
        // Re-run the IIFE (simulates jamovi's re-mount) with a fresh payload clone.
        await page.evaluate(() => {
            const id = document.querySelector('.graphbuilder2-host').id;
            window.GraphBuilder2.render(id, JSON.parse(JSON.stringify(window.gb2_undo.getData())));
        });
        await page.waitForTimeout(150);
        ok('persist: stack reloaded after re-mount', await page.evaluate(() => window.gb2_undo.stack.length >= 1));
        ok('persist: tracked key reloaded after re-mount', await page.evaluate(() => window.gb2_undo.keys().indexOf('corrDecimals') >= 0));
        await page.evaluate(() => window.gb2_undo.undo());
        const afterUndo = await page.evaluate(() => window.gb2_undo.getData().corrDecimals);
        ok('persist: UNDO after re-mount reverts to original', afterUndo === orig);
    } catch (e) {
        ok('persistence probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Annotations (added elements: drawn shapes / brackets / text) ride the
// special-cased annotationsJson path. "Add an element then undo" must remove it.
{
    console.log('== annotations add->undo->redo (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        const orig = await page.evaluate(() => JSON.stringify(window.gb2_undo.getData().annotations || []));
        await page.evaluate(() => {
            const d = window.gb2_undo.getData();
            if (!Array.isArray(d.annotations)) d.annotations = [];
            d.annotations.push({ id: '__probeShape__', kind: 'rect', x: 10, y: 10, w: 40, h: 30 });
            window.setOption('annotationsJson', JSON.stringify(d.annotations));
        });
        await page.waitForTimeout(350);
        const added = await page.evaluate(() => (window.gb2_undo.getData().annotations || []).some(a => a && a.id === '__probeShape__'));
        ok('annotations: element added to data', added);
        ok('annotations: undo step pushed', await page.evaluate(() => window.gb2_undo.stack.length) > 0);
        await page.evaluate(() => window.gb2_undo.undo());
        const afterUndo = await page.evaluate(() => JSON.stringify(window.gb2_undo.getData().annotations || []));
        ok('annotations: UNDO removes the added element', afterUndo === orig);
        await page.evaluate(() => window.gb2_undo.redo());
        const afterRedo = await page.evaluate(() => (window.gb2_undo.getData().annotations || []).some(a => a && a.id === '__probeShape__'));
        ok('annotations: REDO re-adds the element', afterRedo);
    } catch (e) {
        ok('annotations probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Swap-deferral: jamovi delivers every recompute by innerHTML-replacing the
// Html item's DOM (destroying a mid-drag element - the "ripped out of my
// hands" yank). The bundle wraps jmv-results-html's render() to HOLD the swap
// while a gesture is live on our chart and replay it (coalesced) on release.
{
    console.log('== swap-deferral: content swap held during a live gesture (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        ok('swap: bundle patched the Html item prototype', await page.evaluate(() => window.__gb2_htmlViewPatched === true));
        // Wrap the chart in a stub item (DOM move keeps the chart alive).
        await page.evaluate(() => {
            const el = document.createElement('jmv-results-html');
            document.body.appendChild(el);
            el.appendChild(document.querySelector('.graphbuilder2-host'));
            window.__probeItem = el;
            const el2 = document.createElement('jmv-results-html');
            document.body.appendChild(el2);
            window.__probeItemOther = el2;
        });
        const rc = (which) => page.evaluate(w => (w === 'other' ? window.__probeItemOther.__rc : window.__probeItem.__rc) || 0, which);
        // (a) idle: render applies immediately.
        await page.evaluate(() => window.__probeItem.render());
        ok('swap: idle render applies immediately', (await rc('mine')) === 1);
        // (b) live gesture on the chart: swap held, replays once on release.
        await page.evaluate(() => {
            const svgs = Array.from(document.querySelectorAll('svg'));
            const svg = svgs.sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
            svg.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            window.__probeItem.render();
            window.__probeItem.render(); // second delivery mid-hold: coalesces
        });
        await page.waitForTimeout(300);
        ok('swap: render held while the pointer is down', (await rc('mine')) === 1);
        // (c) an item NOT containing our chart is never deferred.
        await page.evaluate(() => window.__probeItemOther.render());
        ok('swap: unrelated item renders mid-gesture', (await rc('other')) === 1);
        // (d) release -> the held swap replays exactly once.
        await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
        await page.waitForTimeout(400);
        ok('swap: held swap replays once on release (coalesced)', (await rc('mine')) === 2);
    } catch (e) {
        ok('swap-deferral probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Focus keeper: a click on the item's inert whitespace must anchor keyboard
// focus on the HOST (so stray typing can never route to jamovi's spreadsheet
// and overwrite data cells); clicks on real controls (chart svg, toolbar
// buttons) keep their own focus untouched.
{
    console.log('== focus-keeper: whitespace clicks anchor focus in the widget (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        ok('focus: host is script-focusable (tabIndex -1)', await page.evaluate(() =>
            document.querySelector('.graphbuilder2-host').tabIndex === -1));
        // Find inert whitespace: inside the host box, right of the chart svg.
        const spot = await page.evaluate(() => {
            const host = document.querySelector('.graphbuilder2-host');
            const svg = Array.from(document.querySelectorAll('svg'))
                .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
            const h = host.getBoundingClientRect(), s = svg.getBoundingClientRect();
            const x = Math.min(h.right - 8, s.right + 60), y = s.top + s.height / 2;
            const el = document.elementFromPoint(x, y);
            const cl = el && el.closest('input,textarea,select,button,a,[contenteditable],[tabindex],svg,label');
            const inert = el && host.contains(el) && (!cl || cl === host);
            return { x, y, inert: !!inert };
        });
        ok('focus: found an inert whitespace spot beside the chart', spot.inert);
        if (spot.inert) {
            await page.mouse.click(spot.x, spot.y); // trusted CDP click
            await page.waitForTimeout(250); // settle loop 0/60/140ms
            ok('focus: whitespace click anchors focus on the host', await page.evaluate(() =>
                document.activeElement === document.querySelector('.graphbuilder2-host')));
        }
        // Chart click: svg (tabindex 0) takes focus; the keeper must not override.
        const svgSpot = await page.evaluate(() => {
            const svg = Array.from(document.querySelectorAll('svg'))
                .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
            const s = svg.getBoundingClientRect();
            return { x: s.left + s.width / 2, y: s.top + 10 };
        });
        await page.mouse.click(svgSpot.x, svgSpot.y);
        await page.waitForTimeout(250);
        ok('focus: chart click keeps focus on the svg (not the host)', await page.evaluate(() => {
            const ae = document.activeElement;
            return !!ae && ae !== document.body && ae !== document.querySelector('.graphbuilder2-host');
        }));
    } catch (e) {
        ok('focus-keeper probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

// Denylist: one-shot actions + structural type switch must never be tracked.
{
    console.log('== denylist (cg_bar_labels)');
    const { ctx, page } = await newPage();
    try {
        await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
        await page.waitForFunction(() => !!(window.gb2_undo && typeof window.setOption === 'function'), { timeout: 8000 });
        const stack0 = await page.evaluate(() => window.gb2_undo.stack.length);
        await page.evaluate(() => {
            window.setOption('exportRequest', '{"fmt":"png"}');
            window.setOption('paletteLibrary', '{"verb":"save"}');
            window.setOption('styleLibrary', '{"verb":"save"}');
            window.setOption('styleStamp', true);
            window.setOption('graphType', 'line');
        });
        await page.waitForTimeout(350);
        const keys = await page.evaluate(() => window.gb2_undo.keys());
        for (const dk of ['exportRequest', 'paletteLibrary', 'styleLibrary', 'styleStamp', 'graphType']) {
            ok('denylist: ' + dk + ' is NOT tracked', keys.indexOf(dk) < 0);
        }
        const stack1 = await page.evaluate(() => window.gb2_undo.stack.length);
        ok('denylist: no undo step created for action/structural commits', stack1 === stack0);
    } catch (e) {
        ok('denylist probe ran without exception (' + e.message + ')', false);
    } finally { await ctx.close(); }
}

await browser.close();
console.log('\n' + (fails === 0 ? 'UNDO-CHECK: ALL CHECKS PASSED' : 'UNDO-CHECK: ' + fails + ' FAILURE(S)'));
process.exit(fails === 0 ? 0 : 1);
