#!/usr/bin/env node
// MobileAutomation runner: one entry point for local and CI runs, so every run is set up, filtered and
// reported the same way. Run `node tools/run.mjs help` (or see docs/running-tests.md).
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { capture, findAdb, findMaestro, javaVersion, maestroEnv, maestroVersion, start } from './lib/binaries.mjs';
import { appInfo, crashLog, deviceInfo, ensureConnected, listDevices, resolveDevice } from './lib/device.mjs';
import { capabilities, describeConfig, loadConfig, MAESTRO_PARAMS, PRIVATE, SECRETS } from './lib/env.mjs';
import { renderHtmlReport } from './lib/html-report.mjs';
import { startOtpBroker } from './lib/otp-broker.mjs';
import { INFRA_FAILURE, parseJunit, rebuildRun, scrubSecrets, writeRunReport } from './lib/report.mjs';
import { syncTestData } from './sync-test-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE = join(ROOT, 'maestro');
const REPORTS = join(ROOT, 'reports');
/** The HTML report: built on request by `report`, deleted when a new test run starts. */
const HTML_REPORT = join(REPORTS, 'report.html');

const SUITES = {
  smoke: { include: ['smoke'], about: 'fast check that the app is fundamentally usable' },
  regression: { include: ['regression'], about: 'every automated scenario (not the interactive ones)' },
  navigation: { include: ['navigation'], about: 'tab bar, back navigation and interaction audits' },
  google: { include: ['google'], interactive: true, about: "Google sign-in (a person finishes Google's prompts)" },
  all: { include: [], about: 'every flow except interactive ones' },
};

const HELP = `MobileAutomation runner

  node tools/run.mjs doctor                   check Java, Maestro, adb, the device, the app and .env
  node tools/run.mjs suite <name> [options]   ${Object.keys(SUITES).join(' | ')}
  node tools/run.mjs flow <path> [options]    one flow file, or a folder of flows
  node tools/run.mjs tag <tags> [options]     flows with any of these tags (e.g. heatmap or TC-HM-005)
  node tools/run.mjs inspect [--all]          list the elements on the phone's current screen
  node tools/run.mjs studio                   open Maestro Studio (build selectors interactively)
  node tools/run.mjs report [run folder]      open the HTML report of the latest (or given) run
                                              (--text prints the summary instead, --no-open only writes it)

Options for suite, flow and tag:
  --device <serial>      adb serial to use (default: DEVICE_ID in .env, else the only connected device)
  --debug                show Maestro's full output and log verbosely
  --watch                flow only: re-run whenever the flow file changes
  --interactive          also run flows tagged "interactive" (they wait for a person)
  --exclude-tags <a,b>   leave out more tags
  --html                 Maestro's detailed HTML report instead of JUnit XML
  --list                 only print which flows would run
  -e KEY=VALUE           extra Maestro parameter, e.g. -e TODAY=2026-09-27 or -e TIMEOUT_SCALE=1.5
`;

// ----- small helpers ------------------------------------------------------------------------------------

const log = (message = '') => console.log(message);
const fail = (message, hint) => {
  console.error(`\nERROR: ${message}`);
  if (hint) console.error(`       ${hint}`);
  process.exit(2);
};

function parseArgs(argv) {
  const options = { excludeTags: [], params: [], positional: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--device') options.device = argv[++i];
    else if (arg === '--debug') options.debug = true;
    else if (arg === '--watch') options.watch = true;
    else if (arg === '--interactive') options.interactive = true;
    else if (arg === '--html') options.html = true;
    else if (arg === '--all') options.all = true;
    else if (arg === '--list') options.list = true;
    else if (arg === '--text') options.text = true;
    else if (arg === '--no-open') options.noOpen = true;
    else if (arg === '--exclude-tags') options.excludeTags.push(...argv[++i].split(','));
    else if (arg === '-e' || arg === '--env') options.params.push(argv[++i]);
    else options.positional.push(arg);
  }
  return options;
}

const timestamp = (date = new Date()) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
};

function gitCommit() {
  const result = capture('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD']);
  return result.ok ? result.stdout.trim() : null;
}

function requireMaestro(config) {
  const maestro = findMaestro(config);
  if (!maestro) {
    fail(
      'Maestro CLI not found (PATH, MAESTRO_BIN, ~/maestro/bin or ~/.maestro/bin).',
      'Install it: docs/device-setup.md#2-install-maestro',
    );
  }
  return maestro;
}

function requireDevice(config, options) {
  const adb = findAdb(config);
  if (!adb) fail('adb not found (PATH, ADB_BIN or the Android SDK).', 'See docs/device-setup.md#1-android-sdk-platform-tools');
  const { device, error, all } = resolveDevice(adb, options.device ?? config.DEVICE_ID);
  if (error) {
    const listed = all.length ? all.map((d) => `${d.serial} (${d.state})`).join(', ') : 'none';
    fail(`${error} adb sees: ${listed}.`, 'Connect the phone: docs/device-setup.md#3-connect-the-phone-over-wi-fi');
  }
  return { adb, serial: device.serial };
}

// ----- flow selection ------------------------------------------------------------------------------------

function flowHeader(file) {
  return readFileSync(file, 'utf8').split(/^---\s*$/m)[0];
}

function flowName(file) {
  return /^name:\s*'?(.*?)'?\s*$/m.exec(flowHeader(file))?.[1] ?? relative(ROOT, file);
}

function flowTestCases(file) {
  return /^\s+testCases:\s*'?(.*?)'?\s*$/m.exec(flowHeader(file))?.[1] ?? '';
}

function flowTags(file) {
  const block = /^tags:\s*\r?\n((?:[ \t]+-[ \t]*.+\r?\n?)+)/m.exec(flowHeader(file))?.[1] ?? '';
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*/, '').replace(/['"]/g, '').trim())
    .filter(Boolean);
}

function yamlFilesIn(dir, recursive) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return recursive ? yamlFilesIn(path, true) : [];
    return /\.ya?ml$/.test(name) ? [path] : [];
  });
}

/**
 * The flow files a run covers, as Maestro would pick them: one file; a folder's own flows; or, for the
 * workspace, everything under maestro/flows (config.yaml). Then include tags (any) and exclude tags (none).
 */
function selectFlows(target, include, exclude) {
  if (statSync(target).isFile()) return [target];
  const files = resolve(target) === resolve(WORKSPACE) ? yamlFilesIn(join(WORKSPACE, 'flows'), true) : yamlFilesIn(target, false);
  return files
    .filter((file) => {
      const tags = flowTags(file);
      if (include.length && !include.some((tag) => tags.includes(tag))) return false;
      return !exclude.some((tag) => tags.includes(tag));
    })
    .sort();
}

// ----- doctor -------------------------------------------------------------------------------------------

async function doctor() {
  const { config, envFile, unknown } = loadConfig(ROOT);
  let problems = 0;
  const row = (state, label, detail = '') => {
    if (state === 'FAIL') problems += 1;
    log(`  [${state.padEnd(4)}] ${label}${detail ? `: ${detail}` : ''}`);
  };

  log('\nTools');
  const node = Number(process.versions.node.split('.')[0]);
  row(node >= 20 ? 'OK' : 'FAIL', 'Node.js', `${process.versions.node}${node >= 20 ? '' : ' (need 20+)'}`);
  const java = javaVersion();
  row(java && java.major >= 17 ? 'OK' : 'FAIL', 'Java', java ? java.text : 'not found (need 17+, set JAVA_HOME)');
  const maestro = findMaestro(config);
  row(maestro ? 'OK' : 'FAIL', 'Maestro', maestro ? `${maestroVersion(maestro) ?? '?'} at ${maestro}` : 'not found, see docs/device-setup.md');
  const adb = findAdb(config);
  row(adb ? 'OK' : 'FAIL', 'adb', adb ?? 'not found, see docs/device-setup.md');

  log('\nDevice');
  if (adb) {
    const devices = listDevices(adb);
    if (!devices.length) row('FAIL', 'Connected devices', 'none: docs/device-setup.md#3-connect-the-phone-over-wi-fi');
    for (const d of devices) row(d.state === 'device' ? 'OK' : 'WARN', `adb device ${d.serial}`, `${d.state}${d.model ? `, ${d.model}` : ''}`);
    const { device, error } = resolveDevice(adb, config.DEVICE_ID);
    if (error) row('FAIL', 'Device under test', error);
    if (device) {
      const info = deviceInfo(adb, device.serial);
      row('OK', 'Device under test', `${info.brand} ${info.model}, Android ${info.android} (SDK ${info.sdk}), ${info.connection}`);
      const app = appInfo(adb, device.serial, config.APP_ID);
      row(
        app ? 'OK' : 'FAIL',
        `App ${config.APP_ID}`,
        app
          ? `${app.versionName} (build ${app.versionCode})${app.debuggable ? ', debug build: Metro must be running' : ''}, installed ${app.lastUpdateTime}`
          : 'not installed: docs/device-setup.md#4-install-the-app',
      );
    }
  }

  log('\nConfiguration');
  row(envFile ? 'OK' : 'WARN', '.env', envFile ? 'found' : 'missing: copy .env.example to .env (defaults are used meanwhile)');
  if (unknown.length) row('WARN', 'Unknown .env keys', unknown.join(', '));
  const caps = capabilities(config);
  row(caps.testEmail ? 'OK' : 'WARN', 'Email code tests (requires-test-email)', caps.testEmail ? config.TEST_USER_EMAIL : 'TEST_USER_EMAIL not set: skipped');
  row(caps.otpAdmin ? 'OK' : 'WARN', 'Email sign-in tests (requires-otp-admin)', caps.otpAdmin ? 'Supabase admin configured' : 'needs TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: skipped');
  if (caps.otpAdmin) {
    try {
      const response = await fetch(`${config.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/health`, {
        headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY },
      });
      row(response.ok ? 'OK' : 'FAIL', 'Supabase Auth reachable', `HTTP ${response.status}`);
    } catch (error) {
      row('FAIL', 'Supabase Auth reachable', error.message);
    }
  }
  row(
    config.GOOGLE_TEST_ACCOUNT ? 'OK' : 'WARN',
    'Google sign-in test (interactive)',
    config.GOOGLE_TEST_ACCOUNT ? 'GOOGLE_TEST_ACCOUNT set' : 'GOOGLE_TEST_ACCOUNT not set in .env: npm run test:google will stop',
  );
  row(syncTestData({ check: true }) ? 'OK' : 'WARN', 'maestro/config/test-data.js', syncTestData({ check: true }) ? 'in sync with test-data/' : 'stale: runs regenerate it; commit the result');

  log(problems ? `\n${problems} problem(s) to fix before running tests.` : '\nReady to run: npm run test:smoke');
  process.exit(problems ? 1 : 0);
}

// ----- test runs ----------------------------------------------------------------------------------------

async function runTests(kind, value, options) {
  // A new run makes the previous HTML report stale: remove it (`npm run report` builds a fresh one).
  rmSync(HTML_REPORT, { force: true });
  const { config } = loadConfig(ROOT);
  syncTestData();

  // What to run.
  let target = WORKSPACE;
  let include = [];
  let label = kind;
  let interactive = options.interactive;
  if (kind === 'suite') {
    const suite = SUITES[value];
    if (!suite) fail(`Unknown suite "${value}".`, `Suites: ${Object.keys(SUITES).join(', ')}`);
    include = suite.include;
    interactive = interactive || suite.interactive;
    label = value;
  } else if (kind === 'tag') {
    if (!value) fail('Which tag? e.g. `npm run test:tag -- heatmap`');
    include = value.split(',');
    // Asking for the interactive flows by name (or by a test-case ID) means you are ready to take part.
    interactive = interactive || include.some((tag) => tag === 'interactive' || tag === 'google' || /^TC-/.test(tag));
    label = `tag-${value.replace(/[^\w-]+/g, '_')}`;
  } else if (kind === 'flow') {
    if (!value) fail('Which flow? e.g. `npm run test:flow -- maestro/flows/smoke/SMK-01_guest_journey.yaml`');
    target = resolve(process.cwd(), value);
    if (!existsSync(target)) target = resolve(ROOT, value);
    if (!existsSync(target)) fail(`No such flow or folder: ${value}`);
    label = `flow-${value.split(/[\\/]/).pop().replace(/\.ya?ml$/, '')}`;
  }

  // What can't run with this configuration (an explicitly chosen flow file always runs and says what's
  // missing).
  const caps = capabilities(config);
  const exclude = [...options.excludeTags];
  const notRun = [];
  const singleFlow = kind === 'flow' && statSync(target).isFile();
  if (!singleFlow) {
    if (!interactive) {
      exclude.push('interactive');
      notRun.push('interactive flows (use npm run test:google or --interactive)');
    }
    if (!caps.otpAdmin) {
      exclude.push('requires-otp-admin');
      notRun.push('requires-otp-admin (needs TEST_USER_EMAIL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)');
    }
    if (!caps.testEmail) {
      exclude.push('requires-test-email');
      notRun.push('requires-test-email (needs TEST_USER_EMAIL)');
    }
  }
  const flows = selectFlows(target, include, exclude);
  if (!flows.length) fail(`No flow matches ${relative(ROOT, target) || '.'}${include.length ? ` with tags ${include.join(', ')}` : ''}.`);
  if (options.watch && flows.length !== 1) fail('--watch needs exactly one flow file.');
  if (options.list) {
    log(`${flows.length} flow(s):`);
    flows.forEach((file) => log(`  ${relative(ROOT, file)}  (${flowName(file)})`));
    if (notRun.length) log(`Not run: ${notRun.join('; ')}`);
    process.exit(0);
  }

  const maestro = requireMaestro(config);
  const { adb, serial } = requireDevice(config, options);
  const device = deviceInfo(adb, serial);
  const app = appInfo(adb, serial, config.APP_ID);
  if (!app) fail(`${config.APP_ID} is not installed on ${device.model} (${serial}).`, 'Install a build: docs/device-setup.md#4-install-the-app');

  // Where the results go.
  const id = `${timestamp()}_${label}`;
  const runDir = join(REPORTS, 'runs', id);
  const reportKind = options.html ? 'html' : 'junit';
  mkdirSync(join(runDir, 'logs'), { recursive: true });
  mkdirSync(join(runDir, reportKind), { recursive: true });
  const consoleLog = createWriteStream(join(runDir, 'logs', 'console.log'));
  const consoleLogLine = (line) => consoleLog.write(`${line}\n`);

  // The OTP broker keeps the Supabase key out of Maestro (see tools/lib/otp-broker.mjs).
  let broker = null;
  if (caps.otpAdmin) {
    broker = await startOtpBroker({
      supabaseUrl: config.SUPABASE_URL,
      serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
      allowedEmail: config.TEST_USER_EMAIL,
      log: consoleLogLine,
    });
  }

  const params = MAESTRO_PARAMS.filter((key) => config[key] !== undefined).map((key) => `${key}=${config[key]}`);
  if (broker) params.push(`OTP_BROKER_URL=${broker.url}`);
  params.push(...options.params);

  // Every flow gets its own Maestro session: on a phone over Wi-Fi a session's on-device driver doesn't
  // survive more than a few minutes (docs/troubleshooting.md), and separate sessions keep one broken flow
  // from breaking the next.
  const flowArgs = (file, slot, currentSerial) => [
    '--device', currentSerial,
    '--no-ansi',
    ...(options.debug ? ['--verbose'] : []),
    'test', file,
    ...(options.watch ? ['--continuous'] : []),
    '--format', options.html ? 'HTML-DETAILED' : 'JUNIT',
    '--output', join(runDir, reportKind, `${slot}.${options.html ? 'html' : 'xml'}`),
    '--test-output-dir', join(runDir, 'maestro', slot),
    '--debug-output', join(runDir, 'debug', slot),
    '--test-suite-name', `MobileAutomation ${label}`,
    ...params.flatMap((param) => ['-e', param]),
  ];
  const showCommand = (args) =>
    ['maestro', ...args.map((arg) => (arg.startsWith(ROOT) ? relative(ROOT, arg) || '.' : arg))]
      .join(' ')
      .split(broker?.token ?? '\u0000')
      .join('***');

  log(`\nRun ${id}`);
  log(`  device : ${device.brand} ${device.model}, Android ${device.android}, ${device.connection} (${serial})`);
  log(`  app    : ${app.appId} ${app.versionName} (build ${app.versionCode})`);
  log(`  flows  : ${flows.length} from ${relative(ROOT, target) || '.'}${include.length ? `, tags ${include.join(', ')}` : ''}`);
  if (notRun.length) log(`  not run: ${notRun.join('; ')}`);
  log(`  report : ${relative(ROOT, runDir)}\n`);

  const crashBefore = crashLog(adb, serial).split(/\r?\n/).length;
  const startedAt = new Date();
  const noise = /^(WARNING:|Picked up JAVA_TOOL_OPTIONS)|[║╔╚═╗╝╭╮╰╯│]|^\s*$/;
  // One flow: show Maestro's step-by-step output. A suite: one line per flow (everything is in console.log).
  const verbose = options.debug || flows.length === 1;

  /** One Maestro process; resolves with its exit code and the last lines it printed. */
  const attempt = (args) =>
    new Promise((done) => {
      consoleLogLine(`\n$ ${showCommand(args)}`);
      const tail = [];
      const child = start(maestro, args, { env: maestroEnv(SECRETS) });
      const forward = (stream, sink) => {
        let buffered = '';
        stream.on('data', (chunk) => {
          buffered += chunk.toString('utf8');
          const lines = buffered.split(/\r?\n/);
          buffered = lines.pop();
          for (const raw of lines) {
            const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
            consoleLogLine(line);
            if (!noise.test(line)) tail.push(line) > 20 && tail.shift();
            if (verbose && (options.debug || !noise.test(line))) sink.write(`${line}\n`);
          }
        });
      };
      forward(child.stdout, process.stdout);
      forward(child.stderr, process.stderr);
      const stop = () => child.kill('SIGINT');
      process.on('SIGINT', stop);
      child.on('close', (code) => {
        process.off('SIGINT', stop);
        done({ code: code ?? 1, tail });
      });
    });

  if (options.watch) {
    log('Watching: the flow re-runs when you save it. Ctrl+C to stop.');
    const { code } = await attempt(flowArgs(flows[0], 'watch', serial));
    if (broker) await broker.close();
    process.exit(code);
  }

  const attempts = [];
  // Maestro's JUnit result for the flow; without one (Maestro couldn't start), what it printed instead.
  const resultOf = (junitFile, { code, tail }) => {
    const first = junitFile ? [...parseJunit(junitFile).values()][0] : null;
    if (first) return first;
    if (code === 0) return { status: 'PASSED', failure: '' };
    return { status: 'FAILED', failure: `Maestro produced no result: ${tail.slice(-3).join(' ')}` };
  };
  const waitNotice = () => process.stdout.write('waiting for the phone to reconnect ... ');
  let currentSerial = serial;
  const planned = [];
  const width = String(flows.length).length;
  for (const [index, file] of flows.entries()) {
    const slot = String(index + 1).padStart(2, '0');
    const began = Date.now();
    if (!verbose) process.stdout.write(`  [${String(index + 1).padStart(width)}/${flows.length}] ${flowName(file)} ... `);
    currentSerial = ensureConnected(adb, currentSerial, { onWait: waitNotice }) ?? currentSerial;
    let outcome = await attempt(flowArgs(file, slot, currentSerial));
    attempts.push({ maestroDir: join(runDir, 'maestro', slot), junit: options.html ? null : join(runDir, 'junit', `${slot}.xml`) });
    let result = resultOf(attempts.at(-1).junit, outcome);

    // The phone dropped off (Wi-Fi debugging): reconnect and give this flow one more session.
    if (result.status === 'FAILED' && INFRA_FAILURE.test(result.failure)) {
      const again = ensureConnected(adb, currentSerial, { onWait: waitNotice });
      if (again) {
        currentSerial = again;
        if (verbose) log('\nThe device connection was lost: reconnected, running the flow once more.');
        else process.stdout.write('device connection lost, retrying ... ');
        outcome = await attempt(flowArgs(file, `${slot}-retry`, currentSerial));
        attempts.push({
          maestroDir: join(runDir, 'maestro', `${slot}-retry`),
          junit: options.html ? null : join(runDir, 'junit', `${slot}-retry.xml`),
        });
        result = resultOf(attempts.at(-1).junit, outcome);
      } else {
        process.stdout.write('phone unreachable ... ');
      }
    }
    planned.push({
      name: flowName(file),
      testCases: flowTestCases(file),
      file: relative(ROOT, file).split('\\').join('/'),
      tags: flowTags(file),
      failure: result.failure,
    });
    const verdict = `${result.status === 'PASSED' ? 'passed' : 'FAILED'} (${Math.round((Date.now() - began) / 1000)}s)`;
    log(verbose ? `\n${flowName(file)}: ${verdict}` : verdict);
  }
  const firstArgs = flowArgs('<flow>', 'NN', serial);
  const exitCode = undefined;
  consoleLog.end();
  if (broker) await broker.close();

  // Crashes during the run (Android keeps a separate crash buffer).
  const crashes = crashLog(adb, serial).split(/\r?\n/).slice(crashBefore).join('\n').trim();
  if (crashes) writeFileSync(join(runDir, 'logs', 'crash.txt'), crashes);

  // Errors that stop Maestro before or between flows (YAML that doesn't parse, driver problems).
  if (!consoleLog.closed) await new Promise((done) => consoleLog.on('close', done));
  const problems = readFileSync(join(runDir, 'logs', 'console.log'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => /Parsing Failed|Failed to parse|Exception|Unable to|not found on device|Error:/i.test(line))
    .filter((line) => !/^\s*at |WARNING/.test(line))
    .slice(0, 10);

  const finishedAt = new Date();
  const java = javaVersion();
  const run = writeRunReport(runDir, {
    id,
    suite: label,
    command: showCommand(firstArgs),
    exitCode,
    startedAt: startedAt.toString(),
    finishedAt: finishedAt.toString(),
    durationSec: Math.round((finishedAt - startedAt) / 1000),
    device,
    app,
    maestroVersion: maestroVersion(maestro),
    java: java?.major,
    node: process.versions.node,
    frameworkCommit: gitCommit(),
    config: describeConfig(config),
    notRun,
    planned,
    problems,
    crashesDuringRun: Boolean(crashes),
  }, attempts);
  // Secrets never reach Maestro; private values (test account addresses) are passed as parameters, so
  // Maestro's own files contain them: blank them out of this run's files.
  scrubSecrets(runDir, [config.SUPABASE_SERVICE_ROLE_KEY, broker?.token, ...PRIVATE.map((key) => config[key])]);

  log(`\n${run.status}: ${run.passed} passed, ${run.failed} failed${crashes ? ', app crash logged (logs/crash.txt)' : ''}`);
  for (const flow of run.flows.filter((f) => f.status === 'FAILED')) {
    log(`  x ${flow.name}\n      step    : ${flow.failure.step}\n      actual  : ${flow.failure.actual}`);
    if (flow.failure.screenshot) log(`      picture : ${relative(ROOT, join(runDir, flow.failure.screenshot))}`);
  }
  log(`\nSummary: ${relative(ROOT, join(runDir, 'summary.md'))}`);
  log('HTML report: npm run report');
  process.exit(run.status === 'PASSED' ? 0 : 1);
}

// ----- inspect, studio, report ----------------------------------------------------------------------------

const SYSTEM_IDS = /^(com\.android\.systemui|android:id\/(navigationBarBackground|statusBarBackground)|com\.google\.android\.inputmethod|com\.vivo\.|com\.miui\.|com\.samsung\.android\.(app\.)?(cocktailbarservice|honeyboard))/;

function inspect(options) {
  const { config } = loadConfig(ROOT);
  const maestro = requireMaestro(config);
  const { serial } = requireDevice(config, options);
  const result = capture(maestro, ['--device', serial, 'hierarchy'], { env: maestroEnv(SECRETS), timeout: 180_000 });
  const start = result.stdout.indexOf('{');
  if (!result.ok || start < 0) fail('Could not read the screen hierarchy.', result.stderr.split(/\r?\n/).slice(-3).join(' '));
  const tree = JSON.parse(result.stdout.slice(start));
  const dir = join(REPORTS, 'hierarchy');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${timestamp()}.json`);
  writeFileSync(file, JSON.stringify(tree, null, 2));

  const rows = [];
  const walk = (node) => {
    const a = node.attributes ?? {};
    const id = a['resource-id'] ?? '';
    const text = a.text ?? '';
    const label = a.accessibilityText ?? '';
    if ((id || text || label) && (options.all || !SYSTEM_IDS.test(id))) {
      const flags = [a.clickable === 'true' && 'tap', a.enabled === 'false' && 'DISABLED', a.checked === 'true' && 'checked', a.selected === 'true' && 'selected', a.focused === 'true' && 'focused'].filter(Boolean).join(',');
      rows.push({ id, text: text.replace(/\n/g, '\\n').slice(0, 40), label: label.slice(0, 45), flags, bounds: a.bounds ?? '' });
    }
    (node.children ?? []).forEach(walk);
  };
  walk(tree);
  const width = (key, max) => Math.min(max, Math.max(key.length, ...rows.map((r) => r[key].length)));
  const w = { id: width('id', 34), text: width('text', 40), label: width('label', 45), flags: width('flags', 24) };
  const line = (r) => `${r.id.padEnd(w.id)}  ${r.text.padEnd(w.text)}  ${r.label.padEnd(w.label)}  ${r.flags.padEnd(w.flags)}  ${r.bounds}`;
  log(line({ id: 'test ID (id:)', text: 'text', label: 'accessibility label', flags: 'state', bounds: 'bounds' }));
  rows.forEach((r) => log(line(r)));
  log(`\n${rows.length} elements. Full hierarchy: ${relative(ROOT, file)}`);
  log('Prefer test IDs; use text/accessibility labels (regexes) inside a screen with childOf when there is no ID.');
}

function studio(options) {
  const { config } = loadConfig(ROOT);
  const maestro = requireMaestro(config);
  const { serial } = requireDevice(config, options);
  log('Opening Maestro Studio (Ctrl+C to stop). Pass -e APP_ID=... in Studio flows, or type the app id.');
  const child = start(maestro, ['--device', serial, 'studio'], { env: maestroEnv(SECRETS), stdio: 'inherit' });
  child.on('close', (code) => process.exit(code ?? 0));
}

function openInBrowser(file) {
  const command = process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '""', file] : [file];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

/**
 * `report [run folder] [--text] [--no-open]`: re-analyses the latest (or given) run and writes the HTML report
 * to reports/report.html, then opens it. `--text` prints the markdown summary instead.
 */
function report(options) {
  const runsDir = join(REPORTS, 'runs');
  let runDir = options.positional[0] ? resolve(process.cwd(), options.positional[0]) : null;
  if (!runDir) {
    const runs = existsSync(runsDir)
      ? readdirSync(runsDir).filter((name) => existsSync(join(runsDir, name, 'run.json'))).sort()
      : [];
    if (!runs.length) fail('No runs yet in reports/runs: run some tests first (npm run test:smoke).');
    runDir = join(runsDir, runs[runs.length - 1]);
  }
  if (!existsSync(join(runDir, 'run.json'))) fail(`${relative(ROOT, runDir)} has no run.json.`);
  const run = rebuildRun(runDir);
  if (options.text) {
    log(readFileSync(join(runDir, 'summary.md'), 'utf8'));
    return;
  }
  const assetBase = `${relative(REPORTS, runDir).split('\\').join('/')}/`;
  writeFileSync(HTML_REPORT, renderHtmlReport(run, { assetBase }));
  log(`${run.status}: ${run.passed} passed, ${run.failed} failed (${run.id})`);
  log(`HTML report: ${relative(ROOT, HTML_REPORT)} (deleted when the next test run starts)`);
  if (!options.noOpen) openInBrowser(HTML_REPORT);
}

// ----- main ---------------------------------------------------------------------------------------------

const [command, ...rest] = process.argv.slice(2);
const options = parseArgs(rest);
switch (command) {
  case 'doctor':
    await doctor();
    break;
  case 'suite':
  case 'tag':
  case 'flow':
    await runTests(command, options.positional[0], options);
    break;
  case 'inspect':
    inspect(options);
    break;
  case 'studio':
    studio(options);
    break;
  case 'report':
    report(options);
    break;
  default:
    log(HELP);
    process.exit(command && command !== 'help' ? 2 : 0);
}
