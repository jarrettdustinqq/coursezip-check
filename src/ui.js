/* UI */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = { clear: 'No issues found', review: 'Needs review', issues: 'Issues found', incomplete: 'Check incomplete' };
  let reports = [], busy = false;
  function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
  function element(tag, text, cls) {
    const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (cls) el.className = cls; return el;
  }
  function render() {
    $('results').hidden = !reports.length;
    $('metrics').replaceChildren();
    for (const key of ['clear', 'review', 'issues', 'incomplete']) {
      const metric = element('div', undefined, 'metric'); metric.append(element('strong', reports.filter(r => r.status === key).length), element('span', labels[key])); $('metrics').append(metric);
    }
    $('cards').replaceChildren();
    for (const r of reports) {
      const card = element('details', undefined, 'result'); card.open = r.status !== 'clear';
      const summary = element('summary'), info = element('span');
      info.append(element('span', r.name, 'filename'), element('span', `${(r.bytes / 1048576).toFixed(2)} MiB · ${r.entries} entries · ${r.references} declared references · Version: ${r.scormVersion}`, 'meta'));
      summary.append(info, element('span', labels[r.status], `badge ${r.status}`)); card.append(summary);
      for (const f of r.findings) {
        const row = element('div', undefined, `finding ${f.severity}`);
        row.append(element('strong', f.code.replaceAll('-', ' ')), element('span', f.message));
        if (f.path) row.append(element('code', f.path, 'path')); card.append(row);
      }
      if (!r.findings.length) card.append(element('p', 'No packaging issues were found within this checker’s scope.', 'finding'));
      if (r.suppressedFindings) card.append(element('p', `${r.suppressedFindings} additional findings were omitted by the display limit.`, 'finding'));
      $('cards').append(card);
    }
    
  }
  async function check(files) {
    if (busy || !files.length) return;
    notice('');
    if (files.length > 1) { notice('Choose one package at a time. Nothing was checked.'); return; }
    if (files.reduce((n, f) => n + f.size, 0) > 10 * 1024 * 1048576) { notice('This batch exceeds 10 GiB. Choose a smaller batch. Nothing was checked.'); return; }
    busy = true; reports = []; render();
    for (const id of ['choose', 'sample', 'clear', 'files']) $(id).disabled = true;
    try {
      for (const [i, file] of files.entries()) {
        $('status').textContent = `Checking ${i + 1} of ${files.length}: ${file.name}`;
        await new Promise(resolve => setTimeout(resolve, 0));
        reports.push(await CourseZip.inspect(file)); render();
      }
      $('status').textContent = `Finished checking ${files.length} ${files.length === 1 ? 'package' : 'packages'}. Review the results before your LMS test.`;
    } catch (error) {
      notice('The batch stopped unexpectedly. Completed results remain available. Reload this file to retry a smaller batch.');
      $('status').textContent = 'Batch stopped; inspect completed results.';
    } finally {
      busy = false;
      for (const id of ['choose', 'sample', 'clear', 'files']) $(id).disabled = false;
      $('files').value = ''; render();
    }
  }
  $('choose').addEventListener('click', () => $('files').click());
  $('files').addEventListener('change', event => check(Array.from(event.target.files)));
  $('drop').addEventListener('dragover', event => { event.preventDefault(); if (!busy) $('drop').classList.add('over'); });
  $('drop').addEventListener('dragleave', () => $('drop').classList.remove('over'));
  $('drop').addEventListener('drop', event => { event.preventDefault(); $('drop').classList.remove('over'); check(Array.from(event.dataTransfer.files)); });
  $('clear').addEventListener('click', () => { if (busy) return; reports = []; render(); notice(''); $('status').textContent = 'Batch cleared. Choose ZIP files to start again.'; });
  $('sample').addEventListener('click', () => {
    const samples = __SAMPLES__;
    check(samples.slice(0, 1).map(s => new File([Uint8Array.from(atob(s.data), c => c.charCodeAt(0))], s.name, { type: 'application/zip' })));
  });
})();
