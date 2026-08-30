# Changelog

All notable changes in **ResourceOverrideRedesign** compared to the upstream [kylepaulsen/ResourceOverride `mv3`](https://github.com/kylepaulsen/ResourceOverride/tree/mv3) branch.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [2.0.0] - 2026-08-30

First public redesign release of this fork.

### Redesign & UI

- Full visual redesign of popup, options, and DevTools panel (spacing, cards, typography, accent colors).
- **Dark mode** toggle in the header menu.
- Compact **toolbar popup** layout (wider popover, denser controls).
- Header **⋮ menu** with Help, Options, Show DevTools Tab, Dark mode, Save/Load rules.
- Expand / Collapse all groups control.
- Modern **ON/OFF pill toggles** instead of legacy switch styling.
- Group header layout polish (drag handle, aligned labels, clearer actions).
- Toolbar icon / badge reflects how many groups are currently ON.

### Features

- **Copy group** on each group row (new IDs, file contents preserved) with a short green checkmark feedback.
- New groups start **expanded** with one default URL → URL rule.
- Expand / collapse state persisted per group.
- Drag-and-drop reorder for groups and rules (with reliable save).

### Reliability

- Popup close / hide flushes pending saves so rule changes are not lost.
- Fixes for **duplicate groups** when toggling ON in the popup.
- Serialized group saves to avoid race conditions.
- Background service worker **re-applies rules** on browser startup, extension install, and service worker start (rules work without opening the popup).

### Import / Export

- Import validation for Resource Override JSON (v1 / v2).
- **10 MB** import size limit.
- Confirmation when importing or exporting **file inject** rules or large embedded files.
- Safer toast messages (text only, no HTML injection).

### Security / cleanup

- Background message handler accepts only messages from this extension (`sender.id` check).
- Removed unused jQuery and dead inject script leftovers.
- MIT LICENSE and README updated for this unofficial redesign fork.

### Note

Upstream `mv3` was unfinished and unsupported by the original author. This release packages the redesign and the reliability work above for personal / community use.
