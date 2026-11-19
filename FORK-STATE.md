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
| Quota page: **Pool forecast** | New panel above the cards: per provider, the pool (`remaining% of capacity%`), burn rate from recorded samples, next reset, first-empty projection, a recorded/projected sparkline, and per-account chips with a "Show emails" privacy toggle | The cards answer "what is left on this account"; nothing answered "what do I have left across the provider, and when does it run out" |
| Quota page: **auto-load** | First visit in a browser session fetches quota once (sessionStorage guard + ref), so cards and the pool are populated instead of six "Click here to refresh quota" placeholders | The page opened at "0 loaded"; every provider needed a manual click |
| `pool/poolModel.ts` | Pure extraction from the five quota shapes (longest window per account, tightest Antigravity bucket, xAI billing), pool totals, burn from samples, projection, label masking | Testable without React; no guessed numbers - no samples means no burn rate |
| `pool/PoolForecast.tsx` + module | Panel, window switch (1h/3h/6h), sample persistence in localStorage, SVG sparkline | Follows the existing token/SCSS-module conventions |
| Dashboard hero | "What needs attention" list: provider, account, unwrapped upstream reason, cooldown remainder, link to Auth Files | The verdict said *Needs attention* but itemised nothing; the failures (quota, rate limit) were only discoverable by opening Auth Files |
| `useDashboardOverview` | Derives `attention[]` from disabled/unavailable credentials, sorts unavailable first then soonest cooldown, records the snapshot receipt time so render stays pure | Keeps `react-hooks/purity` satisfied and the cooldown math honest |
| `utils.summarizeCredentialReason` | Unwraps `{error:{message}}` JSON envelopes into one line, collapses whitespace, truncates at 120 chars | Rows showed raw 400-char JSON blobs before |
| i18n | 8 + 17 keys × 7 locales | Locale parity tests require every bundle to carry every key |
| Tests | `tests/dashboardAttention.test.ts` (5 cases), `tests/quotaPoolForecast.test.ts` (10 cases) | Matches the repo's source-contract + pure-helper test style |

### Pool forecast: not yet covered

Compared with the reference design (pool chart with multi-day range, drain/burn modes, future-usage presets,
per-pool account selector): those remain open. Today the panel has one window switch, one projection basis
(recorded burn), and no date range.

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
