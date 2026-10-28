/**
 * Stops a build when the code carries the marks of the October 2026 injection
 * (or anything shaped like it): editor tasks that run on opening the folder,
 * loose `init`/`.env` files, "font" payloads, npm install hooks, and code that
 * downloads text and runs it.
 *
 * Plain Node with no packages, so it runs BEFORE `npm ci` (which would run an
 * injected install hook). Run: node scripts/guard.js
 */
const { execFileSync } = require('child_process');
const fs = require('fs');

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
const bad = (f, why) => problems.push(`${f}: ${why}`);

// files that should never be in this repo
for (const f of files) {
  if (/^\.vscode\//.test(f)) bad(f, 'editor settings/tasks folder (can run code when the folder is opened)');
  if (/(^|\/)init$/.test(f)) bad(f, 'extensionless "init" script');
  if (/(^|\/)\.env(\..*)?$/.test(f) && !/\.example$/.test(f)) bad(f, '.env file committed');
  if (/\.(orc|sco|csd)$/i.test(f)) bad(f, 'Csound-type file (used to hide a payload)');
  if (/(^|\/)fa-(brands?|regular|solid)-\d+\./.test(f)) bad(f, 'Font Awesome files where the app has none (used as a disguise)');
  if (/\.(bat|cmd|ps1|vbs)$/i.test(f)) bad(f, 'Windows script');
}

// npm runs these automatically on install; this app needs none of them
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
for (const hook of ['preinstall', 'install', 'postinstall', 'prepare', 'prepublish', 'preprepare', 'postprepare']) {
  if (pkg.scripts?.[hook]) bad('package.json', `"${hook}" script runs on every install`);
}
for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
  if (/\bnode\s+init\b|curl|wget|base64|\beval\b/.test(cmd)) bad('package.json', `script "${name}" looks injected: ${cmd}`);
}

// .env must stay ignored
const ignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
if (!/^\.env\b/m.test(ignore)) bad('.gitignore', '.env is no longer ignored');

// code that fetches text and runs it, or decodes a hidden address from the environment
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const PATTERNS = [
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\s*\(/, 'new Function('],
  [/atob\s*\(\s*process\.env/, 'decodes an address hidden in the environment'],
  [/import\s+['"]dotenv\/config['"]/, 'loads .env at start-up (the app reads keys from Settings, not .env)'],
  [/createRequire\s*\(\s*import\.meta\.url\s*\)/, 'builds a require() at run time'],
];
for (const f of files) {
  if (!CODE.test(f) || f === 'scripts/guard.js' || !fs.existsSync(f)) continue;
  const text = fs.readFileSync(f, 'utf8');
  for (const [re, why] of PATTERNS) if (re.test(text)) bad(f, why);
  // one enormous line in source is how payloads are usually packed
  if (text.split('\n').some((l) => l.length > 5000) && !/\.min\.js$/.test(f)) bad(f, 'a line over 5,000 characters');
}

// workflows: nothing piped into a shell, no secrets sent to other hosts
for (const f of files.filter((x) => /^\.github\/workflows\/.*\.ya?ml$/.test(x))) {
  const text = fs.readFileSync(f, 'utf8');
  if (/(curl|wget)[^\n|]*\|\s*(ba)?sh\b/.test(text)) bad(f, 'downloads a script and runs it');
  for (const m of text.matchAll(/(curl|wget)[^\n]*\$\{\{\s*secrets\.[^\n]*/g)) {
    if (!/api\.github\.com|github\.com\/|generativelanguage\.googleapis\.com|api\.telegram\.org|ntfy\.sh/.test(m[0])) bad(f, `sends a secret somewhere unexpected: ${m[0].slice(0, 120)}`);
  }
}

if (problems.length) {
  console.error('Guard: this code looks tampered with. Nothing was built.\n');
  for (const p of problems) console.error(' - ' + p);
  console.error('\nIf a change is genuine, adjust scripts/guard.js in the same commit.');
  process.exit(1);
}
console.log(`Guard: ${files.length} files checked, nothing suspicious`);
