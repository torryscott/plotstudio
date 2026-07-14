// Frequencies graph-type selection continuity.
// A lower panel that is already open on a primary mark should follow
// bar/pareto <-> pie/donut without requiring another chart click.
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
let fails = 0;

function check(label, pass, detail = '') {
    console.log((pass ? ' ok  ' : 'FAIL ') + label + (detail ? ': ' + detail : ''));
    if (!pass) fails++;
}

async function openPage(name) {
    const ctx = await browser.newContext({ viewport: { width: 760, height: 1100 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.join(OUT, name + '.html'));
    await page.waitForSelector('svg', { timeout: 10000 });
    return { ctx, page, errors };
}

async function selection(page) {
    return page.evaluate(() => {
        const raw = localStorage.getItem('graphbuilder2.inspector.v1');
        if (!raw || raw === 'null') return [];
        try { return raw[0] === '[' ? JSON.parse(raw) : [raw]; }
        catch { return []; }
    });
}

async function panelInfo(page) {
    return page.evaluate(() => {
        const panel = document.querySelector('.gb2-panel');
        const crumb = panel?.querySelector('[data-role="gb2-crumb"]');
        const kids = crumb ? [...crumb.children] : [];
        return {
            open: !!panel && getComputedStyle(panel).display !== 'none' && !!crumb,
            eyebrow: kids[0]?.textContent.trim() || '',
            title: kids[1]?.textContent.trim() || ''
        };
    });
}

async function switchType(page, type, targetSelector) {
    const started = Date.now();
    await page.locator('[data-role="graphtype-trigger"]').click();
    const tile = page.locator(`[data-role="graphtype-flyout"] [data-gt="${type}"]`);
    await tile.waitFor({ state: 'visible', timeout: 5000 });
    await tile.click();
    if (targetSelector) await page.waitForSelector(targetSelector, { timeout: 8000 });
    await page.waitForTimeout(40);
    return Date.now() - started;
}

async function clickBar(page, index = 0) {
    const bars = page.locator('[data-bar-cat]:not([data-role])');
    const count = await bars.count();
    if (!count) throw new Error('No clickable frequency bars');
    const bar = bars.nth(Math.min(index, count - 1));
    const id = await bar.evaluate(el => ({
        cat: el.getAttribute('data-bar-cat') || '',
        group: el.getAttribute('data-bar-group') || ''
    }));
    const box = await bar.boundingBox();
    if (!box) throw new Error('Frequency bar has no clickable bounds');
    // Click near a corner so a centered value label cannot intercept the
    // gesture; page.mouse keeps this a real pointer sequence.
    await page.mouse.click(box.x + Math.min(3, box.width / 4),
        box.y + Math.min(3, box.height / 4));
    await page.waitForSelector('[data-role="gb2-crumb"]', { timeout: 5000 });
    return id;
}

// Simple ungrouped chart: category identity is exact in both directions.
{
    const { ctx, page, errors } = await openPage('freq_pie');
    const slice = page.locator('[data-role="freq-slice"]').first();
    const firstCat = await slice.getAttribute('data-cat');
    await slice.click();
    check('Ungrouped pie starts on the clicked slice',
        JSON.stringify(await selection(page)) === JSON.stringify([`freqSlice:${firstCat}`]));

    await switchType(page, 'bar', '[data-bar-cat]');
    let info = await panelInfo(page);
    check('Pie -> bar keeps the lower panel open', info.open && info.eyebrow === 'Bar chart', JSON.stringify(info));
    check('Pie -> bar preserves the category',
        JSON.stringify(await selection(page)) === JSON.stringify([`bars:${firstCat}`]), JSON.stringify(await selection(page)));

    // Use a real bar click so the bar -> pie path exercises the remembered
    // category rather than only translating a restored slice key.
    const clicked = await clickBar(page, 1);
    await switchType(page, 'pie', '[data-role="freq-slice"]');
    info = await panelInfo(page);
    check('Bar -> pie keeps the lower panel open', info.open && info.eyebrow === 'Pie chart', JSON.stringify(info));
    check('Bar -> pie follows the clicked category',
        JSON.stringify(await selection(page)) === JSON.stringify([`freqSlice:${clicked.cat}`]), JSON.stringify(await selection(page)));

    await switchType(page, 'donut', '[data-role="freq-slice"]');
    check('Pie -> donut keeps the same slice panel',
        JSON.stringify(await selection(page)) === JSON.stringify([`freqSlice:${clicked.cat}`]), JSON.stringify(await selection(page)));
    await switchType(page, 'bar', '[data-bar-cat]');
    check('Donut -> bar restores the same category panel',
        JSON.stringify(await selection(page)) === JSON.stringify([`bars:${clicked.cat}`]), JSON.stringify(await selection(page)));
    check('Ungrouped continuity has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

// Grouped bars: the bar editor is keyed by group, while the pooled pie is
// keyed by category. The actual clicked bar supplies both identities.
{
    const { ctx, page, errors } = await openPage('freq_bar_stack');
    const clicked = await clickBar(page, 1);
    check('Grouped bar panel starts on the clicked group',
        JSON.stringify(await selection(page)) === JSON.stringify([`bars:${clicked.group}`]), JSON.stringify(await selection(page)));
    await switchType(page, 'pie', '[data-role="freq-slice"]');
    const pieSel = await selection(page);
    const pieCat = pieSel[0]?.replace(/^freqSlice:/, '') || '';
    let info = await panelInfo(page);
    check('Grouped bar -> pooled pie keeps the panel open', info.open && info.eyebrow === 'Pie chart', JSON.stringify(info));
    check('Grouped bar -> pie follows the clicked category',
        pieSel.length === 1 && pieSel[0] === `freqSlice:${clicked.cat}` &&
        await page.locator('[data-role="freq-slice"]').evaluateAll(
            (els, cat) => els.filter(el => el.getAttribute('data-cat') === cat).length, pieCat) === 1,
        JSON.stringify(pieSel));

    // Group By is pooled by pie/donut AND Pareto, so these hops are a
    // lossless local reshape. The fixture has no R echo: reaching each target
    // proves the preview did not fall back to a host wait; the time bound
    // protects the user-visible "instant" contract as well.
    let hopMs = await switchType(page, 'pareto', '[data-role="pareto-line"]');
    check('Grouped pie -> Pareto is instant', hopMs < 700, `${hopMs} ms`);
    check('Grouped pie -> Pareto keeps the clicked category panel',
        JSON.stringify(await selection(page)) === JSON.stringify([`bars:${clicked.cat}`]),
        JSON.stringify(await selection(page)));
    hopMs = await switchType(page, 'donut', '[data-role="freq-slice"]');
    check('Grouped Pareto -> donut is instant', hopMs < 700, `${hopMs} ms`);
    hopMs = await switchType(page, 'pareto', '[data-role="pareto-line"]');
    check('Grouped donut -> Pareto is instant', hopMs < 700, `${hopMs} ms`);
    await switchType(page, 'pie', '[data-role="freq-slice"]');

    await switchType(page, 'bar', '[data-bar-cat]');
    check('Pooled pie -> grouped bar restores the clicked group',
        JSON.stringify(await selection(page)) === JSON.stringify([`bars:${clicked.group}`]), JSON.stringify(await selection(page)));
    check('Grouped continuity has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

// Faceted grouped bars exercise removal of the facet prefix before looking
// for the pooled pie category. Exact category text is asserted indirectly:
// the translated key must identify a slice that really exists.
{
    const { ctx, page, errors } = await openPage('freq_bar_fill_facet');
    const clicked = await clickBar(page, 2);
    await switchType(page, 'pie', '[data-role="freq-slice"]');
    const pieSel = await selection(page);
    const pieCat = pieSel[0]?.replace(/^freqSlice:/, '') || '';
    const info = await panelInfo(page);
    check('Faceted bar -> pooled pie keeps the panel open', info.open && info.eyebrow === 'Pie chart', JSON.stringify(info));
    check('Faceted category is translated to a real visible slice',
        /^freqSlice:/.test(pieSel[0] || '') &&
        await page.locator('[data-role="freq-slice"]').evaluateAll(
            (els, cat) => els.filter(el => el.getAttribute('data-cat') === cat).length, pieCat) === 1,
        JSON.stringify(pieSel));
    await switchType(page, 'bar', '[data-bar-cat]');
    check('Faceted pie -> bar restores the clicked group',
        JSON.stringify(await selection(page)) === JSON.stringify([`bars:${clicked.group}`]), JSON.stringify(await selection(page)));
    check('Faceted continuity has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

// A type switch should preserve an existing panel, not create one.
{
    const { ctx, page, errors } = await openPage('freq_pie');
    await switchType(page, 'bar', '[data-bar-cat]');
    let info = await panelInfo(page);
    check('Closed panel stays closed on pie -> bar', !info.open, JSON.stringify(info));
    await switchType(page, 'pie', '[data-role="freq-slice"]');
    info = await panelInfo(page);
    check('Closed panel stays closed on bar -> pie', !info.open, JSON.stringify(info));
    check('Closed-panel continuity has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

// Facet By is intentionally different from Group By: pie pools the facet,
// while Pareto needs one independently ranked series per panel. Do not invent
// an instant preview from information the pie payload no longer contains.
{
    const { ctx, page, errors } = await openPage('freq_bar_fill_facet');
    await switchType(page, 'pie', '[data-role="freq-slice"]');
    await page.locator('[data-role="graphtype-trigger"]').click();
    await page.locator('[data-role="graphtype-flyout"] [data-gt="pareto"]').click();
    await page.waitForTimeout(250);
    check('Faceted pie -> Pareto still waits for authoritative facet counts',
        await page.locator('[data-role="pareto-line"]').count() === 0 &&
        await page.locator('[data-role="freq-slice"]').count() > 0);
    check('Faceted safety path has no page errors', errors.length === 0, errors.join(' | '));
    await ctx.close();
}

await browser.close();
if (fails) {
    console.error(`\nFREQ-PANEL-CHECK: ${fails} failure(s)`);
    process.exit(1);
}
console.log('\nFREQ-PANEL-CHECK: ALL CHECKS PASSED');
