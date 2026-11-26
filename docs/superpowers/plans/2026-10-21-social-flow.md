# Social Flow Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement inline. Steps use checkbox syntax.

**Goal:** Deliver a loadable Chrome/Edge extension matching the final user correction: no automatic pause on tab switching or input.
**Architecture:** Pure JS MV3; isolated content script runs scroll/like, service worker stores tab snapshots, popup controls the session.
**Tech Stack:** JavaScript, Chrome Extensions APIs, Node test runner, Playwright for local fixtures.
**Spec:** ../specs/2026-10-21-social-flow-design.md

## Global Constraints
- User stops the run explicitly; like cap does not stop scrolling.
- Defaults: 3 seconds, 450 px, every 10 eligible posts, 5 attempts maximum.
- activeTab, scripting, storage only; no remote code or external data transmission.
- Facebook desktop English/Vietnamese auto-like; generic websites scroll only.

## Review Focus
- Stale page snapshot must not overwrite a newly loaded document (worker tests).
- Comment likes must never be clicked (DOM fixtures).
- Failure to confirm a like must not lead to retry or exceed attempt cap (core/content tests).
- Stop during an outstanding timer must not allow another click (content tests).
- Background/focus/input changes must not pause the session (content tests).

### Task 1: Session policy
Files: extension/core.js, tests/core.test.cjs.
Interface: SocialFlowCore.normalizeConfig(input), Session(config, snapshot), consider(key), attempted(key), confirmed(key), snapshot().
- [x] Write tests: every third eligible unique post triggers candidate; duplicates do not advance; attempts capped at 2; confirmed count cannot exceed attempts; invalid numbers rejected/clamped; restored counters dedupe.
- [x] Run node --test tests/core.test.cjs; observe missing API fail.
- [x] Implement core and run tests green.

### Task 2: Facebook adapter and content loop
Files: extension/facebook.js, extension/content.js, tests/browser.test.cjs.
Interface: SocialFlowFacebook.collect(document), isFacebook(hostname); content commands SF_START, SF_STOP, SF_STATUS; worker messages SF_HELLO, SF_SAVE.
- [x] Write local Chromium tests for all Review Focus content cases and generic scrolling.
- [ ] Run Chromium fixtures: blocked by unavailable browser; VM fallback checks documented below.
- [x] Implement conservative adapter, loop and stop panel; run tests green.

### Task 3: Browser wiring, UI and delivery
Files: extension/manifest.json, extension/background.js, extension/popup.html, extension/popup.css, extension/popup.js, README.md, tests/worker.test.cjs.
Interface: popup SF_CONTROL/SF_INSPECT, worker SF_HELLO/SF_SAVE and per-tab snapshots with document ownership.
- [x] Write worker lifecycle tests, then run red.
- [x] Implement worker and popup; verify logic suite. Browser suite and popup screenshot remain unverified.
- [x] Independent review, address material findings, run full suite, package ZIP and persist deliverable.

## Delivery ledger
- User reiterated no automatic pause; this supersedes the original blur/input pause proposal.
- 21 logic tests passed. Browser tests, popup screenshot and live Facebook checks remain unverified because Chromium was unavailable; see TEST-REPORT.md. Browser verification checkbox above records the attempted check, not a passing browser result.
- Independent review found two important wrong-target risks; both received failing regression tests and fixes, then a green full logic suite.
- No external deployment, account login or live Like actions performed.
