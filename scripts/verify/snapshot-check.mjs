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

// ---- 6 + 7. native snapshot-Image coordination (the Distribution
//      prototype): jamovi renders the snapshotImage result as a served
//      <img>. Live machine -> the loader hides the native copy (and its
//      heading); module-less -> the native copy IS the picture and our
//      data-URI img is suppressed so the chart never doubles.
// jamovi's REAL Image-result structure (verified in the resultsview
// source): a <jmv-results-image> custom element = hN.jmv-results-image-
// title + a div whose css background-image carries the picture. No
// <img> tag - the v1 matcher's img scan was structurally blind to it.
const INJECT_NATIVE = `document.addEventListener('DOMContentLoaded', function () {
    const w = document.createElement('jmv-results-image');
    w.setAttribute('data-probe-native', '1');
    w.style.display = 'block';
    const h = document.createElement('h2');
    h.className = 'jmv-results-image-title';
    h.textContent = 'Chart (static copy)';
    const d = document.createElement('div');
    d.style.cssText = "width:200px;height:120px;background-image:url('res/64.png')";
    w.appendChild(h); w.appendChild(d);
    document.body.appendChild(w);
});`;
const nativeState = () => {
    const w = document.querySelector('[data-probe-native]');
    const h = w ? w.querySelector('.jmv-results-image-title') : null;
    const ourImg = document.querySelector('[data-role=gb2-static-fallback] img');
    return {
        natShown: !!(w && getComputedStyle(w).display !== 'none'),
        // children of a display:none parent keep their own computed
        // display - actual rendering is what getClientRects answers
        headShown: h ? h.getClientRects().length > 0 : null,
        ourImgShown: !!(ourImg && getComputedStyle(ourImg).display !== 'none'),
    };
};
{
    const { ctx, page } = await freshPage(INJECT_NATIVE);
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0,
        null, { timeout: 30000 });
    await page.waitForTimeout(2000); // outlast the 400/1500 ms sync passes
    const st = await page.evaluate(nativeState);
    expect('native-live: native copy hidden on a live machine', !st.natShown);
    expect('native-live: its heading hidden too', st.headShown === false);
    await ctx.close();
}
{
    const { ctx, page } = await freshPage(
        INJECT_NATIVE + '\nwindow.__gb2_mmDelay = 1500;');
    await page.goto('file://' + path.join(OUT, 'snap-cached.html'));
    await page.waitForTimeout(2000);
    const st = await page.evaluate(nativeState);
    expect('native-moduleless: native copy stays visible', st.natShown);
    expect('native-moduleless: our data-URI img suppressed (no double picture)',
           !st.ourImgShown);
    const cap = await page.evaluate(() => {
        const c = document.querySelector('[data-role=gb2-static-fallback-caption]');
        return c ? getComputedStyle(c).display !== 'none' : false;
    });
    expect('native-moduleless: caption still explains install', cap);
    await ctx.close();
}

// ---- 8. export-clean chrome: every chrome element carries jamovi's
//      .ignore-html serializer opt-out (THAT is what keeps copies and
//      exports chart-only), and chrome STAYS VISIBLE on screen at all
//      times - the old hide-on-blur behavior is retired (Torry: the
//      top bar appearing/disappearing read as broken; hiding never
//      served exports once the tagging existed).
{
    const { ctx, page } = await freshPage('');
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0,
        null, { timeout: 30000 });
    let st = await page.evaluate(() => ({
        chromeTagged: document.querySelectorAll('[data-gb2-chrome]').length,
        allOptedOut: [...document.querySelectorAll('[data-gb2-chrome]')]
            .every(el => el.classList.contains('ignore-html')),
    }));
    expect('chrome: tagged at render', st.chromeTagged > 0);
    expect('chrome: every tagged element carries ignore-html', st.allOptedOut);
    // Blur must change NOTHING on screen (the retired behavior hid
    // chrome 1.2 s after focus left the document). Some chrome is
    // legitimately display:none at rest (collapsed panels, closed
    // menus) - the assertion is that the hidden SET does not grow.
    st = await page.evaluate(async () => {
        const hiddenSet = () => [...document.querySelectorAll('[data-gb2-chrome]')]
            .filter(el => getComputedStyle(el).display === 'none').length;
        const before = hiddenSet();
        window.dispatchEvent(new Event('blur'));
        await new Promise(r => setTimeout(r, 1600));
        const chart = document.querySelector('svg[data-role=gb2-chart-svg]');
        return {
            idleClass: document.querySelector('.graphbuilder2-host').classList.contains('gb2-chrome-idle'),
            grew: hiddenSet() > before,
            chartShown: !!(chart && chart.getClientRects().length > 0),
        };
    });
    expect('chrome: blur never hides it (behavior retired)', !st.idleClass && !st.grew);
    expect('chrome: the chart stays visible', st.chartShown);
    const skip = await page.evaluate(() => {
        const b = document.querySelector('button[data-role=gb2-skip-chart]');
        return b ? { text: (b.textContent || '').trim(), aria: b.getAttribute('aria-label') || '' } : null;
    });
    expect('chrome: skip-link label is attribute-only (export-invisible)',
           skip !== null && skip.text === '' && skip.aria === 'Skip to chart');
    await ctx.close();
}

// ---- 9. right-click Copy puts a REAL PNG on the clipboard (Office
//      drops inline <svg> from pasted HTML, so jamovi's stock copy of a
//      live widget pasted as text runs - Torry's PowerPoint test). The
//      bundle wraps copyContentToClipboard on the results-element class;
//      stub the class (the undo-check pattern) and drive a copy.
{
    const STUB = `customElements.define('jmv-results-html', class extends HTMLElement {
        render() {}
        copyContentToClipboard() { window.__origCopyCalled = true; }
    });`;
    const ctx = await browser.newContext();
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const page = await ctx.newPage();
    await page.addInitScript(STUB);
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0,
        null, { timeout: 30000 });
    const wired = await page.evaluate(() => {
        // wrap the live host in group > item elements, as jamovi does
        const host = document.querySelector('.graphbuilder2-host');
        const grp = document.createElement('jmv-results-group');
        const el = document.createElement('jmv-results-html');
        host.parentNode.insertBefore(grp, host);
        grp.appendChild(el);
        el.appendChild(host);
        return {
            patched: !!window.__gb2_copyPatched,
            serializer: typeof host.__gb2_serializeSvg === 'function',
        };
    });
    expect('copy: patch installed + serializer exposed',
           wired.patched && wired.serializer);
    // jamovi-native flavor route: chrome opted out via jamovi's OWN
    // .ignore-html mechanism, and the item wears the image classes so
    // getcontent picks the image/png flavor for right-click Copy.
    // The impersonation needs the results-element ANCESTOR at render
    // time; the reparent above happened after render, so re-render.
    await page.evaluate(() => {
        const host = document.querySelector('.graphbuilder2-host');
        const marker = 'var __gb2_payload = ';
        const script = [...document.querySelectorAll('script')]
            .map(el => el.textContent || '').find(t => t.includes(marker)) || '';
        const start = script.indexOf(marker) + marker.length;
        const end = script.indexOf(';\nvar __gb2_id =', start);
        window.__gb2_lastRenderedHash = null; // defeat the hash-skip
        window.GraphBuilder2.render(host.id, JSON.parse(script.slice(start, end)));
    });
    await page.waitForTimeout(300);
    const native = await page.evaluate(() => {
        const chrome = [...document.querySelectorAll('[data-gb2-chrome]')];
        const svgEl = document.querySelector('svg[data-role=gb2-chart-svg]');
        let card = svgEl;
        const host = document.querySelector('.graphbuilder2-host');
        while (card && card.parentElement && card.parentElement !== host) card = card.parentElement;
        return {
            allOptedOut: chrome.length > 0 && chrome.every(el => el.classList.contains('ignore-html')),
            // the PowerPoint root cause: outerHTML of a namespace-created
            // svg omits xmlns, and jamovi's copy rasterizer parses it as
            // strict XML - graphics vanish, text flattens. The attribute
            // must be ON the live element.
            chartHasNs: svgEl.getAttribute('xmlns') === 'http://www.w3.org/2000/svg',
            cardMarked: !!(card && card !== svgEl && card.classList.contains('jmv-results-image-image')),
            itemMarked: !!document.querySelector('jmv-results-html.jmv-results-image'),
            groupMarked: !!document.querySelector('jmv-results-group.jmv-results-image'),
            chartClean: !svgEl.classList.contains('ignore-html'),
        };
    });
    expect('copy: every chrome element carries jamovi\'s ignore-html opt-out',
           native.allOptedOut);
    expect('copy: chart svg carries explicit xmlns (the rasterizer root cause)',
           native.chartHasNs);
    expect('copy: chart card wears the image-flavor class', native.cardMarked);
    expect('copy: ITEM classed for item-level Copy', native.itemMarked);
    expect('copy: GROUP classed for analysis-level Copy (the level Torry used)',
           native.groupMarked);
    expect('copy: the chart itself is NOT opted out', native.chartClean);
    await page.evaluate(() => {
        document.querySelector('jmv-results-html').copyContentToClipboard();
    });
    await page.waitForFunction(() => window.__gb2_lastCopyPath === 'png',
        null, { timeout: 15000 });
    expect('copy: PNG path taken (no fallback)', true);
    const clip = await page.evaluate(async () => {
        try {
            const items = await navigator.clipboard.read();
            const types = [];
            for (const it of items) types.push(...it.types);
            let pngBytes = 0, htmlHasImg = false;
            for (const it of items) {
                if (it.types.includes('image/png')) {
                    pngBytes = (await it.getType('image/png')).size;
                }
                if (it.types.includes('text/html')) {
                    const t = await (await it.getType('text/html')).text();
                    htmlHasImg = t.includes('<img') && t.includes('data:image/png');
                }
            }
            return { types, pngBytes, htmlHasImg };
        } catch (e) { return { err: String(e) }; }
    });
    expect('copy: clipboard carries a pasteable image ' +
           JSON.stringify(clip.types || clip.err),
           !clip.err && (clip.pngBytes > 5000 || clip.htmlHasImg));
    // negative control: an item WITHOUT our widget falls through
    const orig = await page.evaluate(() => {
        const other = document.createElement('jmv-results-html');
        document.body.appendChild(other);
        other.copyContentToClipboard();
        return !!window.__origCopyCalled;
    });
    expect('copy: non-widget items use the original path', orig);
    await ctx.close();
}

// ---- 10. getcontent watchdog: jamovi's copy pipeline hanging (their
//      rasterizer has no onerror) must not strand the copy - if no
//      reply lands, OUR reply completes it with a real PNG. Harness
//      page = the "main window"; iframe = the results page.
{
    const { writeFileSync } = await import('node:fs');
    const harness = `<!doctype html><meta charset="utf-8">
<iframe id="f" src="snap-inline.html" style="width:1000px;height:800px"></iframe>
<script>
window.__replies = [];
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'getcontent') window.__replies.push(e.data.data);
});
window.__ask = function (addr) {
    // the menu-copy fingerprint: jmvrefs exclude -> the FAST rescue path.
    // addr defaults to the item level; [] is the analysis level (the
    // post-shift remainder jamovi posts for an analysis-level copy).
    document.getElementById('f').contentWindow.postMessage(
        { type: 'getcontent', data: { address: (addr || ['widget']),
          options: { exclude: ['.jmvrefs', 'jmv-reference-numbers'], images: 'absolute',
                     margin: '24', docType: true } } }, '*');
};
</script>`;
    writeFileSync(path.join(OUT, 'watchdog-harness.html'), harness);
    const ctx = await browser.newContext();
    // NO watchdogMs override: assert the real fast-path timing
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(OUT, 'watchdog-harness.html'));
    const frame = page.frames().find(f => f.url().includes('snap-inline'));
    await frame.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0, null, { timeout: 30000 });
    const t0 = Date.now();
    await page.evaluate(() => window.__ask());
    await page.waitForFunction(() => window.__replies.length > 0, null, { timeout: 15000 });
    const rescueMs = Date.now() - t0;
    expect('watchdog: copy-fingerprinted rescue is FAST (' + rescueMs + ' ms)',
           rescueMs < 3500);
    const reply = await page.evaluate(() => {
        const r = window.__replies[0];
        return {
            addr: JSON.stringify(r.address),
            hasImage: !!(r.content && (r.content.image || '').startsWith('data:image/png;base64,')),
            imgLen: r.content && r.content.image ? r.content.image.length : 0,
            htmlHasImg: !!(r.content && (r.content.html || '').includes('<img src="data:image/png')),
        };
    });
    expect('watchdog: rescue reply posted with the request address',
           reply.addr === '["widget"]');
    expect('watchdog: reply carries a real PNG (' + reply.imgLen + ' chars)',
           reply.hasImage && reply.imgLen > 10000);
    expect('watchdog: html flavor carries the embedded image', reply.htmlHasImg);
    const diag = await frame.evaluate(() => window.__gb2_copyDiag || '');
    expect('watchdog: diag records the rescue (' + diag + ')',
           /^reply posted/.test(diag));

    // Stage trail: every step of the observed copy is on record, in
    // order, so a field failure names its exact dying stage.
    const stages = await frame.evaluate(() => (window.__gb2_copyStages || []).join('\n'));
    for (const s of ['request received ["widget"] (copy)', 'rasterize target',
                     'svg serialized', 'rescue timer armed 1500 ms',
                     'svg image loaded', 'canvas encoded', 'reply posted ["widget"]'])
        expect('watchdog: stage logged - ' + s, stages.includes(s));

    // Live overlay: with the debug overlay ON SCREEN, a new copy
    // request must rebuild it in place (the static-overlay bug: the
    // screenshot instruction was invalid because nothing refreshed).
    await frame.evaluate(() => {
        window.localStorage.setItem('gb2_debug_timing', '1');
        window.__gb2_buildDbgOverlay();
    });
    const preTxt = await frame.evaluate(() =>
        document.querySelector('[data-role="gb2-debug"]').textContent);
    expect('watchdog: overlay shows the stage trail', preTxt.includes('Copy stages:'));

    // Analysis-level address []: truthy (empty array), passes the
    // guard, rescues, and the live overlay picks the new request up
    // WITHOUT a re-toggle.
    await page.evaluate(() => window.__ask([]));
    await page.waitForFunction(() => window.__replies.length > 1, null, { timeout: 15000 });
    const reply2 = await page.evaluate(() => {
        const r = window.__replies[1];
        return {
            addr: JSON.stringify(r.address),
            hasImage: !!(r.content && (r.content.image || '').startsWith('data:image/png;base64,')),
        };
    });
    expect('watchdog: analysis-level [] address rescued too', reply2.addr === '[]' && reply2.hasImage);
    const postTxt = await frame.evaluate(() =>
        document.querySelector('[data-role="gb2-debug"]').textContent);
    expect('watchdog: overlay updated LIVE with the [] request',
           postTxt.includes('request received [] (copy)') && postTxt.includes('reply posted []'));
    await frame.evaluate(() => window.localStorage.removeItem('gb2_debug_timing'));
    await ctx.close();
}

// ---- 11. copy-clean swap: during a COPY serialization window the
//      widget presents as one picture - host opted out (.ignore-html),
//      invisible png background-image div included (jamovi's
//      _htmlifyDiv contract: copies only width/height, so opacity:0
//      never rides). Exports (no docType) must NOT swap - they keep
//      the vector svg.
{
    // The scheduler that builds the png cache gates on hasSetOption
    // (read-only pages never snapshot), so mock it like cases 4+5 do.
    const MOCK = `window.setOption = function () {};
window.__gb2_snapDelay = 300;`;
    const { ctx, page } = await freshPage(MOCK);
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0, null, { timeout: 30000 });

    // The png cache rides the snapshot debounce + an async raster -
    // wait for the div to exist.
    await page.waitForFunction(() =>
        !!document.querySelector('[data-role="gb2-copy-div"]'), null, { timeout: 15000 });

    const divState = await page.evaluate(() => {
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        const cs = getComputedStyle(dv);
        return {
            display: dv.style.display,
            opacity: cs.opacity,
            position: cs.position,
            bgIsPng: /url\("data:image\/png/.test(dv.style.cssText),
            w: parseFloat(dv.style.width) || 0,
            h: parseFloat(dv.style.height) || 0,
        };
    });
    expect('swap: png div cached, hidden by default', divState.display === 'none');
    expect('swap: div invisible-by-construction (opacity 0, absolute)',
           divState.position === 'absolute');
    expect('swap: div carries a real png background ' + divState.w + 'x' + divState.h,
           divState.bgIsPng && divState.w > 100 && divState.h > 100);

    // Local synthetic dispatch runs the listener SYNCHRONOUSLY - the
    // swap state is assertable the moment dispatchEvent returns (the
    // real serializer walk starts in a microtask after this).
    const swapped = await page.evaluate(() => {
        window.__gb2_swapMs = 150;
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'getcontent', data: { address: [],
                options: { exclude: ['.jmvrefs'], images: 'absolute', docType: true } } },
            source: null,
        }));
        const host = document.querySelector('.graphbuilder2-host');
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        return {
            hostOptedOut: host.classList.contains('ignore-html'),
            divShown: dv.style.display === 'block',
            opacity: getComputedStyle(dv).opacity,
        };
    });
    expect('swap: host opted out during the copy window', swapped.hostOptedOut);
    expect('swap: png div included during the copy window', swapped.divShown);
    expect('swap: shown div still invisible on screen (opacity 0)', swapped.opacity === '0');

    await page.waitForFunction(() => {
        const host = document.querySelector('.graphbuilder2-host');
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        return !host.classList.contains('ignore-html') && dv.style.display === 'none';
    }, null, { timeout: 5000 });
    expect('swap: restored after the window', true);
    const stages = await page.evaluate(() => (window.__gb2_copyStages || []).join('\n'));
    expect('swap: stages record ON + restored',
           stages.includes('copy-clean swap ON') && stages.includes('copy-clean swap restored'));

    // Delivery-wipe regression (Torry's "text again": jamovi deliveries
    // innerHTML-rebuild the item DOM, destroying the div; the window
    // cache survives): remove the div, copy again - the swap must
    // rebuild it synchronously from the cache and still apply.
    const healed = await page.evaluate(() => {
        const dv0 = document.querySelector('[data-role="gb2-copy-div"]');
        dv0.parentNode.removeChild(dv0);
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'getcontent', data: { address: [],
                options: { exclude: ['.jmvrefs'], images: 'absolute', docType: true } } },
            source: null,
        }));
        const host = document.querySelector('.graphbuilder2-host');
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        return {
            divBack: !!dv,
            divShown: dv ? dv.style.display === 'block' : false,
            hostOptedOut: host.classList.contains('ignore-html'),
            bgIsPng: dv ? /url\("data:image\/png/.test(dv.style.cssText) : false,
        };
    });
    expect('swap: wiped div rebuilt from cache + swap applied',
           healed.divBack && healed.divShown && healed.hostOptedOut && healed.bgIsPng);
    await page.waitForFunction(() =>
        !document.querySelector('.graphbuilder2-host').classList.contains('ignore-html'),
        null, { timeout: 5000 });
    const stagesHeal = await page.evaluate(() => (window.__gb2_copyStages || []).join('\n'));
    expect('swap: rebuild stage logged',
           stagesHeal.includes('copy div rebuilt from cache'));

    // Item-level copy (non-empty address, e.g. the static Image result
    // or our widget item) must make NO DOM changes: hiding the static
    // copy mid-copy blanked jamovi's own rasterization of it (Torry's
    // "image level pastes nothing").
    const itemLevel = await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'getcontent', data: { address: ['snapshotImage'],
                options: { exclude: ['.jmvrefs'], images: 'absolute', docType: true } } },
            source: null,
        }));
        const host = document.querySelector('.graphbuilder2-host');
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        return {
            hostOptedOut: host.classList.contains('ignore-html'),
            divShown: dv.style.display === 'block',
        };
    });
    expect('swap: item-level copy makes NO DOM changes',
           !itemLevel.hostOptedOut && !itemLevel.divShown);
    const stagesItem = await page.evaluate(() => (window.__gb2_copyStages || []).join('\n'));
    expect('swap: item-level no-swap stage logged',
           stagesItem.includes('item-level copy - no swap'));

    // Negative: same request WITHOUT docType (a per-item export) must
    // not swap - exports keep the vector svg.
    const exported = await page.evaluate(() => {
        window.dispatchEvent(new MessageEvent('message', {
            data: { type: 'getcontent', data: { address: ['widget'],
                options: { exclude: ['.jmvrefs'], images: 'inline' } } },
            source: null,
        }));
        const host = document.querySelector('.graphbuilder2-host');
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        return {
            hostOptedOut: host.classList.contains('ignore-html'),
            divShown: dv.style.display === 'block',
        };
    });
    expect('swap: export request (no docType) does NOT swap',
           !exported.hostOptedOut && !exported.divShown);
    const stages2 = await page.evaluate(() => (window.__gb2_copyStages || []).join('\n'));
    expect('swap: export logged as copy/save', stages2.includes('(copy/save)'));
    await ctx.close();
}

// ---- 12. fast copy-readiness: the png stand-in rides its OWN ~300ms
//      timer (not the 4s option-commit debounce it used to share), and
//      builds WITHOUT window.setOption - read-only pages copy clean
//      too. No mock here on purpose: the snapshot scheduler is
//      hasSetOption-gated, so the div's existence in this context
//      proves the fast path built it.
{
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('file://' + path.join(OUT, 'snap-inline.html'));
    await page.waitForFunction(() =>
        document.querySelectorAll('svg [data-bar-cat]').length > 0, null, { timeout: 30000 });
    const t0 = Date.now();
    await page.waitForFunction(() =>
        !!document.querySelector('[data-role="gb2-copy-div"]'), null, { timeout: 3500 });
    const readyMs = Date.now() - t0;
    expect('fast-png: stand-in ready without setOption, in ' + readyMs + ' ms (< 3.5 s)', true);
    const ok = await page.evaluate(() => {
        const dv = document.querySelector('[data-role="gb2-copy-div"]');
        return /url\("data:image\/png/.test(dv.style.cssText) && dv.style.display === 'none';
    });
    expect('fast-png: real png, hidden at rest', ok);
    await ctx.close();
}

await browser.close();
console.log(fails === 0 ? 'snapshot-check: ALL OK' : `snapshot-check: ${fails} FAILURE(S)`);
process.exit(fails === 0 ? 0 : 1);
