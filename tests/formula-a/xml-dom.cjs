// Small XML adapter for the worksheet APIs used by the browser exporter.
// ZIP packaging uses the repository's existing JSZip; assertions inspect the
// exported OOXML directly, including styles, cells and print settings.
const decode = s => s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, x) =>
  x[0] === '#' ? String.fromCodePoint(x[1].toLowerCase() === 'x' ? parseInt(x.slice(2), 16) : Number(x.slice(1))) :
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[x]);
const encode = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
class Element {
  constructor(name, attrs = {}) { this.name = name; this.attrs = attrs; this.nodes = []; }
  get localName() { return this.name.split(':').at(-1); }
  get children() { return this.nodes.filter(n => typeof n !== 'string'); }
  get firstChild() { return this.nodes[0] || null; }
  get textContent() { return this.nodes.map(n => typeof n === 'string' ? n : n.textContent).join(''); }
  set textContent(s) { this.nodes = [String(s)]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  setAttributeNS(ns, k, v) { this.setAttribute(k, v); }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(n) { this.nodes.push(n); return n; }
  insertBefore(node, reference) {
    if (!reference) return this.appendChild(node);
    const index = this.nodes.indexOf(reference);
    if (index < 0) throw new Error('Missing XML insertion reference');
    this.nodes.splice(index, 0, node); return node;
  }
  removeChild(n) { this.nodes.splice(this.nodes.indexOf(n), 1); }
  getElementsByTagNameNS(ns, tag) {
    return this.children.flatMap(c => [...(c.localName === tag ? [c] : []), ...c.getElementsByTagNameNS(ns, tag)]);
  }
  querySelector(selector) {
    const m = selector.match(/^(\w+)(?:\[(\w+)="([^"]*)"\])?$/);
    if (!m) throw new Error('Unsupported XML selector: ' + selector);
    return this.getElementsByTagNameNS('', m[1]).find(e => !m[2] || e.getAttribute(m[2]) === m[3]) || null;
  }
  createElementNS(ns, name) { return new Element(name, ns ? { xmlns: ns } : {}); }
}
class DOMParser {
  parseFromString(xml) {
    const doc = new Element('#document'); let current = doc; const stack = [];
    for (const token of xml.match(/<\?[^]*?\?>|<!--[^]*?-->|<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('<?') || token.startsWith('<!--')) continue;
      if (token.startsWith('</')) {
        if (current.name !== token.slice(2, -1).trim()) throw new Error('Unbalanced XML');
        current = stack.pop();
      } else if (token.startsWith('<')) {
        const name = token.match(/^<([^\s/>]+)/)[1];
        const attrs = Object.fromEntries([...token.matchAll(/([^\s=]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
        const node = current.appendChild(new Element(name, attrs));
        if (!token.endsWith('/>')) { stack.push(current); current = node; }
      } else current.nodes.push(decode(token));
    }
    if (stack.length) throw new Error('Unclosed XML');
    return doc;
  }
}
class XMLSerializer {
  serializeToString(node) {
    if (typeof node === 'string') return encode(node);
    const body = node.nodes.map(n => this.serializeToString(n)).join('');
    if (node.name === '#document') return body;
    const attrs = Object.entries(node.attrs).map(([k, v]) => ' ' + k + '="' + encode(v) + '"').join('');
    return '<' + node.name + attrs + '>' + body + '</' + node.name + '>';
  }
}
module.exports = { DOMParser, XMLSerializer };
