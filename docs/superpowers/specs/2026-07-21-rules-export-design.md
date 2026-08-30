# Rules Export

## Problem

Save Rules serializes the unresolved Promise returned by `exportData()`, producing `{}`. The completed export also uses `ruleGroups`, while Load Rules expects the rules array in `data`.

## Design

- Add an asynchronous JSON export helper that awaits `exportData()`.
- Return version 2 exports as `{ "v": 2, "data": [...] }`.
- Make the Save Rules click handler await the JSON before creating the download.
- Keep the existing filename and import behavior.

## Testing

Add a regression test that exports stored rules and verifies the resulting JSON contains version `2`, the `data` array, and the group name.
