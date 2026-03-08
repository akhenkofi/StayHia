# StayHia FULL_OWNER_BACKUP

This folder is your owner-controlled relaunch pack.

## Included now
- `snapshots/runtime-store.json` (durable runtime state if present)
- `snapshots/assets/` (branding assets)

## To recreate anywhere
1. Deploy web root + `assets/`.
2. Restore runtime store to `api/data/runtime-store.json`.
3. Configure API env and run API.
4. Point domain + API DNS to new host.

## Keep updated after every major change
- Copy latest runtime-store snapshot.
- Keep assets current.
- Keep relaunch docs aligned with latest architecture.
