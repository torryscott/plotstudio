// Pedagogy panel probe, check half: drive the "?" help-panel tabs and the
// Help Me Choose wizard headlessly (pages rendered by pedagogy-render.R)
// and assert rules, chips, thumbnails, and copy. Assertions are scoped to
// RENDERED text (panel element / svg text nodes / #hmcRoot) - NEVER
// document.body.textContent, which includes the inlined bundle SOURCE and
// self-satisfies any assertion that quotes rule copy.
// Env: GB2_PEDAGOGY_OUT (default /tmp/gb2-pedagogy), GB2_NODE_BASE.
import { createRequire } from 'node:module';
import path from 'node:path';

function loadPlaywright() {
    const bases = [];
    if (process.env.GB2_NODE_BASE) bases.push(process.env.GB2_NODE_BASE);
    bases.push(new URL('.', import.meta.url).pathname, process.cwd(), '/tmp', '/private/tmp');
    for (const b of bases) {
        try { return createRequire(path.join(b, 'x.js'))('playwright'); }
        catch { /* next */ }
    }
    console.error('playwright not found'); process.exit(2);
}
const { chromium } = loadPlaywright();
const OUT = process.env.GB2_PEDAGOGY_OUT || '/tmp/gb2-pedagogy';

const CASES = [
    // ---- tier 1 regressions ----
    { file: 'p_cg_anat',
      // 'Suggest a description' was asserted here until Jul 10 2026 -
      // the Export alt-text feature (and its Basics copy) is removed;
      // 're-spreads the palette' pins the access pill's Color section.
      basics: ['saves the chart as SVG', 'pie or donut', 'correlation cells',
               'describes itself to screen readers', 're-spreads the palette'],
      lint: [], lintAbsent: ['panels hold very little data', 'its own Y scale'],
      glossary: { browse: ['Significance and uncertainty', 'Common misread', 'How to read it',
                           // Jul 2026 in-context terms pass: 6 new groups
                           'Smoothing and density curves', 'Survey (Likert) charts'],
                  minCards: 120,
                  searches: [['spread', 'SD (standard deviation)'],
                             ['class interval', 'Class interval (bin)'],
                             ['anofa', 'One-way ANOVA'],
                             // Jul 2026 in-context terms pass
                             ['silverman', "Silverman's rule of thumb"],
                             ['kendall', 'Kendall tau'],
                             ['beeswarm', 'Beeswarm'],
                             ['whisker', 'Whisker (box plot)']] },
      // Jul 2026: drawn shapes are labeled by their REAL kind (the
      // fixture's shape is a rect -> "Rectangle", not "Annotation").
      anatomy: ['Significance bracket', 'Reference line', 'Rectangle', 'Panel heading'],
      chipClick: { chip: 'Error bar', expect: 'one standard deviation' } },
    { file: 'p_xy_anat',
      chooser: ['Splits the plot into cells', 'Trade-off:', 'overlap hides'],
      chooserThumbs: 2,
      lint: [], lintAbsent: ['color-blind'],
      anatomy: ['Data ellipse', 'Density contours', 'Rug marks'] },
    { file: 'p_xy_overplot', lint: ['Points are overlapping', 'Switch to Heatmap'] },
    { file: 'p_xy_heatfew',  lint: ['A heatmap with few points', 'Switch to Scatter'] },
    { file: 'p_dist_qq_small',   lint: ['Few points for a Q-Q plot', 'confidence band'] },
    { file: 'p_dist_dens_small', lint: ['Small sample for a density curve', 'Switch to Histogram'] },
    { file: 'p_dist_bins',       lint: ['More bins than the data can fill'],
      // Jul 9 2026 (Torry): "Use this" must switch the graph INSTANTLY,
      // keep the Which-graph panel open, and move the current-card
      // highlight. A copied `optName` read used to throw before the
      // commit and the outer catch swallowed it - every click silently
      // did nothing; this case would have caught that.
      chooserUse: { pick: 'density', role: 'dist-density' } },
    { file: 'p_corr_lint',  lint: ['rest on very few pairs', 'correlations tested at once'] },
    { file: 'p_likert_lint',
      lint: ['Some items have very few responses', 'Means on a short rating scale'],
      chipClick: { chip: 'Confidence interval', expect: '% confidence interval' } },
    // ---- tier 2 ----
    { file: 'p_cg_cvd', lint: ['may merge for color-blind readers'] },
    { file: 'w_likert2', wizard: ['Likert / Survey', 'rating-scale items'],
      wizardClicks: ['[data-mode="questions"]', '[data-go="cmp_detail"]', '[data-go="L_cg_all"]'],
      wizardAfter: ['Color grouping or panels?', 'gender or site'] },
    { file: 'w_likert_extra', wizard: ['Likert / Survey', 'will not appear', 'gender'], wizardThumbs: 2 },
    { file: 'w_bign', wizard: ['Heatmap type inside Scatter', '800 rows'] },
    // ---- battery/numeric interactions (Jul 2026 fixes) ----
    { file: 'w_numbat',
      wizard: ['Your 4 numeric columns share one small response scale (5 points)',
               'no grouping slot, so gender will not appear',
               'but Repeated Measures (the second option below) can'],
      wizardAbsent: ['times or sessions'] },
    { file: 'w_numbat_age',
      wizard: ['5 of your 6 numeric columns share one small response scale (5 points)',
               "age does not share the items' response scale",
               'would be treated as another measurement occasion',
               'no single chart can show all 6'] },
    { file: 'w_factbat_age',
      wizard: ['Your variables A, B, C, D look like rating-scale (Likert) items',
               "age does not share the items' response scale",
               'Choose this instead if:', 'compare age across the categories',
               'Compare Groups'] },
    { file: 'w_timeflip',
      wizard: ['Repeated Measures', 'times or sessions',
               'happen to share the scale'] },
    { file: 'w_timeflip_scoped',
      wizard: ['3 of your 5 numeric columns share one small response scale (5 points)',
               't1, t2 do not share the items', 'will not appear on the Likert chart'],
      wizardAbsent: ['times or sessions'] },
    // Reverse-ordered level sets are ONE scale (Torry's Jul 10 2026 report:
    // two reverse-ordered ordinal items split the battery and fired a false
    // "no single chart can show all 4" banner + a no-grouping-slot cap
    // naming battery members). The level-set signature sorts before
    // collapsing, so all four join one battery: clean Likert primary.
    { file: 'w_ordbat_rev',
      wizard: ['Likert / Survey', 'rating-scale items that share one response scale'],
      wizardAbsent: ['no single chart', 'will not appear', 'Heads up'] },
    // ---- faceting/grouping guidance ----
    { file: 'p_cg_facet_thin', lint: ['Some panels hold very little data', 'Rare'] },
    { file: 'p_cg_freey', lint: ['Each panel has its own Y scale'],
      chipClick: { chip: 'Panel heading', expect: 'OWN axis range' } },
    { file: 'w_cg2cat', wizard: ['Color grouping or panels?', 'mini chart', 'two categorical variables to place'] },
];

const browser = await chromium.launch();
let failures = 0;

function check(name, body, needles) {
    for (const n of needles) {
        if (body.includes(n)) console.log(`  ok   ${name}: "${n}"`);
        else { console.log(`  FAIL ${name}: missing "${n}"`); failures++; }
    }
}
function checkAbsent(name, body, needles) {
    for (const n of needles) {
        if (!body.includes(n)) console.log(`  ok   ${name}: absent "${n}"`);
        else { console.log(`  FAIL ${name}: unexpectedly present "${n}"`); failures++; }
    }
}

for (const c of CASES) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', e => pageErrors.push(String(e)));
    console.log(c.file);
    await page.goto('file://' + path.join(OUT, c.file + '.html'));
    // Rendered-text scopes only: body.textContent would include the inlined
    // bundle/wizard <script> SOURCE, making assertions self-satisfying.
    const panelText = () => page.evaluate(() => { const nav = document.querySelector('[data-role="help-nav"]'); return nav && nav.parentElement ? (nav.parentElement.textContent || '') : ''; });
    const svgText = () => page.evaluate(() => [...document.querySelectorAll('svg text')].map(t => t.textContent).join(' | '));
    const wizText = () => page.evaluate(() => { const r = document.getElementById('hmcRoot'); return r ? (r.textContent || '') : ''; });

    if (c.wizard) {
        await page.waitForSelector('#hmcBody .hmc-block, #hmcBody .hmc-q', { timeout: 20000 });
        await page.waitForTimeout(300);
        check('wizard', await wizText(), c.wizard);
        if (c.wizardAbsent) checkAbsent('wizard', await wizText(), c.wizardAbsent);
        if (c.wizardThumbs) {
            const n = await page.evaluate(() => document.querySelectorAll('svg[viewBox="0 0 44 32"]').length);
            if (n >= c.wizardThumbs) console.log(`  ok   wizard thumbs: ${n}`);
            else { console.log(`  FAIL wizard thumbs: ${n} < ${c.wizardThumbs}`); failures++; }
        }
        if (c.wizardClicks) {
            for (const sel of c.wizardClicks) { await page.click(sel); await page.waitForTimeout(250); }
            if (c.wizardAfter) check('wizard after clicks', await wizText(), c.wizardAfter);
        }
    } else {
        await page.waitForFunction(() => {
            const svgs = [...document.querySelectorAll('svg')];
            return svgs.some(s => s.querySelectorAll('*').length > 30);
        }, { timeout: 30000 });
        await page.waitForTimeout(800);
        await page.click('button[title="Help & shortcuts"]');
        await page.waitForTimeout(500);

        if (c.basics) {
            // Basics is topic-pilled (Start here / Arrange / Annotate /
            // Accessibility / All shortcuts) and renders one pane at a
            // time; walk the pills and concatenate so case assertions can
            // quote copy from any topic. Re-query per click: each pill
            // click re-renders the panel, so held element handles go stale.
            let btext = await panelText();
            for (const t of ['arrange', 'annotate', 'access', 'keys']) {
                const sel = `[data-basics-topic="${t}"]`;
                if (await page.$(sel)) {
                    await page.click(sel);
                    await page.waitForTimeout(200);
                    btext += '\n' + await panelText();
                }
            }
            check('basics', btext, c.basics);
        }
        if (c.lint || c.lintAbsent) {
            await page.click('[data-helpnav="graphLint"]');
            await page.waitForTimeout(500);
            const t = await panelText();
            if (c.lint) check('lint', t, c.lint);
            if (c.lintAbsent) checkAbsent('lint', t, c.lintAbsent);
        }
        if (c.chooser || c.chooserThumbs) {
            await page.click('[data-helpnav="graphChooser"]');
            await page.waitForTimeout(500);
            if (c.chooser) check('chooser', await panelText(), c.chooser);
            if (c.chooserThumbs) {
                const n = await page.evaluate(() => document.querySelectorAll('svg[viewBox="0 0 44 32"]').length);
                if (n >= c.chooserThumbs) console.log(`  ok   chooser thumbs: ${n}`);
                else { console.log(`  FAIL chooser thumbs: ${n} < ${c.chooserThumbs}`); failures++; }
            }
        }
        if (c.glossary) {
            // Glossary tab: grouped browse view, then live search (exact,
            // idea-word, and typo-tolerant fuzzy). Runs BEFORE anatomy so
            // the help-nav bar is still on screen.
            await page.click('[data-helpnav="glossary"]');
            await page.waitForTimeout(400);
            check('glossary browse', await panelText(), c.glossary.browse);
            const kids = await page.evaluate(() => {
                const r = document.querySelector('[data-role="gloss-results"]');
                return r ? r.children.length : 0;
            });
            if (kids >= (c.glossary.minCards || 1)) console.log(`  ok   glossary cards: ${kids}`);
            else { console.log(`  FAIL glossary cards: ${kids} < ${c.glossary.minCards}`); failures++; }
            for (const [q, want] of (c.glossary.searches || [])) {
                await page.fill('[data-role="gloss-search"]', q);
                await page.waitForTimeout(250);
                check(`glossary search "${q}"`, await panelText(), [want]);
            }
        }
        if (c.anatomy || c.chipClick) {
            await page.click('[data-helpnav="anatomy"]');
            await page.waitForTimeout(1200);
            if (c.anatomy) check('anatomy', await svgText(), c.anatomy);
            if (c.chipClick) {
                try {
                    const loc = page.locator(`svg text:has-text("${c.chipClick.chip}")`).first();
                    const n = await page.locator(`svg text:has-text("${c.chipClick.chip}")`).count();
                    if (!n) throw new Error('chip text not found in SVG');
                    const box = await loc.boundingBox();
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    await page.waitForTimeout(500);
                    check('chip "' + c.chipClick.chip + '"', await panelText(), [c.chipClick.expect]);
                } catch (e) {
                    console.log(`  FAIL chip "${c.chipClick.chip}": ${String(e).split('\n')[0]}`); failures++;
                }
            }
        }
        if (c.chooserUse) {
            // Runs LAST in the case - it switches the graph type.
            await page.click('[data-helpnav="graphChooser"]');
            await page.waitForTimeout(400);
            await page.evaluate(v => {
                const btn = [...document.querySelectorAll('[data-gt-pick]')].find(x => x.getAttribute('data-gt-pick') === v);
                if (!btn) return;
                const r = btn.getBoundingClientRect();
                const i = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, isPrimary: true, button: 0 };
                btn.dispatchEvent(new PointerEvent('pointerdown', i));
                btn.dispatchEvent(new PointerEvent('pointerup', i));
                btn.dispatchEvent(new MouseEvent('click', i));
            }, c.chooserUse.pick);
            await page.waitForTimeout(700);
            const st = await page.evaluate(([v, role]) => ({
                drawn: document.querySelectorAll('[data-role^="' + role + '"]').length,
                sel: (() => { try { return JSON.parse(localStorage.getItem('graphbuilder2.inspector.v1') || '[]'); } catch (e) { return []; } })(),
                pickGone: ![...document.querySelectorAll('[data-gt-pick]')].some(x => x.getAttribute('data-gt-pick') === v)
            }), [c.chooserUse.pick, c.chooserUse.role]);
            if (st.drawn > 0 && st.sel.length === 1 && st.sel[0] === 'graphChooser' && st.pickGone)
                console.log('  ok   chooser Use-this: instant switch + panel open + highlight moved');
            else { console.log('  FAIL chooser Use-this: ' + JSON.stringify(st)); failures++; }
        }
    }
    if (pageErrors.length) { console.log('  FAIL pageerror: ' + pageErrors[0]); failures++; }
    await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PROBE CHECKS PASSED');
process.exit(failures ? 1 : 0);
