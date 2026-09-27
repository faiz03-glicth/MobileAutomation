// Finds and runs the external tools: Maestro, adb, Java.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';

function onPath(names) {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (dir && existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const firstExisting = (paths) => paths.find((path) => path && existsSync(path)) ?? null;

export function findMaestro(config) {
  const names = IS_WINDOWS ? ['maestro.bat', 'maestro.cmd'] : ['maestro'];
  const home = homedir();
  return firstExisting([
    config.MAESTRO_BIN,
    onPath(names),
    ...names.map((name) => join(home, 'maestro', 'bin', name)),
    ...names.map((name) => join(home, '.maestro', 'bin', name)),
  ]);
}

export function findAdb(config) {
  const exe = IS_WINDOWS ? 'adb.exe' : 'adb';
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    join(homedir(), 'Library', 'Android', 'sdk'),
    join(homedir(), 'Android', 'Sdk'),
  ].filter(Boolean);
  return firstExisting([config.ADB_BIN, onPath([exe]), ...sdkRoots.map((root) => join(root, 'platform-tools', exe))]);
}

/** cmd.exe quoting, for .bat files (which Node can only start through a shell on Windows). */
function quoteForCmd(arg) {
  return /[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg;
}

function needsShell(command) {
  return IS_WINDOWS && /\.(bat|cmd)$/i.test(command);
}

/** Runs a tool to completion and returns its output (never throws for a non-zero exit). */
export function capture(command, args, { env, timeout = 60_000 } = {}) {
  const options = { env, timeout, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };
  const result = needsShell(command)
    ? spawnSync([quoteForCmd(command), ...args.map(quoteForCmd)].join(' '), { ...options, shell: true })
    : spawnSync(command, args, options);
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error,
  };
}

/** Starts a long-running tool with piped output. */
export function start(command, args, { env, stdio = ['inherit', 'pipe', 'pipe'] } = {}) {
  if (needsShell(command)) {
    return spawn([quoteForCmd(command), ...args.map(quoteForCmd)].join(' '), { shell: true, env, stdio });
  }
  return spawn(command, args, { env, stdio });
}

/** The environment Maestro runs with: quiet, UTF-8, and without any secret the runner holds. */
export function maestroEnv(secrets = []) {
  const env = {
    ...process.env,
    MAESTRO_CLI_NO_ANALYTICS: 'true',
    MAESTRO_DISABLE_UPDATE_CHECK: 'true',
    MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true',
    JAVA_TOOL_OPTIONS: [process.env.JAVA_TOOL_OPTIONS, '-Dstdout.encoding=UTF-8', '-Dfile.encoding=UTF-8']
      .filter(Boolean)
      .join(' '),
  };
  for (const key of secrets) delete env[key];
  return env;
}

export function javaVersion() {
  const java = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', IS_WINDOWS ? 'java.exe' : 'java') : 'java';
  const result = capture(java, ['-version']);
  const match = /version "(\d+)(?:\.(\d+))?/.exec(result.stderr + result.stdout);
  if (!match) return null;
  const major = Number(match[1]) === 1 ? Number(match[2]) : Number(match[1]);
  return { major, text: (result.stderr || result.stdout).split(/\r?\n/)[0] };
}

export function maestroVersion(maestro) {
  const result = capture(maestro, ['--version'], { env: maestroEnv() });
  const lines = result.stdout.split(/\r?\n/).map((line) => line.trim());
  return lines.reverse().find((line) => /^\d+\.\d+\.\d+/.test(line)) ?? null;
}
