# StayHia Build Status

## Active Milestone
- M1: Pre-DNS product expansion and Airbnb parity blueprint

## Completed
- Domain secured (`stayhia.com`)
- DNS baseline connected (`@`, `www`, `api`)
- Initial project scaffold + launchers
- Feature parity checklist + research notes
- Booking runtime v0 skeleton in `api/src/server.js`:
  - Quote TTL endpoint + expiry guard
  - Booking state transitions (pending/confirm/cancel)
  - Policy snapshot freeze with hash
  - Canonical fee schema + quote digest integrity

## In Progress
- Day +1 execution kickoff from deep standards review:
  - Product shell routes and booking funnel wiring
  - Notification dispatcher v0 (priority + quiet hours + dedupe)
  - Legal page publication set

## Next
- Generate frontend shell with search/listing/detail/checkout placeholders
- Add legal page templates (TOS/Privacy/Cancellation/Refund/Trust Standards)
- Add notification orchestration worker and preference center stub
- Add pricing engine + host payout ETA tracker stub
- Add durable booking persistence + payment-intent/idempotency layer

## Latest Artifact
- `BOOKING_RUNTIME_V0.md` (implemented quote TTL, booking state transitions, policy snapshot freeze, fee digest integrity)
- `DEEP_STANDARDS_REVIEW_2026-03-07.md` (priority gaps + next-day implementation plan)

## Resume Rule
If interrupted (internet/power), resume from this file's **In Progress** list first.
