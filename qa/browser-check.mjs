import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifact = path.join(root, 'CourseZip-Check-Free.html');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'fixtures/cases.json')));
const labels = { clear: 'No issues found', review: 'Needs review', issues: 'Issues found', incomplete: 'Check incomplete' };
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ offline: true, serviceWorkers: 'block', viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const requests = [], errors = [], results = [];
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
page.on('pageerror', error => errors.push(error.message));
const record = (name, detail) => { results.push({ name, detail }); console.log(`PASS ${name}: ${detail}`); };

try {
  await page.goto(pathToFileURL(artifact).href);
  assert.equal(await page.evaluate(() => navigator.onLine), false);
  record('offline startup', 'Delivered file opened in Chromium with offline browser context and its normal CSP.');

  for (const item of cases) {
    await page.locator('#files').setInputFiles(path.join(root, 'fixtures', item.file));
    await page.waitForFunction(({ name, status }) => {
      const card = document.querySelector('#cards .result');
      return card?.querySelector('.filename')?.textContent === name && card.querySelector('.badge')?.textContent === status && !document.querySelector('#files').disabled;
    }, { name: item.file, status: labels[item.status] });
    assert.equal(await page.locator('#cards .result').count(), 1);
    if (item.code) assert.ok((await page.locator('#cards').textContent()).includes(item.code.replaceAll('-', ' ')));
    record(item.file, `Native browser XML/decompression and file-input UI produced ${item.status}.`);
  }

  await page.locator('#clear').click();
  assert.equal(await page.locator('#results').isVisible(), false);
  await page.locator('#sample').click();
  await page.waitForFunction(() => document.querySelector('#cards .badge')?.textContent === 'No issues found' && !document.querySelector('#files').disabled);
  record('clear and sample', 'Cleared prior results and ran the embedded sample through the actual button.');

  // Use the chooser event, not only direct input assignment, to verify the Choose button.
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#choose').click();
  await (await chooserPromise).setFiles(path.join(root, 'fixtures/good-deflated.zip'));
  await page.waitForFunction(() => document.querySelector('#cards .filename')?.textContent === 'good-deflated.zip' && !document.querySelector('#files').disabled);
  record('file chooser', 'Choose button opened the chooser and accepted a compressed fixture.');

  // Validate large-file handling without reading a GiB into either Node or page memory.
  await page.locator('#files').setInputFiles(path.join(root, 'fixtures/large-sparse.zip'));
  await page.waitForFunction(() => document.querySelector('#cards .filename')?.textContent === 'large-sparse.zip' && document.querySelector('#cards .badge')?.textContent === 'No issues found' && !document.querySelector('#files').disabled);
  record('large sparse ZIP', 'A genuine >1 GiB sparse archive passed through the file-input browser path.');

  const dropped = fs.readFileSync(path.join(root, 'fixtures/missing-file.zip'));
  const dataTransfer = await page.evaluateHandle(bytes => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(bytes)], 'dropped-missing-file.zip', { type: 'application/zip' }));
    return transfer;
  }, [...dropped]);
  await page.locator('#drop').dispatchEvent('drop', { dataTransfer });
  await page.waitForFunction(() => document.querySelector('#cards .filename')?.textContent === 'dropped-missing-file.zip' && document.querySelector('#cards .badge')?.textContent === 'Issues found' && !document.querySelector('#files').disabled);
  await dataTransfer.dispose();
  record('drag and drop', 'A synthetic dropped ZIP reached the same checker and displayed its missing-file issue.');

  const pair = ['good-stored.zip', 'good-deflated.zip'].map(name => ({ name, bytes: [...fs.readFileSync(path.join(root, 'fixtures', name))] }));
  const multiTransfer = await page.evaluateHandle(files => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: 'application/zip' }));
    return transfer;
  }, pair);
  await page.locator('#drop').dispatchEvent('drop', { dataTransfer: multiTransfer });
  await multiTransfer.dispose();
  assert.match(await page.locator('#notice').textContent(), /one package/i);
  await page.locator('#files').setInputFiles(path.join(root, 'fixtures/good-stored.zip'));
  await page.waitForFunction(() => document.querySelector('#cards .filename')?.textContent === 'good-stored.zip' && document.querySelector('#cards .badge')?.textContent === 'No issues found' && !document.querySelector('#files').disabled);
  record('recovery after rejected batch', 'Free-edition multi-file notice did not prevent a subsequent valid check.');

  assert.deepEqual(errors, []);
  assert.deepEqual(requests, []);
  record('runtime and network', 'No uncaught page errors or HTTP(S) requests observed during these checks.');

  const digest = createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
  const summary = ['# Offline browser validation', '', `Artifact SHA-256: \`${digest}\``, '', `${results.length} checks passed in Chromium ${browser.version()}.`, '', 'The actual delivered HTML ran from file:// with browser networking disabled, native DOMParser, normal CSP and no account credentials.', '', '| Check | Result |', '| --- | --- |', ...results.map(r => `| ${r.name.replaceAll('|', '/')} | ${r.detail.replaceAll('|', '/')} |`), '', 'Scope: free-preview Chromium behavior on these synthetic fixtures. Not other browsers, the private paid edition, customer exports, checkout, demand, SCORM certification or LMS runtime compatibility.'];
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
  console.log(`Completed ${results.length} offline browser checks. Artifact SHA-256 ${digest}`);
} finally {
  await context.close();
  await browser.close();
}
