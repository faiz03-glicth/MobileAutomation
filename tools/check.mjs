#!/usr/bin/env node
// Static checks that need no device: run before committing and in CI.
//   - maestro/config/test-data.js matches test-data/*.json
//   - every runFlow / runScript path points at a file that exists
//   - every test flow has a name Maestro can use as a folder name, tags, and the bootstrap hook
//   - traceability: test-case IDs used by flows exist in test-cases/, and each automated case has a flow
//   - nothing that looks like a key or token is committed under maestro/ or test-data/
//   - with --maestro: `maestro check-syntax` on every YAML file (slower: one JVM start per file)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { capture, findMaestro, maestroEnv } from './lib/binaries.mjs';
import { loadConfig } from './lib/env.mjs';
import { syncTestData } from './sync-test-data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const rel = (path) => relative(ROOT, path).replace(/\\/g, '/');

function files(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

// 1. Generated test data.
if (!syncTestData({ check: true })) errors.push('maestro/config/test-data.js is stale: run `npm run sync:test-data`.');

// 2. Paths.
const yamlFiles = files(join(ROOT, 'maestro'), /\.ya?ml$/);
const reference = /^\s*(?:-\s*)?(?:runFlow|runScript|file):\s*([^\s#'"$]+\.(?:ya?ml|js))\s*$/;
for (const file of yamlFiles) {
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .forEach((line, index) => {
      const match = reference.exec(line);
      if (match && !existsSync(resolve(dirname(file), match[1]))) {
        errors.push(`${rel(file)}:${index + 1} points at a missing file: ${match[1]}`);
      }
    });
}

// 3. Test flows.
const flowFiles = files(join(ROOT, 'maestro', 'flows'), /\.ya?ml$/);
const usedCases = new Map();
for (const file of flowFiles) {
  const text = readFileSync(file, 'utf8');
  const header = text.split(/^---\s*$/m)[0];
  const name = /^name:\s*'?(.*?)'?\s*$/m.exec(header)?.[1];
  if (!name) errors.push(`${rel(file)} has no name:`);
  else if (/[<>:"/\\|?*]/.test(name)) errors.push(`${rel(file)}: name "${name}" has a character Windows can't use in a folder name (<>:"/\\|?*)`);
  if (!/^tags:/m.test(header)) errors.push(`${rel(file)} has no tags:`);
  if (!/onFlowStart:[\s\S]*bootstrap\.yaml/.test(header)) errors.push(`${rel(file)} doesn't run components/common/bootstrap.yaml in onFlowStart`);
  if (!/^appId: \$\{APP_ID\}/m.test(header)) errors.push(`${rel(file)} must use "appId: \${APP_ID}" (set in one place)`);
  for (const id of header.match(/TC-[A-Z]+-\d{3}/g) ?? []) {
    if (!usedCases.has(id)) usedCases.set(id, []);
    usedCases.get(id).push(rel(file));
  }
}

// 4. Traceability.
const caseFiles = files(join(ROOT, 'test-cases'), /\.md$/);
const defined = new Map();
for (const file of caseFiles) {
  // Headings inside ``` blocks are examples, not test cases.
  const text = readFileSync(file, 'utf8').replace(/^```[\s\S]*?^```/gm, '');
  for (const match of text.matchAll(/^#{2,4}\s+(TC-[A-Z]+-\d{3})\b[^\n]*\n([\s\S]*?)(?=^#{2,4}\s+TC-|$(?![\s\S]))/gm)) {
    defined.set(match[1], { file: rel(file), automated: /\*\*Automation:\*\*\s*automated/i.test(match[2]) });
  }
}
for (const [id, where] of usedCases) {
  if (!defined.has(id)) errors.push(`${id} is used by ${where.join(', ')} but not defined in test-cases/`);
}
for (const [id, info] of defined) {
  if (info.automated && !usedCases.has(id)) errors.push(`${id} (${info.file}) says automated, but no flow is tagged with it`);
}

// 5. Secrets.
const secretLike = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})|(sb_secret_[A-Za-z0-9_-]{10,})|(service_role"?\s*[:=]\s*"?[A-Za-z0-9._-]{20,})/;
for (const file of [...files(join(ROOT, 'maestro'), /\.(ya?ml|js)$/), ...files(join(ROOT, 'test-data'), /\.json$/)]) {
  if (secretLike.test(readFileSync(file, 'utf8'))) errors.push(`${rel(file)} contains something that looks like a key or token`);
}

// 5b. Private email addresses (test accounts belong in .env). Placeholders and git remotes are fine.
const allowedEmail = /^git@|@(example\.(com|test)|yourdomain\.test|users\.noreply\.github\.com)$/i;
const committable = files(ROOT, /\.(md|json|js|mjs|ya?ml|example|txt)$|^\.env\.example$/).filter(
  (file) => !/[\\/](\.git|node_modules|reports)[\\/]/.test(file) && !/[\\/]\.env$/.test(file),
);
for (const file of committable) {
  for (const email of readFileSync(file, 'utf8').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []) {
    if (!allowedEmail.test(email)) errors.push(`${rel(file)} contains the email address ${email}: keep real addresses in .env`);
  }
}

// 6. Optional: Maestro's own syntax check.
if (process.argv.includes('--maestro')) {
  const maestro = findMaestro(loadConfig(ROOT).config);
  if (!maestro) warnings.push('Maestro not found: skipped check-syntax');
  else {
    // config.yaml is workspace configuration, not a flow.
    for (const file of yamlFiles.filter((path) => rel(path) !== 'maestro/config.yaml')) {
      const result = capture(maestro, ['--no-ansi', 'check-syntax', file], { env: maestroEnv(), timeout: 120_000 });
      const output = (result.stdout + result.stderr).replace(/\x1b\[[0-9;]*m/g, '');
      if (!result.ok || /Failed to parse|Invalid Command|Parsing Failed/.test(output)) {
        const reason = output
          .split(/\r?\n/)
          .filter((line) => line.trim() && !/^WARNING|JAVA_TOOL|^OK$/.test(line))
          .join(' ');
        errors.push(`${rel(file)}: ${reason || 'syntax error'}`);
      }
    }
  }
}

console.log(`Checked ${yamlFiles.length} Maestro files (${flowFiles.length} test flows) and ${defined.size} test cases.`);
warnings.forEach((warning) => console.log(`WARN  ${warning}`));
errors.forEach((error) => console.log(`FAIL  ${error}`));
if (errors.length) process.exit(1);
console.log('All checks passed.');
