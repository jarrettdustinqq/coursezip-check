# CourseZip Check

**Free, offline SCORM packaging preflight. Preview 0.1.0.**

[Download the single-file checker](https://github.com/jarrettdustinqq/coursezip-check/releases/download/v0.1.0-preview/CourseZip-Check-Free.html), then open the saved HTML file in a current browser. Select a course ZIP or try the synthetic sample. No server, installation, account, telemetry, or course upload is required. Original ZIPs are never changed.

This preview is for e-learning developers and LMS administrators checking incoming course packages. A root manifest inside an extra folder, a missing declared launch file, or a letter-case mismatch can break imports. The checker inspects those packaging details before an LMS test.

## Status and limits

Automated engine checks cover 41 synthetic packages plus safety and distribution checks. The free preview passed 48 offline Chromium checks on a GitHub-hosted Ubuntu runner, including file selection, drag/drop, recovery and a >1 GiB sparse archive. Other browsers, operating systems and real customer exports remain unverified; this is not a release approval gate. Native raw DEFLATE support is required; unsupported browsers receive an error. The code does not execute course scripts.

It checks ZIP directory structure, exact `imsmanifest.xml` placement, manifest checksum/XML, declared resource/file paths, case differences, XML base paths, and resource identifiers. “No issues found” applies only to these checks. It does not certify SCORM conformance, validate schemas, test LMS launch/tracking, verify every file’s checksum, scan malware, or inspect dynamically loaded assets. Free LMS testing tools such as [SCORM Cloud](https://rusticisoftware.com/products/scorm-cloud/) remain useful for runtime testing.

Limits: one ZIP at a time, 2 GiB per ZIP, 10,000 directory entries, 4 MiB directory, 2 MiB manifest, 30,000 XML elements, 300 displayed findings. ZIP64, encryption, split archives, symlinks, non-ASCII legacy filename encodings, DTDs and sub-manifests are unsupported. A stopped check is an incomplete result, not a package failure certification.

## Batch edition being evaluated

A separate batch edition is being evaluated at **$19 once** for teams processing up to 20 ZIPs per batch and exporting readable HTML, JSON, and CSV reports. **It is not currently for sale; checkout is not enabled.**

[Register nonbinding interest](https://github.com/jarrettdustinqq/coursezip-check/issues/new?template=batch-interest.yml) if this would help your work. Interest is not a purchase or a payment obligation. Feedback issues are public: do not upload courses or confidential reports. No support response time or future feature delivery is promised for this preview.

## Run the checks

With Python 3 and Node 24 or newer:

```sh
python3 tests/make_fixtures.py
python3 build.py
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

The XML adapter is a development-only dependency; the distributed HTML uses browser-native XML and decompression. Tests evaluate the engine extracted from the distributed HTML in a context with network APIs absent. A separate hosted Chromium job exercises the actual file-input UI with networking disabled; its artifact hash matches the public release. See [the verified run](https://github.com/jarrettdustinqq/coursezip-check/actions/runs/33990190580) for the exact scope.

## Privacy

The checker contains no remote scripts or analytics and blocks network connections with a Content Security Policy. ZIP entries are inspected as data and never rendered as HTML. Findings remain in memory until the file is closed. The GitHub interest/bug links open public forms only when clicked; they do not include course details automatically.

## License

MIT. Copyright 2026 Jarrett Robertson. The free preview can be used and modified under the included license. The separate batch edition is not included in this repository.

## Inspect or stop the preview checks

The GitHub Actions workflow checks the free artifact and records release-download and public-interest counters at 09:23 UTC daily, and on changes/manual requests. It does not access payments, send outreach, change releases, or repair software automatically. Download counts include automated verification and are not buyer counts. GitHub may delay schedules or disable schedules after prolonged repository inactivity.

Inspect runs in this repository’s **Actions** tab. Disable **Preview checks and interest snapshot** to stop it; re-enable and run it manually to resume. A transient failure can be retried with a manual run. The failure-probe option deliberately fails one run without changing the product. Review commercial evidence after 14 days; no traffic is inconclusive, and nonbinding interest is weaker evidence than a purchase.

The interest snapshot reads all available issue pages, excludes owner/recognized bot submissions from external counts, and deduplicates accounts. Distinct accounts still need manual qualification: they are not necessarily independent people, prospective customers, or buyers. Issue bodies are not copied into workflow summaries. Nine synthetic regression tests cover these counting rules; they do not validate demand.
