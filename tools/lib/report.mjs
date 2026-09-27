// Turns a run's raw Maestro artifacts into one readable failure report: reports/runs/<run>/summary.md and a
// machine-readable run.json. For every failed flow: which test cases it covers, the step that failed, what
// was expected, what actually happened, and where the screenshot, screen hierarchy and device log are.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

/** Every flow folder Maestro wrote (each has a commands.json). */
function findFlowDirs(root) {
  if (!existsSync(root)) return [];
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (!statSync(path).isDirectory()) continue;
      if (existsSync(join(path, 'commands.json'))) found.push(path);
      else walk(path);
    }
  };
  walk(root);
  return found;
}

const commandOf = (entry) => entry.metadata?.evaluatedCommand ?? entry.command ?? {};

function commandBody(entry) {
  const [type, body] = Object.entries(commandOf(entry))[0] ?? ['unknown', {}];
  return { type: type.replace(/Command$/, ''), body: body ?? {} };
}

function selectorText(selector = {}) {
  const parts = [];
  if (selector.idRegex) parts.push(`id=${selector.idRegex}`);
  if (selector.textRegex) parts.push(`text=${selector.textRegex}`);
  if (selector.enabled !== undefined && selector.enabled !== null) parts.push(`enabled=${selector.enabled}`);
  if (selector.checked !== undefined && selector.checked !== null) parts.push(`checked=${selector.checked}`);
  if (selector.selected !== undefined && selector.selected !== null) parts.push(`selected=${selector.selected}`);
  if (selector.childOf) parts.push(`inside (${selectorText(selector.childOf)})`);
  return parts.join(', ');
}

/** The selector a command acted on, as text ("id=home-screen, enabled=true"). */
function targetOf(body) {
  const selector =
    body.selector ??
    body.condition?.visible ??
    body.condition?.notVisible ??
    body.visible ??
    body.notVisible ??
    body.scrollUntilVisible?.selector ??
    body.selector;
  return selector ? selectorText(selector) : '';
}

function describe(entry) {
  const { type, body } = commandBody(entry);
  if (body.label) return body.label;
  if (body.sourceDescription) return `${type} ${body.sourceDescription}`;
  const target = targetOf(body);
  return target ? `${type} (${target})` : type;
}

const isOptional = (entry) => Boolean(commandBody(entry).body.optional);

function flowConfig(entries) {
  for (const entry of entries) {
    const config = commandOf(entry).applyConfigurationCommand?.config;
    if (config) return config;
  }
  return {};
}

/** Last lines of the device log that point at a JavaScript error or a crash. */
function interestingLogLines(logFile, limit = 15) {
  if (!existsSync(logFile)) return [];
  const lines = readFileSync(logFile, 'utf8').split(/\r?\n/);
  return lines
    .filter((line) => /ReactNativeJS|FATAL EXCEPTION|AndroidRuntime|ANR in|\bE (ReactNative|unknown)/.test(line))
    .filter((line) => !/ReactNativeJS: Running "main"/.test(line))
    .slice(-limit);
}

/** Failures caused by the device link or Maestro's on-device driver, not by the app. */
export const INFRA_FAILURE =
  /DeviceServerDiedException|StatusRuntimeException: UNAVAILABLE|device offline|device '.*' not found|no devices\/emulators found|Unable to connect to device|failed to connect to|was requested, but it is not connected|Maestro produced no result/i;

/** "2026-09-27 16:59:33" in the laptop's time zone (the phone's clock in the device log should match). */
export function localTime(value) {
  const date = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const unescapeXml = (text) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

/** Maestro's JUnit report → Map(flow name → { status, file, failure, timeSec }). */
export function parseJunit(file) {
  const results = new Map();
  if (!file || !existsSync(file)) return results;
  const xml = readFileSync(file, 'utf8');
  for (const match of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/(\w+)="([^"]*)"/g)].map((m) => [m[1], unescapeXml(m[2])]));
    const failure = /<(failure|error)\b[^>]*>([\s\S]*?)<\/\1>/.exec(match[3] ?? '');
    const status = attrs.status ? (attrs.status === 'SUCCESS' ? 'PASSED' : 'FAILED') : failure ? 'FAILED' : 'PASSED';
    const properties = Object.fromEntries(
      [...(match[3] ?? '').matchAll(/<property name="([^"]*)" value="([^"]*)"\/>/g)].map((m) => [m[1], unescapeXml(m[2])]),
    );
    results.set(attrs.name, {
      status,
      testCases: properties.testCases ?? '',
      file: attrs.file ?? '',
      failure: failure ? unescapeXml(failure[2]).trim() : '',
      timeSec: attrs.time ? Math.round(Number(attrs.time)) : undefined,
    });
  }
  return results;
}

const simplify = (text) => text.replace(/[^A-Za-z0-9]+/g, '');

/** Maestro names flow folders after the flow name; tolerate characters it replaced. */
function findByFolder(results, folder) {
  for (const [name, result] of results) if (simplify(name) === simplify(folder)) return result;
  return null;
}

function analyseFlow(flowDir, runDir, junit) {
  const entries = JSON.parse(readFileSync(join(flowDir, 'commands.json'), 'utf8'));
  const config = flowConfig(entries);
  const rel = (path) => relative(runDir, path).split(sep).join('/');
  const start = entries[0]?.metadata?.timestamp ?? 0;
  const last = entries[entries.length - 1]?.metadata;
  const durationSec = last ? Math.round(((last.timestamp ?? start) + (last.duration ?? 0) - start) / 1000) : 0;
  const topFailures = entries.filter(
    (entry) => entry.metadata?.depth === 0 && entry.metadata?.status === 'FAILED' && !isOptional(entry),
  );
  // A flow Maestro abandoned (e.g. the device connection died) ends with steps still RUNNING.
  const stillRunning = entries.filter((entry) => entry.metadata?.status === 'RUNNING');
  const flow = {
    name: config.name || basename(flowDir),
    folder: rel(flowDir),
    status: junit ? junit.status : topFailures.length || stillRunning.length ? 'FAILED' : 'PASSED',
    testCases: config.properties?.testCases || junit?.testCases || '',
    tags: config.tags ?? [],
    durationSec: junit?.timeSec ?? durationSec,
    evidence: [],
  };

  const screenshotsDir = join(flowDir, 'takeScreenshot');
  if (existsSync(screenshotsDir)) flow.evidence = readdirSync(screenshotsDir).map((name) => rel(join(screenshotsDir, name)));

  if (flow.status === 'PASSED') return flow;

  let failed = null;
  if (topFailures.length) {
    // Follow the failure down from the top-level command to the deepest step that failed inside it.
    const top = topFailures[topFailures.length - 1];
    const topIndex = entries.indexOf(top);
    failed = top;
    // Steps are logged in start order, so a failed step's sub-steps follow it. The failing leaf is the deepest,
    // latest FAILED step, not counting steps inside optional subflows (failures those are allowed to have).
    let optionalDepth = Infinity;
    for (let i = topIndex + 1; i < entries.length; i += 1) {
      const entry = entries[i];
      const depth = entry.metadata?.depth ?? 0;
      if (depth > optionalDepth) continue;
      optionalDepth = Infinity;
      if (isOptional(entry)) {
        optionalDepth = depth;
        continue;
      }
      if (entry.metadata?.status === 'FAILED' && depth >= failed.metadata.depth) failed = entry;
    }
  } else if (stillRunning.length) {
    failed = stillRunning.reduce((deepest, entry) => (entry.metadata.depth >= deepest.metadata.depth ? entry : deepest));
  }
  if (!failed) failed = entries[entries.length - 1] ?? { metadata: {} };
  const junitReason = junit?.failure ? junit.failure.split(/\r?\n/)[0].trim() : '';

  const failedIndex = entries.indexOf(failed);
  const trail = entries
    .slice(0, failedIndex)
    .filter((entry) => entry.metadata?.status === 'COMPLETED' && commandBody(entry).body.label)
    .slice(-5)
    .map(describe);
  const artifact = (type) => failed.metadata?.artifacts?.find((item) => item.type === type)?.path;
  const screenshot = artifact('SCREENSHOT');
  const hierarchy = artifact('SCREEN_HIERARCHY');
  const deviceLog = join(flowDir, 'logs', 'device-logcat.txt');
  const { body } = commandBody(failed);
  // An unlabelled step reads better with the expectation of the nearest labelled step that failed around it.
  const labelled = [...entries.slice(0, failedIndex + 1)]
    .reverse()
    .find((entry) => entry.metadata?.status === 'FAILED' && commandBody(entry).body.label);

  flow.failure = {
    step: describe(failed),
    command: commandBody(failed).type,
    target: targetOf(body),
    expected: body.label || (labelled ? commandBody(labelled).body.label : describe(failed)),
    actual:
      failed.metadata?.error?.message ??
      (junitReason || (failed.metadata?.status === 'RUNNING' ? 'The flow stopped during this step' : 'no error message')),
    infrastructure: INFRA_FAILURE.test(junit?.failure ?? ''),
    at: localTime(failed.metadata?.timestamp ?? start),
    screenshot: screenshot ? rel(join(flowDir, screenshot)) : '',
    hierarchy: hierarchy ? rel(join(flowDir, hierarchy)) : '',
    deviceLog: existsSync(deviceLog) ? rel(deviceLog) : '',
    appLog: interestingLogLines(deviceLog),
    passedBefore: trail,
  };
  return flow;
}

const md = (text) => String(text ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const link = (path) => (path ? `[${path.split('/').pop()}](${encodeURI(path)})` : '—');

/**
 * A run can have several attempts ({ maestroDir, junit }): the first, then a re-run of flows whose device
 * connection died. The latest attempt of each flow counts; earlier ones are noted.
 */
export function writeRunReport(runDir, meta, attempts) {
  const byName = new Map();
  const record = (flow) => {
    const previous = byName.get(flow.name);
    if (previous) {
      flow.attempts = (previous.attempts ?? 1) + 1;
      flow.retriedBecause = previous.failure?.actual ?? 'first attempt failed';
    }
    byName.set(flow.name, flow);
  };
  for (const attempt of attempts) {
    const results = attempt.junit ? parseJunit(attempt.junit) : null;
    const seen = new Set();
    for (const dir of findFlowDirs(attempt.maestroDir)) {
      const folder = basename(dir);
      const result = results?.get(folder) ?? (results ? findByFolder(results, folder) : null);
      const flow = analyseFlow(dir, runDir, result);
      seen.add(flow.name);
      record(flow);
    }
    // Flows that failed before Maestro wrote any artifacts exist only in the JUnit report.
    for (const [name, result] of results ?? []) {
      if (seen.has(name) || [...seen].some((flowName) => simplify(flowName) === simplify(name))) continue;
      record({
        name,
        folder: '',
        status: result.status,
        testCases: result.testCases,
        tags: [],
        durationSec: result.timeSec ?? 0,
        evidence: [],
        failure:
          result.status === 'FAILED'
            ? {
                step: '(before the first step)',
                command: '',
                target: '',
                expected: 'the flow runs',
                actual: result.failure.split(/\r?\n/)[0],
                infrastructure: INFRA_FAILURE.test(result.failure),
                at: '',
                screenshot: '',
                hierarchy: '',
                deviceLog: '',
                appLog: [],
                passedBefore: [],
              }
            : undefined,
      });
    }
  }
  // Flows the runner planned but Maestro never started (e.g. the phone was unreachable) still count.
  for (const planned of meta.planned ?? []) {
    if ([...byName.keys()].some((name) => simplify(name) === simplify(planned.name))) continue;
    byName.set(planned.name, {
      name: planned.name,
      folder: '',
      status: 'FAILED',
      testCases: planned.testCases,
      tags: [],
      durationSec: 0,
      evidence: [],
      failure: {
        step: '(Maestro did not start the flow)',
        command: '',
        target: '',
        expected: 'the flow runs',
        actual: planned.failure || 'no result',
        infrastructure: INFRA_FAILURE.test(planned.failure ?? ''),
        at: '',
        screenshot: '',
        hierarchy: '',
        deviceLog: '',
        appLog: [],
        passedBefore: [],
      },
    });
  }
  const flows = [...byName.values()];
  flows.sort((a, b) => a.name.localeCompare(b.name));
  const failed = flows.filter((flow) => flow.status === 'FAILED');
  const status = failed.length === 0 && flows.length > 0 ? 'PASSED' : 'FAILED';
  const run = { ...meta, status, passed: flows.length - failed.length, failed: failed.length, flows };
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(run, null, 2));

  const lines = [];
  lines.push(`# ${meta.id}: ${status} (${run.passed} passed, ${run.failed} failed)`, '');
  lines.push('| | |', '|---|---|');
  lines.push(`| Suite | ${md(meta.suite)} |`);
  lines.push(`| Command | \`${md(meta.command)}\` |`);
  lines.push(`| Started | ${md(meta.startedAt)} (${meta.durationSec}s) |`);
  if (meta.device) {
    const d = meta.device;
    lines.push(`| Device | ${md(`${d.brand} ${d.model}, Android ${d.android} (SDK ${d.sdk}), ${d.connection}, ${d.serial}`)} |`);
  }
  if (meta.app) {
    const a = meta.app;
    lines.push(`| App | ${md(`${a.appId} ${a.versionName} (build ${a.versionCode})${a.debuggable ? ', debug build' : ''}, installed ${a.lastUpdateTime}`)} |`);
  }
  lines.push(`| Tools | ${md(`Maestro ${meta.maestroVersion ?? '?'}, Java ${meta.java ?? '?'}, Node ${meta.node}`)} |`);
  lines.push(`| Framework | ${md(`MobileAutomation ${meta.frameworkCommit ?? '(no commit yet)'}`)} |`);
  lines.push(`| Environment | ${md(Object.entries(meta.config ?? {}).map(([k, v]) => `${k}=${v}`).join(', '))} |`);
  if (meta.notRun?.length) lines.push(`| Not run | ${md(meta.notRun.join('; '))} |`);
  lines.push('');

  lines.push('## Results', '', '| Flow | Test cases | Result | Time |', '|---|---|---|---|');
  for (const flow of flows) {
    const result = flow.status === 'PASSED' ? 'passed' : '**FAILED**';
    const retried = flow.attempts > 1 ? ` (attempt ${flow.attempts}, re-run after: ${flow.retriedBecause})` : '';
    lines.push(`| ${md(flow.name)} | ${md(flow.testCases)} | ${md(result + retried)} | ${flow.durationSec}s |`);
  }
  if (!flows.length) lines.push('| (no flow ran: see logs/console.log) | | | |');
  lines.push('');
  if (meta.problems?.length) {
    lines.push('## Problems reported by Maestro', '', '```text', ...meta.problems, '```', '');
  }

  if (failed.length) {
    lines.push('## Failures', '');
    for (const flow of failed) {
      const f = flow.failure;
      lines.push(`### ${flow.name}`, '');
      lines.push(`- **Test cases:** ${flow.testCases || '—'}`);
      lines.push(`- **Failed step:** ${f.step}${f.target ? ` (\`${f.target}\`)` : ''}`);
      lines.push(`- **Expected:** ${f.expected}`);
      lines.push(`- **Actual:** ${f.actual}`);
      if (f.infrastructure) {
        lines.push('- **Cause:** the device connection or Maestro\'s on-device driver failed, not the app (see docs/troubleshooting.md#device-not-detected)');
      }
      lines.push(`- **When:** ${f.at || '—'}`);
      lines.push(`- **Screenshot:** ${link(f.screenshot)} · **Screen hierarchy:** ${link(f.hierarchy)} · **Device log:** ${link(f.deviceLog)}`);
      if (f.passedBefore.length) lines.push(`- **Last steps that passed:** ${f.passedBefore.join(' → ')}`);
      if (f.appLog.length) lines.push('', '```text', ...f.appLog, '```');
      lines.push('');
    }
  }

  const evidence = flows.filter((flow) => flow.evidence.length);
  if (evidence.length) {
    lines.push('## Evidence screenshots', '');
    for (const flow of evidence) lines.push(`- ${flow.name}: ${flow.evidence.map(link).join(', ')}`);
    lines.push('');
  }
  lines.push(
    'Raw artifacts: `maestro/` (per-flow commands.json, screenshots, hierarchy, device logs), `junit.xml`,',
    '`debug/` (maestro.log), `logs/` (console and crash logs); `*-retry` folders hold the re-run attempt.',
    '',
  );
  writeFileSync(join(runDir, 'summary.md'), lines.join('\n'));
  return run;
}

/** Replaces every secret value in the run's text files (defence in depth: secrets never go to Maestro). */
export function scrubSecrets(runDir, secrets) {
  const values = secrets.filter((value) => value && value.length >= 8);
  if (!values.length || !existsSync(runDir)) return;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(json|txt|log|xml|md|html|yaml)$/i.test(name)) {
        const text = readFileSync(path, 'utf8');
        let next = text;
        for (const value of values) next = next.split(value).join('***');
        if (next !== text) writeFileSync(path, next);
      }
    }
  };
  walk(runDir);
}
