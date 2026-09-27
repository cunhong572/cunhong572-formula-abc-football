const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DOMParser, XMLSerializer } = require('./xml-dom.cjs');
const JSZip = require('../../public/jszip.min.js');
const ExcelJS = require('../../public/exceljs.min.js');
const root = path.resolve(__dirname, '../..');
const forbidden = () => { throw new Error('Network or external operation forbidden'); };
function api(file, names, bindings = {}) {
  const text = fs.readFileSync(path.join(root, file), 'utf8'), imports = {};
  for (const m of text.matchAll(/^import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["'];/gm)) {
    const entries = m[1].split(',').map(s => s.trim());
    const needed = entries.filter(n => !Object.hasOwn(bindings, n));
    if (!needed.length) continue;
    if (!m[2].startsWith('lib/formula-a/')) throw new Error('Unmocked import: ' + m[2]);
    Object.assign(imports, api(m[2], needed, bindings));
  }
  const source = text.replace(/^import[^\n]+\r?\n/gm, '').replace(/export default async function\(/, 'async function handler(').replace(/^export /gm, '');
  const context = vm.createContext({ console, fetch: forbidden, ...imports, ...bindings });
  vm.runInContext(source + '\n;globalThis.subject={' + names.join(',') + '};', context);
  return context.subject;
}
async function automatic(transform = value => value, transformCurrent = value => value) {
  const { current, team } = require('./fixtures.cjs');
  const calls = [];
  const match = transformCurrent(structuredClone(current));
  const { handler } = api('api/auto-fill.js', ['handler'], {
    requireAuth: async () => ({ role: 'viewer' }),
    resolveTeamPair: async () => ({ home: { id: 5, name: 'Team 5' }, away: { id: 6, name: 'Team 6' }, fixture: match }),
    trackedFetch: async url => {
      calls.push(url);
      const id = Number(new URL(url).searchParams.get('id'));
      return { ok: true, json: async () => url.includes('/teams?id=') ? transform(structuredClone(team(id))) : { teams: [] } };
    },
    Date: class extends Date { static now() { return Date.parse(match.status.utcTime) - 6 * 3600000; } },
  });
  let body, status = 200;
  await handler({ body: { home: 'Team 5', away: 'Team 6' } }, { status(n) { status = n; return this; }, json(value) { body = value; } });
  if (status !== 200) throw new Error(JSON.stringify(body));
  return { data: JSON.parse(JSON.stringify(body)), calls };
}
function frontend(data, templateB64) {
  const elements = new Map(); let blob;
  const element = () => ({ value: '', textContent: '', dataset: {}, appendChild() {}, setAttribute() {}, click() {}, remove() {} });
  const context = vm.createContext({ console, Blob, Uint8Array, JSZip, ExcelJS, DOMParser, XMLSerializer,
    fetch: forbidden, atob: s => Buffer.from(s, 'base64').toString('binary'),
    setTimeout() {}, URL: { createObjectURL(value) { blob = value; return 'blob:offline'; }, revokeObjectURL() {} },
    document: { getElementById(id) { if (id === 'formulaADownloadLink') return null;
      if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, createTextNode: s => s, body: { contains: () => true } },
  });
  context.window = context;
  const bundle = path.join(root, 'public/formula-a-modules.js');
  if (fs.existsSync(bundle)) vm.runInContext(fs.readFileSync(bundle, 'utf8'), context);
  let source = fs.readFileSync(path.join(root, 'public/app.js'), 'utf8').split('sides.forEach(s=>{rankRows(s);scheduleRows(s);formInputs(s)});')[0];
  if (templateB64) source = source.replace(/const FORMULA_A_TEMPLATE_B64 = "[^"]+";/, 'const FORMULA_A_TEMPLATE_B64 = ' + JSON.stringify(templateB64) + ';');
  vm.runInContext(source, context);
  context.__data = data;
  vm.runInContext('lastAutoData=__data;calculateAll=()=>{};', context);
  return { context, elements,
    call(expression) { return vm.runInContext(expression, context); },
    async exportWorkbook() {
      await vm.runInContext('exportExcel()', context);
      if (!blob) throw new Error(elements.get('status')?.textContent || 'No export');
      const bytes = Buffer.from(await blob.arrayBuffer());
      const zip = await JSZip.loadAsync(bytes);
      const sheet = new DOMParser().parseFromString(await zip.file('xl/worksheets/sheet1.xml').async('string'));
      const styles = new DOMParser().parseFromString(await zip.file('xl/styles.xml').async('string'));
      return { zip, sheet, styles };
    },
    async template() { return JSZip.loadAsync(Buffer.from(vm.runInContext('FORMULA_A_TEMPLATE_B64', context), 'base64')); },
  };
}
module.exports = { api, automatic, frontend };
