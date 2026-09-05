import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { DOMParser } from '@xmldom/xmldom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const artifact = path.join(root, 'CourseZip-Check-Free.html');
const html = fs.readFileSync(artifact, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ TextDecoder, Uint8Array, Uint32Array, DataView, Blob, DecompressionStream, URL,
  // All network APIs are absent. The actual delivered engine is evaluated here.
  DOMParser: class { parseFromString(xml, type) {
    return new DOMParser({ onError: (level, message) => { throw new Error('XML parse error: ' + message); } }).parseFromString(xml, type);
  } }
});
vm.runInContext(script.split('/* UI */')[0] + '\n globalThis.api = CourseZip;', context);
const cases = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/cases.json'), 'utf8'));
for (const item of cases) test(item.file, async () => {
  const blob = new Blob([fs.readFileSync(path.join(root, 'fixtures', item.file))]);
  const report = await context.api.inspect(blob, item.file);
  assert.equal(report.status, item.status, JSON.stringify(report.findings));
  if (item.code) assert.ok(report.findings.some(f => f.code === item.code), JSON.stringify(report));
  assert.equal(report.errorCount, report.findings.filter(f => f.severity === 'error').length + (item.file === 'many-findings.zip' ? 100 : 0));
});
test('same HTML script compiles and is bound to its CSP hash', () => {
  new vm.Script(script);
  const hash = 'sha256-' + createHash('sha256').update(script).digest('base64');
  assert.ok(html.includes(`script-src '${hash}'`));
  assert.match(html, /connect-src 'none'/);
  assert.ok(!html.includes('__SAMPLES__'));
  assert.ok(!/<(?:script|link|img|iframe)[^>]+(?:src|href)=/i.test(html));
});
test('archive size gate runs before reading content', async () => {
  const report = await context.api.inspect({size:2 * 1024 * 1048576 + 1, slice(){throw new Error('must not read');}}, 'huge.zip');
  assert.equal(report.status, 'incomplete');
  assert.match(report.findings[0].message, /2 GiB/);
});
test('empty data is rejected', async () => {
  assert.equal((await context.api.inspect(new Blob([]), 'empty.zip')).status, 'incomplete');
});
test('known CRC32 vector', () => assert.equal(context.api.crc32(new TextEncoder().encode('123456789')), 0xcbf43926));
test('untrusted package content cannot call network APIs in the offline engine test', async () => {
  assert.equal(vm.runInContext('typeof fetch', context), 'undefined');
  assert.equal(vm.runInContext('typeof XMLHttpRequest', context), 'undefined');
  const r = await context.api.inspect(new Blob([fs.readFileSync(path.join(root, 'fixtures/external-url.zip'))]), 'external.zip');
  assert.equal(r.status, 'review');
});
test('large disk-backed ZIP reads metadata without loading its payload', async () => {
  const file = await fs.openAsBlob(path.join(root, 'fixtures/large-sparse.zip'));
  assert.ok(file.size > 1024 * 1048576);
  let bytesRead = 0;
  const metered = {size:file.size, slice(start, end) { bytesRead += end - start; return file.slice(start, end); }};
  const r = await context.api.inspect(metered, 'large-sparse.zip');
  assert.equal(r.status, 'clear', JSON.stringify(r.findings));
  assert.ok(bytesRead < 70000, `Read ${bytesRead} bytes`);
});
