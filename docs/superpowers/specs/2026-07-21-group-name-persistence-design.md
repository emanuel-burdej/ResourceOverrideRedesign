# Group Name Persistence

## Problem

The group editor loads the group name from `group.name`, but serialization writes the input value to `group.matchUrl`. Saving therefore removes `name`, and the field is empty after refresh.

## Design

- Serialize the group-name input as `name`.
- Do not migrate or fall back to legacy `matchUrl` values.
- Keep the current debounced save behavior and UI unchanged.

## Testing

Add a regression test proving that `getDomainData` returns the entered group name in `name` and does not emit `matchUrl`. Run this test and the existing test suite.
