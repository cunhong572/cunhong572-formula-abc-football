const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

// Execute the actual checked-in module in a fresh isolated context. Only import
// wiring/export syntax changes in memory; production files are never rewritten.
function load(relative, names, bindings = {}) {
  // The original odds suite isolates external coordination/navigation just as
  // it isolates browser.session and db. Worker tests exercise the real adapters.
  bindings = {
    withWorkerLease: async (options, run) => run(async () => {}),
    switchAndWait: async (page, open) => Boolean(await open()),
    ...bindings,
  };
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const imports = {};
  for (const match of source.matchAll(/^import \{([^}]+)\} from ["']([^"']+)["'];/gm)) {
    if (match[2] === 'hatchable') continue;
    const entries = match[1].split(',').map(s => s.trim().split(/\s+as\s+/));
    const needed = entries.filter(([, alias], i) => !Object.hasOwn(bindings, alias || entries[i][0]));
    if (!needed.length) continue;
    const resolved = match[2].startsWith('.') ? path.join(path.dirname(relative), match[2]) : match[2];
    const dependency = load(resolved, needed.map(([name]) => name), bindings).subject;
    for (const [name, alias] of needed) imports[alias || name] = dependency[name];
  }
  const code = source.replace(/^import .*;\r?\n/gm, '')
    .replace(/export default async function\(/, 'async function handler(')
    .replace(/^export /gm, '');
  const forbidden = () => { throw new Error('Unmocked external operation forbidden'); };
  const context = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    fetch: forbidden, setTimeout: forbidden,
    db: { query: forbidden }, scheduler: { at: forbidden },
    browser: { session: forbidden }, storage: new Proxy({}, { get: () => forbidden }),
    ...imports, ...bindings,
  });
  vm.runInContext(code + '\n;globalThis.subject = {' + names.join(',') + '};', context,
    { filename: relative, timeout: 2000 });
  return { subject: context.subject, context,
    stub(name, value) { context.__replacement = value; vm.runInContext(name + ' = __replacement;', context); },
  };
}

// Minimal deterministic DOM for the fixed fixtures, not a browser emulator.
// Only tag/class selectors used by extract() are supported; unsupported syntax
// throws, so a future parser change cannot silently pass through the fake DOM.
class Element {
  constructor(tag, attrs, parent, document) {
    Object.assign(this, { tag, attrs, parentElement: parent, ownerDocument: document, children: [], chunks: [] });
  }
  get textContent() { return this.chunks.map(x => typeof x === 'string' ? x : x.textContent).join(' '); }
  get innerText() { return this.textContent; }
  contains(node) { return node === this || this.children.some(c => c.contains(node)); }
  getBoundingClientRect() {
    const values = (this.attrs['data-rect'] || this.parentElement?.attrs['data-rect'] || '0,0,10,10').split(',').map(Number);
    const [left, top, width, height] = values;
    return { left, top, width, height, right: left + width, bottom: top + height };
  }
  querySelectorAll(selector) {
    const parts = selector.split(',').map(s => {
      const m = s.trim().match(/^([a-z]+)?(?:\.([\w-]+))?$/i);
      if (!m || (!m[1] && !m[2])) throw new Error('Unsupported fixture selector: ' + s);
      return m;
    });
    const found = [];
    const visit = e => { for (const child of e.children) {
      if (parts.some(m => (!m[1] || child.tag === m[1]) && (!m[2] || (child.attrs.class || '').split(' ').includes(m[2])))) found.push(child);
      visit(child);
    } };
    visit(this); return found;
  }
}
function fixture(name) {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', name + '.html'), 'utf8');
  const document = { defaultView: { getComputedStyle(e) {
    return { display: 'block', visibility: 'visible', backgroundColor: e.attrs['data-bg'] || 'transparent' };
  } } };
  const root = new Element('document', {}, null, document);
  let current = root;
  for (const token of html.match(/<!--[^]*?-->|<[^>]+>|[^<]+/g) || []) {
    if (token.startsWith('<!--')) continue;
    if (token.startsWith('</')) { current = current.parentElement; continue; }
    if (token.startsWith('<')) {
      const tag = token.match(/^<([a-z]+)/i)?.[1];
      if (!tag) throw new Error('Invalid fixture HTML');
      const attrs = Object.fromEntries([...token.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
      const e = new Element(tag, attrs, current, document);
      current.children.push(e); current.chunks.push(e); current = e;
      if (tag === 'body') document.body = e;
    } else current.chunks.push(token);
  }
  if (current !== root || !document.body) throw new Error('Unbalanced fixture HTML');
  document.querySelectorAll = selector => root.querySelectorAll(selector);
  return document;
}
function parser(name) {
  const document = fixture(name);
  const module = load('lib/formula-e-cloud.js', ['extract'], { window: { document } });
  // Model the browser boundary: serialized callbacks lose module closures.
  return targets => module.subject.extract({ evaluate: (fn, args) =>
    vm.runInNewContext('(' + fn.toString() + ')(__args)',
      { window: { document }, __args: args }, { timeout: 2000 }) }, targets);
}
function clock(ms) { return class extends Date { constructor(...args) { super(...(args.length ? args : [ms])); } static now() { return ms; } }; }
module.exports = { load, parser, clock };
