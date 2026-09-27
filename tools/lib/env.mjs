// Run configuration: the gitignored .env file for local runs, the real environment for CI (it wins).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Passed to Maestro as `-e NAME=value`. Maestro writes these into its reports, so never put secrets here. */
export const MAESTRO_PARAMS = [
  'APP_ID',
  'TEST_USER_EMAIL',
  'GOOGLE_TEST_ACCOUNT',
  'GOOGLE_AUTO_PICK',
  'HUMAN_TIMEOUT_MS',
  'TIMEOUT_SCALE',
  'TODAY',
];

/** Stay inside this process: never passed to Maestro, printed, or left in a report. */
export const SECRETS = ['SUPABASE_SERVICE_ROLE_KEY'];

/** Runner-only settings. */
const RUNNER = ['DEVICE_ID', 'SUPABASE_URL', 'MAESTRO_BIN', 'ADB_BIN'];

export const KNOWN_KEYS = [...MAESTRO_PARAMS, ...RUNNER, ...SECRETS];

export const DEFAULTS = { APP_ID: 'com.faiz.streak' };

/** KEY=value lines; # comments; optional single or double quotes; `export KEY=value` allowed. */
export function parseDotEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2];
    const quoted = /^(['"])(.*)\1$/.exec(value);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

export function loadConfig(root) {
  const file = join(root, '.env');
  const fromFile = existsSync(file) ? parseDotEnv(readFileSync(file, 'utf8')) : {};
  const config = { ...DEFAULTS };
  for (const key of KNOWN_KEYS) {
    const value = process.env[key] ?? fromFile[key];
    if (value !== undefined && value !== '') config[key] = value;
  }
  const unknown = Object.keys(fromFile).filter((key) => !KNOWN_KEYS.includes(key));
  return { config, envFile: existsSync(file) ? file : null, unknown };
}

/** What each optional capability needs, for doctor and for deciding which flows can run. */
export function capabilities(config) {
  return {
    testEmail: Boolean(config.TEST_USER_EMAIL),
    otpAdmin: Boolean(config.TEST_USER_EMAIL && config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY),
  };
}

/** A config safe to print or store: secrets become "set" / "not set". */
export function describeConfig(config) {
  const shown = {};
  for (const key of KNOWN_KEYS) {
    if (SECRETS.includes(key)) shown[key] = config[key] ? 'set (hidden)' : 'not set';
    else if (config[key] !== undefined) shown[key] = config[key];
  }
  return shown;
}
