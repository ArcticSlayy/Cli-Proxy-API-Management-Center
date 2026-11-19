# FORK.md — ArcticSlayy/Cli-Proxy-API-Management-Center

Fork of [router-for-me/Cli-Proxy-API-Management-Center](https://github.com/router-for-me/Cli-Proxy-API-Management-Center)
(MIT): the React 19 + Vite management UI for CLIProxyAPI. It builds to a single
`management.html` that the Go core serves at `/management.html`.

Why this fork exists: the proxy core (forked separately as `ArcticSlayy/CLIProxyAPI`) ships no
frontend of its own — it downloads this project's latest release as `management.html` at runtime
(`internal/managementasset/updater.go`) and serves it. Making the UI better happens here, and the
core then has to be pointed at *our* release instead of upstream's.

## Rules

- **Upstream stays a merge, not a rewrite.** The daily sync (`sync-upstream.yml`, 09:37 UTC)
  merges `upstream/main` and only pushes to `main` when `bun run verify` (tests + lint + build)
  is green. Upstream files stay upstream-shaped.
- **Our changes go in new files first** — new components under `src/`, a `FORK.md`, a
  `FORK-STATE.md`. If an upstream file must change, keep the diff small and record it in
  `FORK-STATE.md` under "Touched upstream files".
- **The fork owns `.github/workflows/`** (the sync restores our copy after every merge,
  because `GITHUB_TOKEN` cannot push workflow changes).
- Never merge with red checks.

## Local

```sh
bun install
bun run dev        # vite dev server, proxies to the core's management API
bun run verify     # test + lint + build — the same gate CI runs
bun run build      # emits dist/index.html, the single-file management UI
```

Checkout on this machine: `G:\Tools\CLIProxyAPI\ui`.

## Wiring a fork build into the running core

The core refreshes `management.html` from upstream's releases, so a fork build has to be placed
deliberately: drop the built HTML at `G:\Tools\CLIProxyAPI\data\static\management.html`
(the path the running core serves), or repoint `internal/managementasset/updater.go` in the core
fork at this fork's release URL. Do not do either until `bun run verify` is green.
