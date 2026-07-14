// Headless probe for the Chart styles feature (save-a-look library).
// Surfaces (Jul 2026 relocation): quick APPLY = style rows at the top
// of the palette flyout; management home = the Chart styles tab in
// Chart settings (flyout "Manage chart styles..." link / settings
// gear on the palette-less modules). Drives the battery pages in
// /tmp/gb2-verify (render.R output).
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
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
    await page.addInitScript(() => {
        window.setOption = function (k, v) {
            (window.__probeCommits = window.__probeCommits || []).push([k, v]);
        };
    });
    return { ctx, page };
}
const pendingAction = (page) => page.evaluate(() => {
    const p = window.__gb2_pendingOpts || {};
    return typeof p.styleLibrary === 'string' ? JSON.parse(p.styleLibrary) : null;
});
const allCommits = (page) => page.evaluate(() => {
    const out = {};
    // A migrated module (chartSpec) folds style commits into ONE blob; explode
    // any chartSpec commit so style keys read through like direct commits.
    const absorb = (k, v) => {
        if (k === 'chartSpec') { try { Object.assign(out, JSON.parse(v)); } catch (e) {} }
        else out[k] = v;
    };
    (window.__probeCommits || []).forEach(([k, v]) => absorb(k, v));
    const p = window.__gb2_pendingOpts || {};
    for (const k in p) absorb(k, p[k]);
    return out;
});
const stylesPaneVisible = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-tab-pane="styles"]');
    return !!el && getComputedStyle(el).display !== 'none';
});

// ------- Case 1: CG page — manage link, save, star, flyout apply, parts -------
{
    const { ctx, page } = await newPage();
    await page.goto('file://' + path.join(OUT, 'cg_bar_labels.html'));
    await page.waitForSelector('[data-role="palette-trigger"]', { timeout: 8000 });

    // Palette-driven modules now share one graph-wide Theme entry point with
    // an explicit Colors / Chart style split.
    ok('C1 toolbar names the combined control Theme',
        (await page.locator('[data-role="palette-trigger"]').textContent()).includes('Theme'));
    await page.click('[data-role="palette-trigger"]');
    ok('C1 Theme flyout has Colors and Chart style tabs',
        await page.locator('[data-role="theme-tabs"] [data-theme-tab]').count() === 2);
    ok('C1 Colors tab explains its limited scope',
        (await page.locator('[data-theme-pane="colors"]').textContent())
            .includes("Changes the graph's color palette."));
    await page.click('[data-theme-tab="styles"]');

    // Empty library: the style tab remains discoverable, with an empty state
    // and the management link instead of silently disappearing.
    ok('C1 empty library shows no style rows',
        await page.locator('[data-role="palette-flyout"] [data-style]').count() === 0);
    ok('C1 empty library explains that no chart styles are saved',
        await page.locator('[data-role="theme-no-styles"]').count() === 1);
    const manage = page.locator('[data-role="palette-flyout"] button', { hasText: 'Manage chart styles' });
    ok('C1 flyout has the Manage chart styles link', await manage.count() === 1);
    await manage.click();
    await page.waitForSelector('[data-cs-new]', { timeout: 4000 });
    ok('C1 manage link opens Chart settings on the styles tab', await stylesPaneVisible(page));
    ok('C1 settings tab bar has a Chart styles tab',
        await page.locator('[data-gs-tab="styles"]').count() >= 1);

    // Save flow inside the tab.
    await page.click('[data-cs-new]');
    await page.waitForSelector('[data-cs-savename]', { timeout: 3000 });
    ok('C1 save form shows five capture checkboxes',
        await page.locator('[data-cs-savegroup]').count() === 5);
    await page.fill('[data-cs-savename]', 'Probe style');
    await page.click('[data-cs-savego]');
    await page.waitForSelector('[data-cs-card="Probe style"]', { timeout: 3000 });
    const act1 = await pendingAction(page);
    ok('C1 save action queued with machineId',
        !!act1 && act1.kind === 'save' && act1.name === 'Probe style' &&
        typeof act1.machineId === 'string' && act1.machineId.length > 0);
    ok('C1 capture has palette + background + fonts',
        !!act1 && !!act1.opts && 'chartPalette' in act1.opts &&
        'chartBackground' in act1.opts && 'chartFontFamily' in act1.opts);
    // Jul 9 2026 (Torry): per-series stores travel WITH the style so an
    // off-palette custom color / per-bar pattern round-trips exactly —
    // this reverses the Jul 4 "palette only" ruling. A fresh chart
    // captures them as EMPTY arrays (an explicit "no overrides" reset).
    ok('C1 capture carries the per-group stores (Jul 9 ruling)',
        !!act1 && !!act1.opts && Array.isArray(act1.opts.groupColors) &&
        Array.isArray(act1.opts.categoryStyles) && act1.opts.groupColors.length === 0);
    ok('C1 textStyles captured generic-ids-only',
        !!act1 && Array.isArray(act1.opts.textStyles) &&
        act1.opts.textStyles.every(e => String(e && e.id).indexOf(':') < 0));

    // Star while the save is still unflushed -> savedefault combo.
    await page.click('[data-cs-star="Probe style"]');
    await page.waitForTimeout(120);
    const act2 = await pendingAction(page);
    ok('C1 star upgrades pending save to savedefault',
        !!act2 && act2.kind === 'savedefault' && act2.name === 'Probe style' && !!act2.opts);
    ok('C1 default marked locally',
        await page.evaluate(() => window.__gb2_styleDefaultId === 'Probe style'));

    // Quick apply from the FLYOUT: inject a style, reopen the dropdown.
    await page.evaluate(() => {
        window.__gb2_styleLib['Probe blues'] = {
            groups: ['colors', 'background'],
            opts: { chartPalette: 'blues', customPalette: '', chartBackground: '#fdf6ee' }
        };
    });
    await page.click('[data-role="palette-trigger"]');
    await page.click('[data-theme-tab="styles"]');
    await page.waitForSelector('[data-style="Probe blues"]', { timeout: 3000 });
    ok('C1 flyout lists saved styles for quick apply',
        await page.locator('[data-role="palette-flyout"] [data-style]').count() === 2);
    await page.evaluate(() => { window.__gb2_pendingOpts = {}; window.__probeCommits = []; });
    await page.click('[data-style="Probe blues"]');
    await page.waitForTimeout(500); // _gb2RerenderSoon + repaint
    const afterApply = await allCommits(page);
    ok('C1 flyout apply commits chartPalette', afterApply.chartPalette === 'blues');
    ok('C1 flyout apply commits chartBackground', afterApply.chartBackground === '#fdf6ee');
    ok('C1 background repainted immediately',
        await page.evaluate(() => [...document.querySelectorAll('div')].some(d => {
            const b = (d.style && d.style.background) || '';
            return b.includes('#fdf6ee') || b.includes('rgb(253, 246, 238)');
        })));
    ok('C1 settings panel survives the apply rebuild on the styles tab',
        await page.locator('[data-cs-new]').count() === 1 && await stylesPaneVisible(page));

    // Partial apply from the card menu inside the tab.
    await page.click('[data-cs-more="Probe blues"]');
    await page.waitForSelector('[data-cs-act="parts"]', { timeout: 3000 });
    await page.click('[data-cs-act="parts"]');
    await page.waitForSelector('[data-cs-partsgroup]', { timeout: 3000 });
    ok('C1 parts form lists only stored groups',
        await page.locator('[data-cs-partsgroup]').count() === 2);
    // Under chartSpec the commit is ONE cumulative blob, so "commits
    // background only" can't be tested as palette-absent-from-the-commit.
    // Sentinel the palette through the real routing path first, then assert
    // the partial apply (colors UNCHECKED) applies the background yet leaves
    // the palette sentinel untouched - the meaningful equivalent.
    await page.evaluate(() => {
        const d = window.gb2_undo.getData();
        d.chartPalette = '__sentinel__';
        (window.__gb2_setOption || window.setOption)('chartPalette', '__sentinel__');
    });
    await page.evaluate(() => { window.__gb2_pendingOpts = {}; window.__probeCommits = []; });
    await page.uncheck('[data-cs-partsgroup="colors"]');
    await page.click('[data-cs-partsgo]');
    await page.waitForTimeout(400);
    const afterParts = await allCommits(page);
    ok('C1 partial apply commits background', afterParts.chartBackground === '#fdf6ee');
    ok('C1 partial apply leaves the unchecked palette untouched',
        await page.evaluate(() => window.gb2_undo.getData().chartPalette === '__sentinel__'));
    await ctx.close();
}

// ------- Case 2: Correlation — no toolbar chip; settings-gear route -------
{
    const { ctx, page } = await newPage();
    await page.goto('file://' + path.join(OUT, 'corr_heat.html'));
    await page.waitForSelector('button[title="Chart settings"]', { timeout: 8000 });
    ok('C2 no bespoke styles chip on corr (settings tab covers it)',
        await page.locator('[data-role="styles-trigger"]').count() === 0);
    await page.click('button[title="Chart settings"]');
    await page.waitForSelector('[data-gs-tab="styles"]', { timeout: 4000 });
    await page.click('[data-gs-tab="styles"]');
    await page.waitForSelector('[data-cs-new]', { timeout: 4000 });
    ok('C2 styles tab reachable from the settings gear', await stylesPaneVisible(page));
    await page.click('[data-cs-new]');
    await page.waitForSelector('[data-cs-savename]', { timeout: 3000 });
    await page.fill('[data-cs-savename]', 'Corr probe');
    await page.click('[data-cs-savego]');
    await page.waitForSelector('[data-cs-card="Corr probe"]', { timeout: 3000 });
    const act = await pendingAction(page);
    ok('C2 corr capture lacks chartPalette (module has none)',
        !!act && !!act.opts && !('chartPalette' in act.opts));
    ok('C2 corr capture lacks bar options',
        !!act && !('barOpacity' in act.opts) && !('barCornerRadius' in act.opts));
    ok('C2 corr capture still has font family + background',
        !!act && 'chartFontFamily' in act.opts && 'chartBackground' in act.opts);
    await ctx.close();
}

// ------- Case 3: auto-apply default style on a fresh analysis -------
{
    const raw = readFileSync(path.join(OUT, 'cg_box.html'), 'utf8');
    const NEEDLE = '"styleLibrary":{},"styleDefaultId":"","styleAutoApply":false';
    ok('C3 payload style-triple found for patching', raw.includes(NEEDLE));
    const patched = raw.replace(NEEDLE,
        '"styleLibrary":{"Auto probe":{"groups":["background"],"opts":{"chartBackground":"#123456"}}},' +
        '"styleDefaultId":"Auto probe","styleAutoApply":true');
    writeFileSync(path.join(OUT, 'styles_autoapply_probe.html'), patched);

    const { ctx, page } = await newPage();
    await page.goto('file://' + path.join(OUT, 'styles_autoapply_probe.html'));
    await page.waitForSelector('svg', { timeout: 8000 });
    await page.waitForTimeout(600);
    ok('C3 default style painted on first frame',
        await page.evaluate(() => {
            // chartBackground paints as a DIV background (bgDiv), not an svg rect
            return [...document.querySelectorAll('div')].some(d => {
                const b = (d.style && d.style.background) || '';
                return b.includes('#123456') || b.includes('rgb(18, 52, 86)');
            });
        }));
    const commits = await allCommits(page);
    ok('C3 chartBackground committed durably', commits.chartBackground === '#123456');
    ok('C3 styleStamp committed true', commits.styleStamp === true);
    ok('C3 once-only guard set',
        await page.evaluate(() => window.__gb2_styleAutoApplyDone === true));
    await ctx.close();
}

await browser.close();
if (fails > 0) { console.log('\n' + fails + ' FAILURES'); process.exit(1); }
console.log('\nALL STYLES PROBE CHECKS PASSED');
