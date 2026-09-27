// The interactive HTML report of one run: a single self-contained page (inline CSS and JS, the run's data
// embedded as JSON), rendered in the browser. Filters: Passed / Failed, categories (tags), search. Test names
// are green when they passed and red when they failed; each failure shows the YAML file and line it failed on,
// the runFlow chain that led there and the code with the failing lines highlighted, next to the screenshot.
// Generated on request by `npm run report` into reports/report.html, and deleted when a new run starts.

/** Tags that are categories (IDs and capability markers are not). Known ones first, in this order. */
const CATEGORY_ORDER = ['smoke', 'regression', 'navigation', 'interactive', 'onboarding', 'auth', 'heatmap', 'interaction-audit', 'google'];
const isCategory = (tag) => !/^TC-|^requires-/.test(tag);

/** Values that stay private even in local reports. */
const PRIVATE_KEYS = ['TEST_USER_EMAIL', 'GOOGLE_TEST_ACCOUNT'];

export function renderHtmlReport(run, { assetBase = '' } = {}) {
  const categories = [...new Set(run.flows.flatMap((flow) => (flow.tags ?? []).filter(isCategory)))].sort(
    (a, b) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  const config = Object.fromEntries(
    Object.entries(run.config ?? {}).map(([key, value]) => [key, PRIVATE_KEYS.includes(key) && value ? 'set (private)' : value]),
  );
  const data = { ...run, config, categories, assetBase, generatedAt: new Date().toString() };
  // Inside <script>, "</" would end the tag early: escape it.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  const title = `${run.status === 'PASSED' ? 'Passed' : 'Failed'}: ${run.suite} test report`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <div class="eyebrow">MobileAutomation · Streak</div>
    <h1 id="title"></h1>
    <div id="counts" class="counts"></div>
    <details class="meta"><summary>Run details</summary><dl id="meta"></dl></details>
  </div>
</header>
<nav class="toolbar" aria-label="Filters">
  <div class="wrap toolbar-inner">
    <div class="segmented" role="group" aria-label="Result">
      <button type="button" data-status="all" aria-pressed="true">All <span></span></button>
      <button type="button" data-status="PASSED" aria-pressed="false">Passed <span></span></button>
      <button type="button" data-status="FAILED" aria-pressed="false">Failed <span></span></button>
    </div>
    <div id="chips" class="chips" role="group" aria-label="Categories"></div>
    <input id="search" type="search" placeholder="Search tests or test cases" aria-label="Search tests">
  </div>
</nav>
<main class="wrap">
  <p id="empty" class="empty" hidden>No tests match these filters.</p>
  <div id="list" class="list"></div>
  <p class="foot" id="foot"></p>
</main>
<div id="lightbox" class="lightbox" hidden><img alt=""></div>
<script type="application/json" id="run-data">${json}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9; --panel: #ffffff; --panel-2: #f0f2f5; --text: #1c2128; --muted: #5d6673; --line: #d8dde3;
  --pass: #1a7f37; --pass-bg: #dcf5e3; --fail: #cf222e; --fail-bg: #ffe3e3; --warn: #9a6700; --warn-bg: #fff1c2;
  --accent: #0969da; --code-bg: #f6f8fa; --hit: #ffd7d5; --hit-strong: #ffb3ad; --key: #0550ae; --expr: #8250df; --str: #0a3069; --comment: #6e7781;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --panel: #161b22; --panel-2: #1f2630; --text: #e6edf3; --muted: #9aa5b1; --line: #30363d;
    --pass: #3fb950; --pass-bg: #12261a; --fail: #ff6b63; --fail-bg: #3a1618; --warn: #d29922; --warn-bg: #2f2410;
    --accent: #58a6ff; --code-bg: #0d1117; --hit: #4a1f22; --hit-strong: #6e2528; --key: #79c0ff; --expr: #d2a8ff; --str: #a5d6ff; --comment: #8b949e;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 0 16px; }
.top { background: var(--panel); border-bottom: 1px solid var(--line); padding: 20px 0 14px; }
.eyebrow { color: var(--muted); font-size: 13px; letter-spacing: .02em; }
h1 { margin: 4px 0 10px; font-size: 22px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.badge { font-size: 12px; font-weight: 700; padding: 3px 9px; border-radius: 999px; letter-spacing: .03em; }
.badge.PASSED { background: var(--pass-bg); color: var(--pass); }
.badge.FAILED { background: var(--fail-bg); color: var(--fail); }
.counts { display: flex; gap: 18px; flex-wrap: wrap; color: var(--muted); font-size: 14px; }
.counts b { color: var(--text); font-variant-numeric: tabular-nums; }
.counts .p b { color: var(--pass); } .counts .f b { color: var(--fail); }
.meta { margin-top: 10px; font-size: 13px; }
.meta summary { cursor: pointer; color: var(--accent); }
.meta dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 10px 0 0; }
.meta dt { color: var(--muted); } .meta dd { margin: 0; overflow-wrap: anywhere; }
.toolbar { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(6px); border-bottom: 1px solid var(--line); }
.toolbar-inner { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding-top: 10px; padding-bottom: 10px; }
.segmented { display: inline-flex; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--panel); }
.segmented button { border: 0; background: none; color: var(--text); padding: 7px 14px; font: inherit; font-size: 14px; cursor: pointer; }
.segmented button + button { border-left: 1px solid var(--line); }
.segmented button span { color: var(--muted); font-variant-numeric: tabular-nums; margin-left: 4px; }
.segmented button[aria-pressed="true"] { background: var(--panel-2); font-weight: 600; }
.segmented button[data-status="PASSED"][aria-pressed="true"] { color: var(--pass); }
.segmented button[data-status="FAILED"][aria-pressed="true"] { color: var(--fail); }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip { border: 1px solid var(--line); background: var(--panel); color: var(--text); border-radius: 999px; padding: 4px 11px; font: inherit; font-size: 13px; cursor: pointer; }
.chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
#search { margin-left: auto; min-width: 220px; flex: 0 1 280px; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--panel); color: var(--text); font: inherit; font-size: 14px; }
.list { display: flex; flex-direction: column; gap: 8px; margin: 16px 0; }
.test { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.test.FAILED { border-left: 4px solid var(--fail); } .test.PASSED { border-left: 4px solid var(--pass); }
.test > summary { list-style: none; cursor: pointer; padding: 12px 14px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.test > summary::-webkit-details-marker { display: none; }
.test > summary:hover { background: var(--panel-2); }
.icon { width: 20px; height: 20px; border-radius: 50%; display: inline-grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
.PASSED .icon { background: var(--pass-bg); color: var(--pass); } .FAILED .icon { background: var(--fail-bg); color: var(--fail); }
.name { font-weight: 600; flex: 1 1 320px; }
.PASSED .name { color: var(--pass); } .FAILED .name { color: var(--fail); }
.tags { display: flex; gap: 5px; flex-wrap: wrap; }
.tag { font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--panel-2); color: var(--muted); }
.tag.tc { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
.tag.retry { background: var(--warn-bg); color: var(--warn); }
.time { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.body { border-top: 1px solid var(--line); padding: 14px; display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
.body > *, .body section, .body dl { min-width: 0; }
.facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 14px; margin: 0; font-size: 14px; }
.facts dt { color: var(--muted); } .facts dd { margin: 0; overflow-wrap: anywhere; }
.facts .actual { color: var(--fail); }
.notice { background: var(--warn-bg); color: var(--warn); border-radius: 8px; padding: 8px 12px; font-size: 14px; }
.where h3, .shots h3, .trail h3, .applog h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 0 0 8px; }
.loc { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 13px; }
.loc b { color: var(--fail); }
.chain { margin: 6px 0 10px; padding: 0; list-style: none; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 12.5px; color: var(--muted); }
.chain li { padding: 1px 0; overflow-wrap: anywhere; }
.chain li::before { content: "↳ "; }
.chain li:first-child::before { content: ""; }
.chain li:last-child { color: var(--fail); font-weight: 600; }
pre.code { margin: 0; background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; font: 12.5px/1.55 ui-monospace, SFMono-Regular, Consolas, monospace; padding: 8px 0; }
.code .ln { display: flex; padding: 0 12px 0 0; white-space: pre; }
.code .n { width: 3.5em; flex: none; text-align: right; padding-right: 12px; color: var(--muted); user-select: none; }
.code .ln.hit { background: var(--hit); }
.code .ln.hit.first { background: var(--hit-strong); }
.code .ln.hit .n { color: var(--fail); font-weight: 700; }
.code .ln.first .n::before { content: "▶ "; }
.k { color: var(--key); } .x { color: var(--expr); } .s { color: var(--str); } .c { color: var(--comment); font-style: italic; }
.shots .row { display: flex; gap: 10px; flex-wrap: wrap; }
.shot { display: grid; gap: 4px; font-size: 12px; color: var(--muted); max-width: 190px; }
.shot img { width: 180px; max-height: 380px; object-fit: cover; object-position: top; border-radius: 8px; border: 1px solid var(--line); cursor: zoom-in; background: var(--panel-2); }
.shot span { overflow-wrap: anywhere; }
.links { font-size: 13px; display: flex; gap: 14px; flex-wrap: wrap; }
.links a { color: var(--accent); }
.trail ol { margin: 0; padding-left: 20px; font-size: 14px; color: var(--muted); }
.applog pre { margin: 0; background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; overflow-x: auto; font: 12px/1.5 ui-monospace, Consolas, monospace; }
.empty { text-align: center; color: var(--muted); padding: 40px 0; }
.foot { color: var(--muted); font-size: 12px; margin: 24px 0 40px; }
.lightbox { position: fixed; inset: 0; background: rgba(0,0,0,.8); display: grid; place-items: center; z-index: 20; cursor: zoom-out; }
.lightbox[hidden] { display: none; }
.lightbox img { max-width: 94vw; max-height: 94vh; border-radius: 10px; }
@media (max-width: 640px) {
  #search { margin-left: 0; flex: 1 1 100%; }
  .facts, .meta dl { grid-template-columns: minmax(0, 1fr); }
  .facts dt, .meta dt { margin-top: 6px; }
}
`;

// Runs in the browser. Builds the page from the embedded JSON with DOM APIs (text is never parsed as HTML,
// except code lines, which are escaped first and only wrapped in highlighting spans).
const SCRIPT = String.raw`
(function () {
  var run = JSON.parse(document.getElementById('run-data').textContent);
  var state = { status: 'all', categories: new Set(), query: '' };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function asset(path) { return encodeURI(run.assetBase + path).replace(/#/g, '%23'); }
  function label(tag) { var t = tag.replace(/-/g, ' '); return t.charAt(0).toUpperCase() + t.slice(1); }
  function escapeHtml(text) { return text.replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }
  function highlight(line) {
    var html = escapeHtml(line);
    var comment = '';
    var hash = html.search(/(^|\s)#/);
    if (hash >= 0) { comment = '<span class="c">' + html.slice(hash) + '</span>'; html = html.slice(0, hash); }
    html = html
      .replace(/^(\s*-?\s*)([A-Za-z_][\w-]*)(:)/, '$1<span class="k">$2</span>$3')
      .replace(/(\$\{[^}]*\})/g, '<span class="x">$1</span>')
      .replace(/('[^']*')/g, function (m) { return m.indexOf('class=') >= 0 ? m : '<span class="s">' + m + '</span>'; });
    return html + comment;
  }

  // ----- header -----
  var title = document.getElementById('title');
  title.appendChild(el('span', { text: run.suite + ' run' }));
  title.appendChild(el('span', { class: 'badge ' + run.status, text: run.status }));
  var retried = run.flows.filter(function (f) { return f.attempts > 1; }).length;
  var counts = document.getElementById('counts');
  [['', run.flows.length, 'tests'], ['p', run.passed, 'passed'], ['f', run.failed, 'failed']].forEach(function (c) {
    counts.appendChild(el('span', { class: c[0] }, [el('b', { text: String(c[1]) }), ' ' + c[2]]));
  });
  if (retried) counts.appendChild(el('span', {}, [el('b', { text: String(retried) }), ' re-run after a lost connection']));
  counts.appendChild(el('span', { text: (run.durationSec != null ? Math.round(run.durationSec / 60) + ' min · ' : '') + (run.startedAt || '') }));

  var meta = document.getElementById('meta');
  function fact(dl, name, value, cls) { if (value == null || value === '') return; dl.appendChild(el('dt', { text: name })); dl.appendChild(el('dd', { class: cls || '', text: String(value) })); }
  var d = run.device, a = run.app;
  fact(meta, 'Run', run.id);
  if (d) fact(meta, 'Device', d.brand + ' ' + d.model + ', Android ' + d.android + ' (SDK ' + d.sdk + '), ' + d.connection);
  if (a) fact(meta, 'App', a.appId + ' ' + a.versionName + ' (build ' + a.versionCode + '), installed ' + a.lastUpdateTime);
  fact(meta, 'Tools', 'Maestro ' + (run.maestroVersion || '?') + ', Java ' + (run.java || '?') + ', Node ' + (run.node || '?'));
  fact(meta, 'Framework', 'MobileAutomation ' + (run.frameworkCommit || '(uncommitted)'));
  fact(meta, 'Command', run.command);
  fact(meta, 'Environment', Object.keys(run.config || {}).map(function (k) { return k + '=' + run.config[k]; }).join(', '));
  if (run.notRun && run.notRun.length) fact(meta, 'Not run', run.notRun.join('; '));
  if (run.problems && run.problems.length) fact(meta, 'Maestro problems', run.problems.join(' | '));

  // ----- filters -----
  var buttons = Array.prototype.slice.call(document.querySelectorAll('.segmented button'));
  function setCount(status, n) { buttons.filter(function (b) { return b.dataset.status === status; })[0].querySelector('span').textContent = n; }
  setCount('all', run.flows.length); setCount('PASSED', run.passed); setCount('FAILED', run.failed);
  buttons.forEach(function (button) {
    button.addEventListener('click', function () {
      state.status = button.dataset.status;
      buttons.forEach(function (b) { b.setAttribute('aria-pressed', String(b === button)); });
      apply();
    });
  });
  var chips = document.getElementById('chips');
  run.categories.forEach(function (category) {
    var chip = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', text: label(category) });
    chip.addEventListener('click', function () {
      if (state.categories.has(category)) state.categories.delete(category); else state.categories.add(category);
      chip.setAttribute('aria-pressed', String(state.categories.has(category)));
      apply();
    });
    chips.appendChild(chip);
  });
  document.getElementById('search').addEventListener('input', function (event) { state.query = event.target.value.trim().toLowerCase(); apply(); });

  // ----- tests -----
  var list = document.getElementById('list');
  var rows = run.flows.slice().sort(function (x, y) { return (x.status === y.status ? 0 : x.status === 'FAILED' ? -1 : 1) || x.name.localeCompare(y.name); })
    .map(function (flow) { var node = renderFlow(flow); list.appendChild(node); return { flow: flow, node: node }; });

  function renderFlow(flow) {
    var passed = flow.status === 'PASSED';
    var details = el('details', { class: 'test ' + flow.status });
    if (!passed) details.open = true;
    var tags = el('span', { class: 'tags' });
    (flow.testCases || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).forEach(function (tc) { tags.appendChild(el('span', { class: 'tag tc', text: tc })); });
    (flow.tags || []).filter(function (t) { return run.categories.indexOf(t) >= 0; }).forEach(function (t) { tags.appendChild(el('span', { class: 'tag', text: label(t) })); });
    if (flow.attempts > 1) tags.appendChild(el('span', { class: 'tag retry', title: 'Re-run after: ' + flow.retriedBecause, text: 'attempt ' + flow.attempts }));
    details.appendChild(el('summary', {}, [
      el('span', { class: 'icon', 'aria-hidden': 'true', text: passed ? '✓' : '✕' }),
      el('span', { class: 'name', text: flow.name }),
      tags,
      el('span', { class: 'time', text: (flow.durationSec || 0) + 's' }),
      el('span', { class: 'sr', style: 'position:absolute;left:-9999px', text: passed ? 'passed' : 'failed' })
    ]));
    var body = el('div', { class: 'body' });
    if (!passed && flow.failure) body.appendChild(renderFailure(flow));
    var shots = [];
    if (flow.failure && flow.failure.screenshot) shots.push([flow.failure.screenshot, 'At the failure']);
    (flow.evidence || []).forEach(function (path) { shots.push([path, path.split('/').pop().replace(/\.png$/, '').replace(/^evidence-/, '')]); });
    if (shots.length) {
      var row = el('div', { class: 'row' });
      shots.forEach(function (shot) {
        var img = el('img', { src: asset(shot[0]), alt: shot[1], loading: 'lazy' });
        img.addEventListener('click', function () { var box = document.getElementById('lightbox'); box.querySelector('img').src = img.src; box.hidden = false; });
        row.appendChild(el('figure', { class: 'shot', style: 'margin:0' }, [img, el('span', { text: shot[1] })]));
      });
      body.appendChild(el('section', { class: 'shots' }, [el('h3', { text: 'Screenshots' }), row]));
    }
    if (flow.file) body.appendChild(el('div', { class: 'links' }, [el('span', { class: 'loc', text: flow.file })]));
    if (body.childNodes.length) details.appendChild(body);
    return details;
  }

  function renderFailure(flow) {
    var f = flow.failure;
    var box = el('div', { style: 'display:grid;gap:14px;grid-template-columns:minmax(0,1fr)' });
    if (f.infrastructure) box.appendChild(el('div', { class: 'notice', text: 'The device connection or Maestro’s on-device driver failed here, not the app. See docs/troubleshooting.md.' }));
    var facts = el('dl', { class: 'facts' });
    fact(facts, 'Failed step', f.step + (f.target ? '  (' + f.target + ')' : ''));
    fact(facts, 'Expected', f.expected);
    fact(facts, 'Actual', f.actual, 'actual');
    fact(facts, 'When', f.at);
    box.appendChild(facts);

    if (f.source) {
      var where = el('section', { class: 'where' }, [el('h3', { text: 'Where it failed' })]);
      where.appendChild(el('div', { class: 'loc' }, [el('b', { text: f.source.file + ':' + f.source.line })]));
      if (f.source.chain && f.source.chain.length > 1) {
        var chain = el('ol', { class: 'chain', 'aria-label': 'Called from' });
        f.source.chain.forEach(function (c) { chain.appendChild(el('li', { text: c.file + ':' + c.line + '   ' + c.text })); });
        where.appendChild(chain);
      }
      if (f.source.snippet) {
        var s = f.source.snippet;
        var pre = el('pre', { class: 'code', 'aria-label': 'Code around the failing line' });
        s.lines.forEach(function (text, i) {
          var n = s.start + i;
          var hit = n >= s.from && n <= s.to;
          var line = el('span', { class: 'ln' + (hit ? ' hit' : '') + (n === s.from ? ' first' : '') });
          line.appendChild(el('span', { class: 'n', text: String(n) }));
          var code = el('span');
          code.innerHTML = highlight(text) || ' ';
          line.appendChild(code);
          pre.appendChild(line);
        });
        where.appendChild(pre);
      }
      box.appendChild(where);
    }

    var links = el('div', { class: 'links' });
    if (f.hierarchy) links.appendChild(el('a', { href: asset(f.hierarchy), target: '_blank', rel: 'noopener', text: 'Screen hierarchy (what Maestro could see)' }));
    if (f.deviceLog) links.appendChild(el('a', { href: asset(f.deviceLog), target: '_blank', rel: 'noopener', text: 'Device log' }));
    if (links.childNodes.length) box.appendChild(links);
    if (f.passedBefore && f.passedBefore.length) {
      var ol = el('ol');
      f.passedBefore.forEach(function (step) { ol.appendChild(el('li', { text: step })); });
      box.appendChild(el('section', { class: 'trail' }, [el('h3', { text: 'Last steps that passed' }), ol]));
    }
    if (f.appLog && f.appLog.length) box.appendChild(el('section', { class: 'applog' }, [el('h3', { text: 'App errors in the device log' }), el('pre', { text: f.appLog.join('\n') })]));
    return box;
  }

  function apply() {
    var shown = 0;
    rows.forEach(function (row) {
      var flow = row.flow;
      var okStatus = state.status === 'all' || flow.status === state.status;
      var okCategory = !state.categories.size || (flow.tags || []).some(function (t) { return state.categories.has(t); });
      var hay = (flow.name + ' ' + (flow.testCases || '')).toLowerCase();
      var okQuery = !state.query || hay.indexOf(state.query) >= 0;
      var visible = okStatus && okCategory && okQuery;
      row.node.hidden = !visible;
      if (visible) shown += 1;
    });
    document.getElementById('empty').hidden = shown > 0;
  }

  var lightbox = document.getElementById('lightbox');
  lightbox.addEventListener('click', function () { lightbox.hidden = true; });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape') lightbox.hidden = true; });
  document.getElementById('foot').textContent = 'Generated ' + run.generatedAt + ' by npm run report. This page is rebuilt on request and deleted when a new test run starts; the run’s files stay in reports/runs/' + run.id + '/.';
  apply();
})();
`;
