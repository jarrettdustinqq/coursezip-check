# Remote offline-browser validation

The `Offline browser validation` job in `check.yml` runs alongside the existing engine/delivery checks on a separate standard GitHub-hosted Ubuntu runner. It uses only this public free-preview source and synthetic ZIPs. No customer files, login state, paid-edition source or external service credentials are needed.

The browser job installs pinned Playwright 1.63.0 in this isolated directory and uses Chromium with browser networking disabled. It opens the actual built HTML through `file://`, exercises its file-input UI against the fixture cases with native XML parsing/decompression, and checks sample/clear buttons, the file chooser, a >1 GiB sparse archive, drag-and-drop and recovery after a rejected multi-file drop. Results and the artifact hash appear in the job log and GitHub job summary; no paid artifact upload or dependency cache is configured.

This verifies the free preview on the tested Chromium version. It does not establish other-browser behavior, paid-edition behavior, customer-export coverage, checkout, revenue, SCORM certification or LMS runtime compatibility.

Use Actions -> Preview checks and interest snapshot -> Run workflow to rerun. The existing daily schedule also runs it. Inspect each named job separately; an intentional `failure_probe` failure belongs to the existing check job, not this browser job. Disable the workflow in Actions to stop the complete scheduled check pipeline. To remove only browser QA, revert its job and `qa/` additions in a reviewed commit.

For a suitable development machine: generate fixtures/build using the repository instructions, run `npm install --prefix qa --ignore-scripts --no-audit --no-fund --package-lock=false`, install Chromium with `./qa/node_modules/.bin/playwright install --with-deps chromium`, then run `node qa/browser-check.mjs`. On a resource-constrained laptop, use the remote workflow instead of installing browsers locally.
