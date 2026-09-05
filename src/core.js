/* CourseZip Check 0.1.0 — owned by Jarrett. Packaging checks only. */
const CourseZip = (() => {
  'use strict';
  const VERSION = '0.1.0';
  const LIMITS = Object.freeze({ archive: 2 * 1024 * 1024 * 1024, entries: 10000,
    directory: 4 * 1024 * 1024, manifest: 2 * 1024 * 1024, nodes: 30000, findings: 300 });
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const fail = (message) => { throw new Error(message); };
  const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const view = bytes => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  async function bytesAt(blob, start, length) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 0 || start + length > blob.size)
      fail('Truncated ZIP: a declared record extends beyond the file.');
    return new Uint8Array(await blob.slice(start, start + length).arrayBuffer());
  }
  function zipName(bytes, flags) {
    if (!(flags & 0x800) && bytes.some(b => b > 127))
      fail('A ZIP filename uses an unsupported legacy encoding. Re-export with UTF-8 filenames.');
    const name = utf8.decode(bytes);
    if (!name || /[\\\x00-\x1f\x7f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name) ||
        name.split('/').some(p => p === '..' || p === '.') || name.includes('//'))
      fail('An unsafe or ambiguous ZIP path was found. Re-export the package; no files were extracted.');
    return name;
  }
  async function readDirectory(blob) {
    if (blob.size > LIMITS.archive) fail('This edition accepts ZIPs up to 2 GiB.');
    if (blob.size < 22) fail('This file is too short to be a ZIP archive.');
    const tailStart = Math.max(0, blob.size - 65557);
    const tail = await bytesAt(blob, tailStart, blob.size - tailStart), t = view(tail);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (t.getUint32(i, true) === 0x06054b50 && i + 22 + t.getUint16(i + 20, true) === tail.length) { end = i; break; }
    }
    if (end < 0) fail('The ZIP end record is missing or damaged.');
    const count = t.getUint16(end + 10, true), size = t.getUint32(end + 12, true), offset = t.getUint32(end + 16, true);
    if (t.getUint16(end + 4, true) || t.getUint16(end + 6, true) || t.getUint16(end + 8, true) !== count)
      fail('Split or multi-disk ZIPs are unsupported.');
    if (count === 65535 || size === 0xffffffff || offset === 0xffffffff) fail('ZIP64 archives are unsupported.');
    if (count > LIMITS.entries || size > LIMITS.directory) fail('The ZIP exceeds the 10,000-entry or 4 MiB directory limit.');
    if (offset + size !== tailStart + end) fail('The ZIP directory layout is unsupported or damaged.');
    const bytes = await bytesAt(blob, offset, size), d = view(bytes), entries = new Map(), folded = new Map();
    let p = 0;
    for (let i = 0; i < count; i++) {
      if (p + 46 > size || d.getUint32(p, true) !== 0x02014b50) fail('A ZIP directory record is damaged.');
      const flags = d.getUint16(p + 8, true), method = d.getUint16(p + 10, true);
      const packed = d.getUint32(p + 20, true), unpacked = d.getUint32(p + 24, true);
      const nl = d.getUint16(p + 28, true), el = d.getUint16(p + 30, true), cl = d.getUint16(p + 32, true);
      const local = d.getUint32(p + 42, true);
      if (p + 46 + nl + el + cl > size) fail('A ZIP filename or extra field is truncated.');
      if (d.getUint16(p + 34, true)) fail('Multi-disk entries are unsupported.');
      if ([packed, unpacked, local].includes(0xffffffff)) fail('ZIP64 entries are unsupported.');
      if (flags & (1 | 64 | 8192)) fail('Encrypted ZIP entries are unsupported.');
      if (method !== 0 && method !== 8) fail('Only stored and deflated ZIP entries are supported.');
      if (((d.getUint32(p + 38, true) >>> 16) & 0xf000) === 0xa000) fail('Symbolic links are unsupported.');
      if (local + 30 + packed > offset) fail('A ZIP entry overlaps the directory or is truncated.');
      const nameBytes = bytes.slice(p + 46, p + 46 + nl), name = zipName(nameBytes, flags);
      if (entries.has(name)) fail('Duplicate ZIP filenames make this package ambiguous.');
      const item = { name, nameBytes, flags, method, packed, unpacked, local, crc: d.getUint32(p + 16, true) };
      entries.set(name, item);
      const lower = name.toLowerCase();
      if (!folded.has(lower)) folded.set(lower, []);
      folded.get(lower).push(name);
      p += 46 + nl + el + cl;
    }
    if (p !== size) fail('Unexpected data remains in the ZIP directory.');
    return { entries, folded, offset };
  }
  async function readManifest(blob, item, directoryOffset) {
    if (item.unpacked > LIMITS.manifest || item.packed > LIMITS.manifest)
      fail('The manifest exceeds this edition’s 2 MiB limit.');
    const h = view(await bytesAt(blob, item.local, 30));
    if (h.getUint32(0, true) !== 0x04034b50 || h.getUint16(6, true) !== item.flags || h.getUint16(8, true) !== item.method)
      fail('The manifest’s local ZIP header does not match the directory.');
    const n = h.getUint16(26, true), extra = h.getUint16(28, true);
    const localName = await bytesAt(blob, item.local + 30, n);
    if (n !== item.nameBytes.length || localName.some((b, i) => b !== item.nameBytes[i])) fail('The manifest has conflicting ZIP filenames.');
    if (!(item.flags & 8) && (h.getUint32(14, true) !== item.crc || h.getUint32(18, true) !== item.packed || h.getUint32(22, true) !== item.unpacked))
      fail('The manifest’s local sizes or checksum do not match the directory.');
    const start = item.local + 30 + n + extra;
    if (start + item.packed > directoryOffset) fail('The manifest overlaps the ZIP directory.');
    let result;
    if (item.method === 0) {
      result = await bytesAt(blob, start, item.packed);
    } else {
      let decoder;
      try { decoder = new DecompressionStream('deflate-raw'); }
      catch { fail('This browser lacks raw ZIP decompression. Use a current Chrome, Edge, or Firefox browser.'); }
      const reader = blob.slice(start, start + item.packed).stream().pipeThrough(decoder).getReader();
      const chunks = []; let total = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.length;
          if (total > LIMITS.manifest || total > item.unpacked) {
            await reader.cancel(); fail('Manifest inflation exceeded its declared size or the 2 MiB safety limit.');
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      result = new Uint8Array(total); let at = 0;
      for (const chunk of chunks) { result.set(chunk, at); at += chunk.length; }
    }
    if (result.length !== item.unpacked || crc32(result) !== item.crc) fail('The manifest failed its ZIP size or checksum check.');
    let encoding = 'utf-8';
    if ((result[0] === 255 && result[1] === 254) || (result[0] === 60 && result[1] === 0)) encoding = 'utf-16le';
    if ((result[0] === 254 && result[1] === 255) || (result[0] === 0 && result[1] === 60)) encoding = 'utf-16be';
    const xml = new TextDecoder(encoding, { fatal: true }).decode(result);
    const declaration = xml.match(/^\s*<\?xml\s[^?]*encoding\s*=\s*['"]([^'"]+)/i);
    if (declaration && !/^utf-(8|16|16le|16be)$/i.test(declaration[1])) fail('Only UTF-8 and UTF-16 XML manifests are supported.');
    return xml;
  }
  function resolveReference(node, href) {
    const bases = []; let parent = node;
    while (parent && parent.nodeType === 1) {
      const base = parent.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'base');
      if (base) bases.unshift(base);
      parent = parent.parentNode;
    }
    let base = new URL('https://coursezip.invalid/'), external = false;
    for (const raw of [...bases, href]) {
      if (/[\\\x00-\x20\x7f]/.test(raw.replace(/ /g, '')) || /%(?:2f|5c)/i.test(raw)) fail('Backslashes, encoded separators, or control characters are unsupported in a reference.');
      const path = raw.split(/[?#]/, 1)[0];
      let decoded;
      try { decoded = decodeURIComponent(path); } catch { fail('A reference has invalid percent encoding.'); }
      if (/[\x00-\x1f\x7f]/.test(decoded)) fail('A reference contains an encoded control character.');
      const explicitScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw), networkPath = raw.startsWith('//');
      if (raw !== raw.trim()) fail('A reference has ambiguous leading or trailing whitespace.');
      if (explicitScheme || networkPath) external = true;
      if (raw.startsWith('/') && !networkPath && base.origin === 'https://coursezip.invalid') fail('A root-relative reference depends on the LMS server. Export a package-relative path.');
      if (!explicitScheme && !networkPath && base.origin === 'https://coursezip.invalid') {
        const parts = decodeURIComponent(base.pathname).split('/').slice(1, -1);
        for (const part of decoded.split('/')) {
          if (part === '..') { if (!parts.length) fail('A reference escapes the package root.'); parts.pop(); }
          else if (part && part !== '.') parts.push(part);
        }
      }
      const next = new URL(raw, base);
      if (!['http:', 'https:'].includes(next.protocol)) fail('A reference uses an unsupported URL scheme.');
      base = next;
    }
    if (external || base.origin !== 'https://coursezip.invalid') return { external: true };
    return { path: decodeURIComponent(base.pathname.slice(1)) };
  }
  async function inspect(blob, name = blob.name || 'course.zip', parseXML) {
    const report = { version: VERSION, name, bytes: blob.size, checkedAt: new Date().toISOString(),
      status: 'incomplete', entries: 0, references: 0, scormVersion: 'Not established', findings: [], suppressedFindings: 0,
      scope: 'ZIP directory, root manifest, manifest integrity/XML and declared resource/file references. No course execution, schema certification, full archive integrity, or LMS compatibility test.' };
    let errorCount = 0, warningCount = 0;
    const add = (severity, code, message, path = '') => {
      if (severity === 'error') errorCount++; else if (severity === 'warning') warningCount++;
      if (report.findings.length < LIMITS.findings) report.findings.push({ severity, code, message, path });
      else report.suppressedFindings++;
    };
    try {
      const dir = await readDirectory(blob); report.entries = dir.entries.size;
      for (const names of dir.folded.values()) if (names.length > 1)
        add('warning', 'case-collision', 'These names differ only by letter case; extraction behavior can vary.', names.join(' | '));
      let manifest = dir.entries.get('imsmanifest.xml');
      if (!manifest) {
        const candidates = [...dir.entries.keys()].filter(n => /(^|\/)imsmanifest\.xml$/i.test(n));
        add('error', 'root-manifest', candidates.length ? 'imsmanifest.xml must be named exactly this way at the ZIP root. Re-export, or re-zip the contents of the enclosing folder.' : 'No imsmanifest.xml was found. Check that this is a SCORM export.', candidates.slice(0, 10).join(' | '));
        report.status = 'issues'; report.errorCount = errorCount; report.warningCount = warningCount; return report;
      }
      const xml = await readManifest(blob, manifest, dir.offset);
      if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(xml)) fail('Manifests with DTDs or entity declarations are not processed. Re-export without these declarations.');
      const doc = parseXML ? parseXML(xml) : new DOMParser().parseFromString(xml, 'application/xml');
      if (!doc.documentElement || doc.getElementsByTagNameNS('*', 'parsererror').length || doc.documentElement.localName === 'parsererror')
        fail('The manifest is not well-formed XML. Re-export or correct it in the authoring source.');
      const root = doc.documentElement;
      if (root.localName !== 'manifest') fail('The XML root is not a manifest element.');
      const all = Array.from(doc.getElementsByTagName('*'));
      if (all.length > LIMITS.nodes) fail('The manifest exceeds the 30,000-element limit.');
      const ns = root.namespaceURI;
      const relevant = all.filter(n => n.namespaceURI === ns);
      if (relevant.some(n => n !== root && n.localName === 'manifest'))
        fail('Sub-manifests are outside this edition’s scope. Use an LMS test environment for this package.');
      if (!['http://www.imsproject.org/xsd/imscp_rootv1p1p2', 'http://www.imsglobal.org/xsd/imscp_v1p1'].includes(ns))
        add('warning', 'namespace', 'The manifest namespace is absent or unrecognized. No schema validation is performed.');
      const schema = relevant.find(n => n.localName === 'schemaversion');
      if (schema) report.scormVersion = schema.textContent.trim().slice(0, 100);
      const resources = relevant.filter(n => n.localName === 'resource' && n.parentNode?.localName === 'resources');
      const resourceSet = new Set(resources);
      const ids = new Set(); let launchCount = 0;
      for (const resource of resources) {
        const id = resource.getAttribute('identifier');
        if (!id) add('error', 'resource-id', 'A resource is missing its identifier.');
        else if (ids.has(id)) add('error', 'duplicate-resource', 'Resource identifiers must be unique.', id);
        ids.add(id);
        if (resource.getAttribute('href')) launchCount++;
      }
      for (const node of relevant) {
        if (node.localName === 'item' && node.getAttribute('identifierref') && !ids.has(node.getAttribute('identifierref')))
          add('error', 'unknown-resource', 'An organization item refers to a missing resource identifier.', node.getAttribute('identifierref'));
        if (node.localName === 'dependency' && !ids.has(node.getAttribute('identifierref')))
          add('error', 'unknown-dependency', 'A dependency refers to a missing resource identifier.', node.getAttribute('identifierref') || '(empty)');
        const isResource = resourceSet.has(node);
        const isFile = node.localName === 'file' && resourceSet.has(node.parentNode);
        if (!isResource && !isFile) continue;
        const href = node.getAttribute('href');
        if (!href) { if (isFile) add('error', 'empty-reference', 'A file element is missing its href.'); continue; }
        report.references++;
        try {
          const resolved = resolveReference(node, href);
          if (resolved.external) add('warning', 'external-reference', 'External reference: existence and availability were not checked.', href);
          else if (!dir.entries.has(resolved.path) || resolved.path.endsWith('/')) {
            const similar = dir.folded.get(resolved.path.toLowerCase());
            if (similar) add('error', 'case-mismatch', 'Letter case does not match the ZIP path: ' + similar.join(' | '), resolved.path);
            else add('error', 'missing-file', 'This declared file is absent from the ZIP directory.', resolved.path);
          }
        } catch (error) { add('error', 'invalid-reference', error.message, href); }
      }
      if (!launchCount) add('warning', 'no-launch', 'No resource launch href was found. Launch behavior has not been established.');
      report.status = errorCount ? 'issues' : warningCount ? 'review' : 'clear';
    } catch (error) {
      add('error', 'incomplete', 'Check stopped: ' + (error.message || 'Unsupported or damaged package.'));
      report.status = 'incomplete';
    }
    report.errorCount = errorCount; report.warningCount = warningCount;
    return report;
  }
  return Object.freeze({ VERSION, LIMITS, inspect, crc32 });
})();
