// Finds where in the YAML a failed Maestro step was written: file, line, and the chain of runFlow calls that
// led there (like a stack trace). Maestro's commands.json has no line numbers, so this walks two trees side by
// side: the steps Maestro logged (in start order, with their nesting depth) and the commands in the YAML
// files (parsed by indentation, which is enough for flows written the way this repository writes them).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

/** Steps Maestro adds on its own (a subflow's env and config); they have no line in the YAML. */
const SYNTHETIC = new Set(['defineVariablesCommand', 'applyConfigurationCommand']);

const indentOf = (line) => line.length - line.trimStart().length;
const meaningful = (line) => line.trim() !== '' && !line.trim().startsWith('#');

/**
 * YAML list items between lines [from, to) whose dash sits at `indent`: [{ line, end, text, file, children }].
 * `line`/`end` are 0-based; `file` is set for runFlow/runScript with a path; `children` holds inline
 * `commands:` (runFlow, repeat, retry).
 */
function parseItems(lines, from, to, indent) {
  const items = [];
  for (let i = from; i < to; i += 1) {
    const line = lines[i];
    if (!meaningful(line)) continue;
    const lineIndent = indentOf(line);
    if (lineIndent < indent) break;
    if (lineIndent !== indent || !line.trimStart().startsWith('- ')) continue;
    let end = i;
    for (let j = i + 1; j < to; j += 1) {
      if (!meaningful(lines[j])) continue;
      const nextIndent = indentOf(lines[j]);
      if (nextIndent < indent || (nextIndent === indent && lines[j].trimStart().startsWith('- '))) break;
      end = j;
    }
    items.push(describeItem(lines, i, end));
    i = end;
  }
  return items;
}

function describeItem(lines, start, end) {
  const text = lines[start].trim().slice(2);
  const item = { line: start, end, text, file: null, children: null };
  const inline = /^(runFlow|runScript):\s*(\S+\.(?:ya?ml|js))\s*$/.exec(text);
  if (inline) item.file = inline[2];
  for (let i = start + 1; i <= end; i += 1) {
    const inner = lines[i];
    if (!item.file && !item.children) {
      const file = /^\s*file:\s*(\S+\.(?:ya?ml|js))\s*$/.exec(inner);
      if (file) item.file = file[1];
    }
    if (!item.children && /^\s*commands:\s*$/.test(inner)) {
      const first = lines.slice(i + 1, end + 1).find(meaningful);
      if (first) item.children = parseItems(lines, i + 1, end + 1, indentOf(first));
    }
  }
  return item;
}

const cache = new Map();

/** A flow file's commands: the onFlowStart hook's, then the body's (the order Maestro runs them). */
function parseFlowFile(path) {
  if (cache.has(path)) return cache.get(path);
  let parsed = { path, lines: [], hooks: [], body: [] };
  if (existsSync(path)) {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    const separator = lines.findIndex((line) => /^---\s*$/.test(line));
    const bodyStart = separator >= 0 ? separator + 1 : 0;
    const hookLine = lines.findIndex((line, i) => i < bodyStart && /^onFlowStart:\s*$/.test(line));
    let hooks = [];
    if (hookLine >= 0) {
      const first = lines.slice(hookLine + 1, bodyStart).find(meaningful);
      if (first) hooks = parseItems(lines, hookLine + 1, Math.max(bodyStart - 1, hookLine + 1), indentOf(first));
    }
    parsed = { path, lines, hooks, body: parseItems(lines, bodyStart, lines.length, 0) };
  }
  cache.set(path, parsed);
  return parsed;
}

const commandType = (entry) => Object.keys(entry.command ?? {})[0] ?? '';

/**
 * Maps every logged step to the YAML command it came from.
 * Returns Map(entry index → { path, item }).
 */
function mapEntries(entries, flowPath) {
  const located = new Map();
  const steps = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !SYNTHETIC.has(commandType(entry)));

  // Children of each step: the following steps one level deeper, up to the next step at its level or above.
  const walk = (from, depth, candidates, path) => {
    let position = 0;
    let i = from;
    while (i < steps.length) {
      const { entry, index } = steps[i];
      const stepDepth = entry.metadata?.depth ?? 0;
      if (stepDepth < depth) return i;
      if (stepDepth > depth) {
        i += 1;
        continue;
      }
      const item = candidates.length ? candidates[position % candidates.length] : null;
      position += 1;
      if (item) located.set(index, { path, item });
      // Descend: a subflow file, or inline commands (runFlow commands:, repeat, retry).
      let childItems = [];
      let childPath = path;
      if (item?.file && /\.ya?ml$/.test(item.file)) {
        childPath = resolve(dirname(path), item.file);
        childItems = parseFlowFile(childPath).body;
      } else if (item?.children) {
        childItems = item.children;
      }
      i = walk(i + 1, stepDepth + 1, childItems, childPath);
    }
    return i;
  };

  const flow = parseFlowFile(flowPath);
  walk(0, 0, [...flow.hooks, ...flow.body], flowPath);
  return located;
}

/**
 * Where a failed step was written. `failedIndex` is its index in commands.json; `root` makes paths relative.
 * Returns { file, line (1-based), chain: [{ file, line, text }], snippet: { start, lines, from, to } } or null.
 */
export function locateFailure(entries, failedIndex, flowFile, root) {
  if (!flowFile || failedIndex < 0) return null;
  const flowPath = resolve(root, flowFile);
  if (!existsSync(flowPath)) return null;
  const located = mapEntries(entries, flowPath);

  // The chain: the failed step and every step it was nested in, outermost first.
  const chainIndexes = [failedIndex];
  let depth = entries[failedIndex]?.metadata?.depth ?? 0;
  for (let i = failedIndex - 1; i >= 0 && depth > 0; i -= 1) {
    const entry = entries[i];
    if (SYNTHETIC.has(commandType(entry))) continue;
    if ((entry.metadata?.depth ?? 0) === depth - 1) {
      chainIndexes.unshift(i);
      depth -= 1;
    }
  }
  const chain = chainIndexes
    .map((index) => located.get(index))
    .filter(Boolean)
    .map(({ path, item }) => ({
      file: relative(root, path).split('\\').join('/'),
      line: item.line + 1,
      text: item.text,
    }));
  const leaf = located.get(failedIndex) ?? located.get(chainIndexes.findLast((index) => located.has(index)));
  if (!leaf) return chain.length ? { file: chain.at(-1).file, line: chain.at(-1).line, chain, snippet: null } : null;

  const { lines } = parseFlowFile(leaf.path);
  const start = Math.max(0, leaf.item.line - 4);
  const stop = Math.min(lines.length - 1, leaf.item.end + 3);
  return {
    file: relative(root, leaf.path).split('\\').join('/'),
    line: leaf.item.line + 1,
    chain,
    snippet: {
      start: start + 1,
      lines: lines.slice(start, stop + 1),
      from: leaf.item.line + 1,
      to: leaf.item.end + 1,
    },
  };
}
