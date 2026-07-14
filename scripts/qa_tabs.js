#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || process.cwd();
const MODULES = ['bargraph', 'rmgraph', 'scatterplot', 'distplot', 'corrmatrix'];
const STANDARD_TABS = ['data', 'appearance', 'axes', 'text', 'annotations', 'layout', 'export', 'all'];

function readFile(file) {
  return fs.readFileSync(file, 'utf8');
}

function getTopLevelCollapseLabels(yamlFile) {
  const lines = readFile(yamlFile).split(/\r?\n/);
  let minIndent = Infinity;

  for (const line of lines) {
    const m = line.match(/^(\s*)- type: CollapseBox\s*$/);
    if (m)
      minIndent = Math.min(minIndent, m[1].length);
  }

  const labels = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)- type: CollapseBox\s*$/);
    if (!m || m[1].length !== minIndent)
      continue;

    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const lm = lines[j].trim().match(/^label:\s*(.*)$/);
      if (!lm)
        continue;

      let v = lm[1].trim();
      if (v === '>-' || v === '>|')
        v = (lines[j + 1] || '').trim();

      v = v.replace(/^['"]/, '').replace(/['"]$/, '');
      labels.push(v);
      break;
    }
  }

  return labels;
}

function getJsTabModel(jsFile) {
  const src = readFile(jsFile);
  const tabIds = [];
  const tabSections = [];

  const tabRe = /\{\s*id:\s*'([^']+)'\s*,\s*label:\s*'[^']*'\s*,\s*sections:\s*\[([^\]]*)\]\s*\}/g;
  let m;
  while ((m = tabRe.exec(src)) !== null) {
    tabIds.push(m[1]);
    const block = m[2];
    const sectionRe = /'([^']+)'/g;
    let s;
    while ((s = sectionRe.exec(block)) !== null)
      tabSections.push(s[1]);
  }

  return { tabIds, tabSections };
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function run() {
  let hasErrors = false;

  for (const mod of MODULES) {
    const yamlFile = path.join(BASE, 'jamovi', `${mod}.u.yaml`);
    const jsFile = path.join(BASE, 'jamovi', 'js', `${mod}.js`);

    const topSections = unique(getTopLevelCollapseLabels(yamlFile));
    const model = getJsTabModel(jsFile);
    const tabIds = unique(model.tabIds);
    const mappedSections = unique(model.tabSections);

    const unmapped = topSections.filter(s => !mappedSections.includes(s));
    const unknown = mappedSections.filter(s => !topSections.includes(s));
    const missingTabs = STANDARD_TABS.filter(t => !tabIds.includes(t));

    console.log(`==== ${mod} ====`);
    if (unmapped.length === 0 && unknown.length === 0 && missingTabs.length === 0) {
      console.log('OK');
    } else {
      hasErrors = true;
      if (missingTabs.length > 0)
        console.log(`MISSING TABS: ${missingTabs.join(', ')}`);
      if (unmapped.length > 0)
        console.log(`UNMAPPED SECTIONS: ${unmapped.join(' | ')}`);
      if (unknown.length > 0)
        console.log(`UNKNOWN SECTIONS: ${unknown.join(' | ')}`);
    }
    console.log('');
  }

  if (hasErrors)
    process.exit(1);
}

run();

