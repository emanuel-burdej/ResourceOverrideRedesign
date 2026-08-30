# Rules Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save complete, import-compatible rules JSON instead of `{}`.

**Architecture:** Keep data collection in `exportData`, correct its envelope to match `importData`, and expose an awaited JSON serializer used by the download handler.

**Tech Stack:** JavaScript ES modules, Chrome Extension Manifest V3, Node.js test scripts

## Global Constraints

- Keep export format version 2.
- Keep the existing download filename and import behavior.

---

### Task 1: Correct and await rules export

**Files:**
- Modify: `test/importExportTest.js`
- Modify: `src/importExport.js`
- Modify: `src/options.js`

**Interfaces:**
- Produces: `exportDataJson(): Promise<string>`

- [ ] Add a failing test for non-empty, versioned, import-compatible JSON.
- [ ] Run `node test/importExportTest.js` and confirm the expected failure.
- [ ] Change the export envelope from `ruleGroups` to `data`.
- [ ] Add `exportDataJson` and await it in the Save Rules handler.
- [ ] Run both JavaScript test scripts and check lint diagnostics.
