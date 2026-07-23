# CoreZax Branding Baseline

Date: 2026-07-23

This branch is the isolated branding/deployment baseline for renaming the current game/app surface from COREO / COREO Dark to **CoreZax**.

## Scope

Changed in this branding pass:
- Browser title
- PWA Apple home-screen title
- `manifest.json` name, short_name, and description
- Visible version tag
- Service Worker cache name
- Tests that protect the visible brand and cache baseline

Intentionally not changed in this pass:
- Stage 03 route logic
- Maze topology
- Control tuning
- Internal CSS custom properties such as `--coreo-*`
- Local storage keys such as `coreo-dark-*`
- Diagnostic/lab pages unless Sean later wants those renamed too

## Cache Impact

The Service Worker cache name changed to:

`corezax-v0107-brand-baseline-20260723`

Existing test devices may redownload the app shell after deployment. This is expected for the branding baseline and should be treated separately from gameplay bugs.

## Registered Domains

Cloudflare Registrar domains:
- `corezax.com`
- `corezax.app`

