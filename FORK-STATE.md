# Fork state

Last updated: 2026-11-19

## Verified

- Fork created from `router-for-me/Cli-Proxy-API-Management-Center` at `main`, `v1.28.3` (2026-11-18).
- `.github/workflows/sync-upstream.yml` installed (daily 09:37 UTC; green-only push to `main`;
  conflict issue / red PR fallback).
- Upstream `ci.yml` kept as-is (PR + push to main: `bun install --frozen-lockfile` then
  `bun run verify`). Upstream `release.yml` kept as-is (fires on `v*` tags only).

## Touched upstream files

None. Our addition: `FORK.md`, `FORK-STATE.md`, `.github/workflows/sync-upstream.yml`.

## Not verified yet

- First green `CI` run on the fork (needs `bun install` + verify to pass on GitHub's runners).
- First `sync-upstream` run (expected "Nothing new upstream").
- Local `bun run verify` — not run on this machine yet.

## Next

- Run `bun run dev` against the live core (`127.0.0.1:8317`) and pick the UI changes worth making.
- Decide whether the core fork should consume this fork's release instead of upstream's
  (`internal/managementasset/updater.go` in `ArcticSlayy/CLIProxyAPI`).
