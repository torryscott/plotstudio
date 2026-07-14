// Check the listener-leak probe page (see leak-probe.R) in headless
// chromium: across six full render cycles with panel/popover
// interactions, the net document/window listener counts must stay
// flat from cycle 2 to cycle 6. A key may jitter by 1 (a popover
// left open mid-cycle leaves one self-draining dismiss handler);
// growth of 2+ on any key is a leak and fails.
//
// Usage:  node scripts/verify/check-extras.mjs
// Env:    GB2_VERIFY_OUT  dir holding leak-probe.html (default /tmp/gb2-verify)
//         GB2_NODE_BASE   a dir whose node_modules contains playwright

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
    console.error(
        'playwright not found from any of: ' + bases.join(', ') + '\n' +
        'Install once with:  cd /tmp && npm i playwright && npx playwright install chromium\n' +
        '(or set GB2_NODE_BASE to a directory whose node_modules has it)');
    process.exit(2);
}

const { chromium } = loadPlaywright();
const OUT = process.env.GB2_VERIFY_OUT || '/tmp/gb2-verify';

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e)));

await page.goto('file://' + path.join(OUT, 'leak-probe.html'));
await page.waitForSelector('#gb2-leak-result', { timeout: 30000 });
const raw = await page.evaluate(() =>
    document.getElementById('gb2-leak-result').textContent.slice('GB2LEAK::'.length));
await browser.close();

const res = JSON.parse(raw);
let failed = false;
if (res.err) {
    console.error('  FAIL leak-probe page error: ' + res.err);
    failed = true;
}
if (pageErrors.length) {
    console.error('  FAIL pageerror(s): ' + pageErrors.join(' | '));
    failed = true;
}
const grown = Object.entries(res.growthC2toC6 || {})
    .filter(([, d]) => d >= 2)
    .map(([k, d]) => `${k} +${d}`);
if (grown.length) {
    console.error('  FAIL listener growth cycles 2->6: ' + grown.join(', '));
    console.error('       afterCycle6: ' + JSON.stringify(res.afterCycle6));
    failed = true;
}
if (!failed) {
    console.log('  ok   leak-probe: net document/window listeners flat across 6 render cycles');
}
process.exit(failed ? 1 : 0);
