#!/usr/bin/env python3
# chartSpec migration toolkit (speed pass Phase 2 rollout).
#
# Given a module name, this:
#   1. computes the KEEP set (options that stay real jamovi options),
#   2. writes the spec TABLE R literal to /tmp/spectable_<mod>.R,
#   3. rewrites jamovi/<mod>.a.yaml to (keep + chartSpec),
#   4. prints the wrinkles the human/agent must handle in the .b.R:
#      - outside-call reads that are TITLES (re-source from the parsed spec),
#      - outside-call reads that look DATA-SHAPING (keep REAL - add to keep),
#      - whether the module's axis-title PREVIEW FOLD (dist/freq) needs the
#        po.chartSpec parse (~line 93808 in graphbuilder2.js).
#
# Usage:  python3 scripts/migrate/chartspec_migrate.py <module> [--write]
#   without --write it only REPORTS (dry run); with --write it rewrites the
#   a.yaml + emits the table file. The .b.R do.call edit is done by hand
#   using the corrplotbuilder commit (75ee2cd) as the exact template.
#
# See CLAUDE.md convention 22 for the full recipe.
import re, sys, json, os

MOD = sys.argv[1]
WRITE = '--write' in sys.argv
# --keep-extra=optA,optB : force these options to stay REAL (out of chartSpec).
# Used for DATA-SHAPING dual-reads that feed the R aggCache (xy's fit/density/
# ellipse/marginal/stats bundle) - keeping them real leaves the aggCache
# signature untouched and makes byte-equivalence trivial (real -> same payload).
KEEP_EXTRA = set()
for a in sys.argv:
    if a.startswith('--keep-extra='):
        KEEP_EXTRA = {s for s in a.split('=', 1)[1].split(',') if s}
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(ROOT)

ACTIONS = {'exportRequest','exportPath','clientBundleHash','paletteLibrary',
           'styleLibrary','styleStamp','annotationsJson'}
TITLE_OPTS = {'xTitle','xTitleOverride','yTitle','yTitleOverride',
              'groupTitle','groupTitleOverride'}

# graphbuilder2_html signature defaults (for the mismatch report only).
wid = open('R/widget.R', encoding='utf-8').read().splitlines()
sig_end = next(i for i,l in enumerate(wid) if i>17 and l.rstrip().endswith(') {'))
sig_def = {}
for ln in wid[17:sig_end+1]:
    s = ln.strip()
    if s.startswith('#') or not s: continue
    m = re.match(r'^([a-z_]+)\s*=\s*(.+?)\)?\s*\{?\s*,?\s*$', s)
    if m: sig_def[m.group(1)] = m.group(2).rstrip(') {').rstrip(',').strip()

js = open('inst/widget/graphbuilder2.js', encoding='utf-8').read()
PANEL = set(re.findall(r'"(\w+)"', re.search(r'_GB2_PANEL_KEYS = \[(.*?)\]', js, re.S).group(1)))
LIT = set(re.findall(r'__gb2_(?:pendingOpts|recentCommits)\.(\w+)', js)) | \
      set(re.findall(r'__gb2_(?:pendingOpts|recentCommits), "(\w+)"', js))
FOLD = set(re.findall(r'\bpo\.(\w+)', js))

ay = open(f'jamovi/{MOD}.a.yaml', encoding='utf-8').read()
blocks = re.split(r'\n(?=    - name: )', ay)
opts, nonhidden, roles, ay_def, ay_ty = [], set(), set(), {}, {}
for b in blocks:
    m = re.search(r'- name: (\w+)', b)
    if not m: continue
    n = m.group(1); opts.append(n)
    t = (re.search(r'\n      type: (\w+)', b) or [None,'?'])[1]; ay_ty[n]=t
    d = re.search(r'\n      default: (.*)', b); ay_def[n]=d.group(1).strip() if d else None
    if 'hidden: true' not in b: nonhidden.add(n)
    if t in ('Variable','Variables','Data'): roles.add(n)

bR = open(f'R/{MOD}.b.R', encoding='utf-8').read()
i = bR.index('graphbuilder2_html('); j = bR.index('(', i); depth=0; k=j
while k < len(bR):
    if bR[k]=='(': depth+=1
    elif bR[k]==')':
        depth-=1
        if depth==0: break
    k+=1
call = re.sub(r'#[^\n]*','', bR[j+1:k])
parts=[]; d2=0; cur=''
for ch in call:
    if ch in '([{': d2+=1
    elif ch in ')]}': d2-=1
    if ch==',' and d2==0: parts.append(cur); cur=''
    else: cur+=ch
parts.append(cur)
simple=[]; istrue=[]
for p in parts:
    p=' '.join(p.split()); m=re.match(r'(\w+)\s*=\s*(.*)',p)
    if not m: continue
    arg,expr=m.group(1),m.group(2).strip()
    ms=re.fullmatch(r'self\$options\$(\w+)',expr); mt=re.fullmatch(r'isTRUE\(self\$options\$(\w+)\)',expr)
    if ms: simple.append((arg,ms.group(1)))
    elif mt: istrue.append((arg,mt.group(1)))
istrue_opts={o for _,o in istrue}
all_reads=set(re.findall(r'self\$options\$(\w+)', bR))
call_opts={o for _,o in simple+istrue}
outside = all_reads - call_opts
# DUAL-READ trap: an option read BEFORE the graphbuilder2_html call AND passed
# in the call. The set-diff above hides it, but its PRELUDE read breaks after
# migration (the option is deleted) - it must be re-sourced from `spec`.
_call_pos = bR.index('graphbuilder2_html(')
_prelude_reads = set(re.findall(r'self\$options\$(\w+)', bR[:_call_pos]))

keep = roles | nonhidden | (PANEL & set(opts)) | (ACTIONS & set(opts)) | \
       (LIT & set(opts)) | ({'graphType','xyBin'} & set(opts)) | \
       (KEEP_EXTRA & set(opts))

# outside-call reads split into titles (re-source) vs data-shaping (keep real).
outside_titles = sorted((outside & TITLE_OPTS))
outside_other = sorted(o for o in outside if o not in TITLE_OPTS and o != 'annotations')
# a data-shaping read is NOT a style option -> recommend keeping it REAL.
data_shaping = [o for o in outside_other if o not in keep]  # non-keep, non-title, non-annotation outside reads -> likertCiLevel / xyMarginalBins

spec = (call_opts | outside) - keep - set(outside_titles) - set(data_shaping) - {'annotations'}

def r_default(opt):
    ty=ay_ty.get(opt); d=ay_def.get(opt)
    if ty=='Array' or d=='[]': return 'list()'
    if ty=='Bool' or d in ('true','false'): return 'TRUE' if d=='true' else 'FALSE'
    if ty in ('Number','Integer'): return d if d is not None else '0'
    s=d if d is not None else "''"
    inner=s[1:-1] if (len(s)>1 and s[0] in "\"'" and s[-1]==s[0]) else s
    return '"%s"' % inner.replace('\\','\\\\').replace('"','\\"')

rows=[{'arg':a,'opt':o,'bool':o in istrue_opts,'default':r_default(o)}
      for a,o in simple+istrue if o in spec]
mism=[(o, sig_def.get(a), ay_def.get(o)) for a,o in simple+istrue if o in spec]

print(f"=== {MOD}: {len(opts)} opts -> KEEP {len(keep)+len(data_shaping)}, SPEC {len(rows)} ===")
print(f"KEEP (stay real): {sorted(keep)}")
print(f"TITLES to RE-SOURCE from spec (b.R reads spec$xTitleOverride etc.): {outside_titles}")
print(f"DATA-SHAPING outside reads -> ADD TO KEEP (real; they trigger R recompute): {data_shaping}")
_dual = sorted((_prelude_reads & {r["opt"] for r in rows}))
if _dual:
    print(f"!! DUAL-READ (re-source these from `spec` in the PRELUDE too, not just the call): {_dual}")
print(f"annotations: gb_resolve_annotations(self$options$annotationsJson, list())")
fold_needed = bool((set(outside_titles) or set()) & FOLD) and MOD in ('distplotbuilder','freqplotbuilder')
print(f"JS axis-title PREVIEW-FOLD fix (po.chartSpec) needed: {MOD in ('distplotbuilder','freqplotbuilder')}")

tbl=[f'.{MOD}SpecTable <- list(']
for r in rows:
    tbl.append(f'    list(arg = "{r["arg"]}", opt = "{r["opt"]}", bool = {"TRUE" if r["bool"] else "FALSE"}, default = {r["default"]}),')
tbl[-1]=tbl[-1].rstrip(',')
tbl.append(')')
open(f'/tmp/spectable_{MOD}.R','w').write('\n'.join(tbl)+'\n')
print(f"\nWrote /tmp/spectable_{MOD}.R ({len(rows)} rows)")

if WRITE:
    keep_all = sorted(keep | set(data_shaping))
    header = ay[:ay.index('\noptions:')+len('\noptions:')]
    starts=[(m.start(),m.group(1)) for m in re.finditer(r'(?m)^    - name: (\w+)',ay)]
    end = ay.index('\n...') if '\n...' in ay else len(ay)
    starts.append((end,None)); bl={}
    for x in range(len(starts)-1):
        s,n=starts[x]; e=starts[x+1][0]; lines=ay[s:e].split('\n'); kept=[lines[0]]
        for ln in lines[1:]:
            st=ln.strip()
            if st.startswith('#') or st=='': continue
            kept.append(ln)
        bl[n]='\n'.join(kept)
    out=[header]
    for kk in keep_all:
        out.append('    '+bl[kk].strip())
    out.append("    - name: chartSpec\n      title: Chart spec (internal)\n      type: String\n      default: ''\n      hidden: true")
    open(f'jamovi/{MOD}.a.yaml','w').write('\n\n'.join(out)+'\n...\n')
    print(f"REWROTE jamovi/{MOD}.a.yaml -> {len(keep_all)+1} options")
else:
    print("\n(dry run - pass --write to rewrite the a.yaml; then hand-edit the .b.R do.call using the corr commit 75ee2cd as the template)")
