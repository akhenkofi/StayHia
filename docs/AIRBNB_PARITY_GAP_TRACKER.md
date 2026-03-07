# Airbnb Parity Gap Tracker

## Must Reach Before Beta
- [ ] Search + filters parity
- [ ] Listing detail parity
- [ ] Booking + payment parity
- [ ] Host dashboard parity
- [ ] Reviews/messaging parity
- [ ] Core legal pages parity

## Improvement Targets
- [ ] Better fee transparency UX
- [ ] Stronger trust explainability
- [ ] Faster host onboarding
- [ ] Cleaner cancellation visibility

## Deep Review Update (2026-03-07)
- Review doc: `DEEP_STANDARDS_REVIEW_2026-03-07.md`
- Priority order:
  - **P0:** Product shell, booking engine, payment/payout runtime, trust ops baseline, legal publication set, notification orchestration
  - **P1:** Search/ranking semantics, fee transparency operationalization, host quality controls, policy-product binding, notification dedupe/retry, admin observability
  - **P2:** Explainable trust score, traveler intent presets, unified dispute timeline, plain-language policy summaries

## Current Gap Level (re-baselined)
- Functional parity: 14% (first executable booking runtime path now exists)
- UX parity: 20% (design system + principles documented)
- Booking parity: 30% (quote TTL + booking transitions + retrieval implemented)
- Trust & safety parity: 12% (policy snapshot integrity foundation added)
- Policy parity: 35% (policy freeze + hash at booking-time added)
- Notifications parity: 20% (event/priority model documented)
- Monetization parity: 22% (canonical fee schema + digest enforcement implemented)

## Next-Day Focus
Build notification dispatcher v0 + legal publication pages, then connect booking confirmation/cancellation transitions to outbound notification events.
