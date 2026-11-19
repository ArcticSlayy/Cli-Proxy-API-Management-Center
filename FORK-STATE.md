# Fork state

Last updated: 2026-11-19

## Verified

- Fork created from `router-for-me/Cli-Proxy-API-Management-Center` at `main`, `v1.28.3` (2026-11-18).
- `.github/workflows/sync-upstream.yml` installed (daily 09:37 UTC; green-only push to `main`;
  conflict issue / red PR fallback).
- Upstream `ci.yml` kept as-is (PR + push to main: `bun install --frozen-lockfile` then
  `bun run verify`). Upstream `release.yml` kept as-is (fires on `v*` tags only).
- `bun install` + `bun run lint` + `bun run build` green locally (2026-11-19).
- `bun run verify` locally: 2376 pass / 13 fail. The same 13 fail on a pristine `upstream/main`
  worktree on this machine, so they are Windows/ICU-local (calendar/timezone, focus, lifecycle
  stubs), not fork or PR regressions. GitHub's Linux runner is green.
- Build wired into the running core: `dist/index.html` copied to
  `G:\Tools\CLIProxyAPI\data\static\management.html` and served at
  `http://127.0.0.1:8317/management.html` (3,906,778 bytes). Upstream's downloaded copy is kept
  beside it as `management.html.upstream-20261118`.

## Our changes

| Area | What changed | Why |
| --- | --- | --- |
| Dashboard hero | "What needs attention" list: provider, account, unwrapped upstream reason, cooldown remainder, link to Auth Files | The verdict said *Needs attention* but itemised nothing; the failures (quota, rate limit) were only discoverable by opening Auth Files |
| `useDashboardOverview` | Derives `attention[]` from disabled/unavailable credentials, sorts unavailable first then soonest cooldown, records the snapshot receipt time so render stays pure | Keeps `react-hooks/purity` satisfied and the cooldown math honest |
| `utils.summarizeCredentialReason` | Unwraps `{error:{message}}` JSON envelopes into one line, collapses whitespace, truncates at 120 chars | Rows showed raw 400-char JSON blobs before |
| i18n | 8 keys × 7 locales | Locale parity tests require every bundle to carry every key |
| Tests | `tests/dashboardAttention.test.ts` (5 cases: source contracts, reason unwrapping, locale coverage) | Matches the repo's source-contract + pure-helper test style |

## Merged upstream fixes (2026-11-19)

| PR | What it fixes |
| --- | --- |
| router-for-me#575 | OAuth alias pools deduped by name+alias, not alias alone (failover order) |
| router-for-me#576 | bun audit advisories closed with bounded `overrides` (axios/follow-redirects path) |
| router-for-me#577 | Flaky full-suite window stub isolated by descriptor |
| router-for-me#578 | Mobile shell kept inside the visible viewport (`100dvh`) |

Open and deliberately not taken yet: #569 (quota 429 backoff, conflicts in 9 files),
#582 (per-key policies, 6.5k-line feature branch).

## Touched upstream files

None. Our addition: `FORK.md`, `FORK-STATE.md`, `.github/workflows/sync-upstream.yml`.

## Not verified yet

- First `sync-upstream` run on the fork.
- Whether the core re-downloads `management.html` from upstream on a future core update; if it
  does, re-copy `dist/index.html` afterwards.

## Next

- Point `internal/managementasset/updater.go` in the core fork at this fork's release instead of
  upstream's, then the copy step above disappears.
- UI changes worth making (theme/nav pass over the model and auth screens).
