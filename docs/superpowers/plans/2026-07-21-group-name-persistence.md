# Group Name Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist an entered group name across extension refreshes.

**Architecture:** Correct the group serializer so its output uses the same `name` property consumed by rendering and import/export. Cover the serializer directly with a dependency-free regression test.

**Tech Stack:** JavaScript ES modules, Chrome Extension Manifest V3, Node.js test scripts

## Global Constraints

- Do not migrate or fall back to legacy `matchUrl` values.
- Keep the current debounced save behavior and UI unchanged.

---

### Task 1: Correct group-name serialization

**Files:**
- Create: `test/importExportTest.js`
- Modify: `src/importExport.js:44-49`

**Interfaces:**
- Consumes: `getDomainData(domain)`
- Produces: serialized group data containing `name: string`

- [ ] **Step 1: Write the failing regression test**

Create a minimal fake group element, call `getDomainData`, and assert that the result contains `name: "My Group"` and no `matchUrl` property.

- [ ] **Step 2: Run the test and verify the expected failure**

Run: `node test/importExportTest.js`

Expected: failure because the result contains `matchUrl` instead of `name`.

- [ ] **Step 3: Implement the minimal correction**

In `getDomainData`, replace:

```js
matchUrl: domain.querySelector(".domainMatchInput").value,
```

with:

```js
name: domain.querySelector(".domainMatchInput").value,
```

- [ ] **Step 4: Verify the regression and existing tests**

Run:

```bash
node test/importExportTest.js
node test/globMatchToDNRRegexTest.js
```

Expected: both scripts print `All tests succeeded!` and exit with status 0.

- [ ] **Step 5: Commit if Git is available**

```bash
git add src/importExport.js test/importExportTest.js
git commit -m "fix: persist group names"
```

This workspace is not currently a Git repository, so skip this step unless Git becomes available.
