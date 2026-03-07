# StayHia Deep Standards Review (Airbnb-Level Baseline)

**Run date:** 2026-03-07 04:00 PT  
**Scope:** UX, booking, trust & safety, policy, notifications, monetization  
**Baseline:** Airbnb-level public product patterns + launch-readiness expectations

---

## Executive Snapshot

StayHia has strong planning artifacts (matrix, checklist, flow specs) but no implemented product surfaces in `web/` or `api/` yet. Current status is **strategy-complete, execution-not-started**.

### Current maturity (estimated)
- **UX parity:** 20% (design principles + component inventory exist; no shipped flows)
- **Booking parity:** 15% (state model/spec drafted; no executable booking service)
- **Trust & safety parity:** 10% (requirements stated; no operational controls)
- **Policy/legal parity:** 25% (page inventory + compliance intentions; no published legal artifacts)
- **Notifications parity:** 20% (event classes + priority model defined; no delivery implementation)
- **Monetization parity:** 12% (pricing breakdown concept + payment endpoints drafted; no fee engine/payout logic)

---

## Prioritized Gap List

## P0 — Critical gaps (must start immediately)

1. **No live product shell (guest search → listing → checkout path absent)**  
   - **Area:** UX / Booking / Monetization  
   - **Impact:** Cannot validate core conversion funnel or parity claims.

2. **No implemented booking engine behind drafted lifecycle states**  
   - **Area:** Booking  
   - **Impact:** Cannot create authoritative reservation states, calendar locks, or cancellation snapshots.

3. **No payment/payout runtime design (beyond endpoint placeholders)**  
   - **Area:** Monetization  
   - **Impact:** Revenue and host trust blocked; payout transparency impossible.

4. **No trust operations stack (verification workflow, risk scoring, disputes runbook)**  
   - **Area:** Trust & Safety  
   - **Impact:** Marketplace abuse/exposure risk; no incident response path.

5. **No legally published policy set with versioning and jurisdiction mapping**  
   - **Area:** Policy  
   - **Impact:** Launch and compliance risk; weak user trust in cancellations/refunds.

6. **No notification delivery orchestration and preference center backend**  
   - **Area:** Notifications  
   - **Impact:** Booking lifecycle reliability and SLA communication at risk.

## P1 — High-priority gaps (next wave after P0 kickoff)

7. **Search ranking and filter semantics are undefined in executable terms**  
   - Missing relevance scoring, default sort rules, map/list synchronization behavior.

8. **Price transparency UX is described but not operationalized**  
   - No canonical fee schema, pre-checkout fee guarantee language, or price-change guardrails.

9. **Host onboarding quality controls not encoded**  
   - No listing quality scoring rubric, mandatory content checks, or fraud friction triggers.

10. **Policy-to-product binding incomplete**  
   - Cancellation/refund policies are not mapped to booking state transitions and support tooling.

11. **Notification anti-spam logic lacks concrete quotas and dedupe keys**  
   - No event idempotency strategy, retry policy, or escalation matrix.

12. **Admin observability minimal**  
   - No event audit dashboard, trust incident metrics, policy-change impact tracking.

## P2 — Strategic improvements (post-baseline parity hardening)

13. Explainable trust score with user-facing reason codes.
14. Traveler intent presets + price confidence band.
15. Unified support/dispute timeline visible to guest + host.
16. Plain-language legal summaries paired with full legal text.

---

## Domain-by-Domain Standards Assessment

### 1) UX
**Baseline expectation:** polished end-to-end guest + host flows, robust empty/error/loading states, mobile-first responsiveness, confidence signals at decision points.

**StayHia status:** UI system and principles documented; no implemented flow.  
**Key deficit:** parity cannot be measured until interactive funnel exists.

### 2) Booking
**Baseline expectation:** resilient quote/hold/reserve/confirm/cancel pipeline with atomic inventory controls and policy snapshots.

**StayHia status:** booking states and rules are thoughtfully drafted.  
**Key deficit:** no execution layer, no quote integrity controls, no host SLA automation implementation.

### 3) Trust & Safety
**Baseline expectation:** layered verification, moderation queues, risk scoring, disputes workflow, abuse prevention instrumentation.

**StayHia status:** high-level intent exists in checklist/matrix.  
**Key deficit:** no operational protocols, no tooling, no escalation ownership.

### 4) Policy
**Baseline expectation:** jurisdiction-aware legal pages, version history, acceptance capture, cancellation/refund clarity integrated into booking UX.

**StayHia status:** required page list and compliance goals are documented.  
**Key deficit:** no drafted publication set, no acceptance logging model.

### 5) Notifications
**Baseline expectation:** event-driven, prioritized, deduplicated, channel-aware, preference-governed delivery with retries.

**StayHia status:** event classes, priorities, sound behavior are documented.  
**Key deficit:** no architecture for orchestration, retries, or user preference enforcement.

### 6) Monetization
**Baseline expectation:** trusted checkout breakdown, fee clarity, tax handling, payout predictability, refund/cancellation economics.

**StayHia status:** conceptual line items and endpoint placeholders exist.  
**Key deficit:** no canonical pricing engine, no payout ledger model, no fee governance process.

---

## Next-Day Implementation Plan (Execution-First)

## Day +1 Objective
Ship an executable **v0 parity skeleton** that proves the full booking chain and trust-critical policy/notification hooks.

### Track A — Product Shell (Frontend)
1. Build routes/pages: `/`, `/search`, `/listing/:id`, `/checkout`, `/booking/:id`, `/host/inbox`.
2. Implement reusable components from `UI_SYSTEM.md` with states (loading/empty/error).
3. Add immutable checkout summary block with line-item fee visibility and cancellation snapshot panel.

**Deliverable:** clickable end-to-end funnel with mock data + deterministic state transitions.

### Track B — Core Booking + Pricing Services (Backend)
1. Implement booking state machine service from `BOOKING_PROCEDURE_SPEC.md`.
2. Add quote service with TTL enforcement + idempotent quote IDs.
3. Add calendar lock service (atomic reservation lock + expiration worker).
4. Add policy snapshot persistence at booking creation.

**Deliverable:** API-backed booking flow that prevents double-booking and preserves booking-time policy terms.

### Track C — Trust, Policy, Notifications Foundation
1. Create minimal trust event schema (`login_risk`, `new_listing_review`, `booking_risk_flag`).
2. Implement policy pages v0 (Privacy, TOS, Cancellation, Refund, Trust Standards) + version metadata.
3. Implement notification dispatcher v0 with:
   - priority-based channel routing
   - quiet-hours enforcement
   - dedupe key (`eventType + bookingId + state`)

**Deliverable:** auditable policy artifacts and reliable lifecycle alerts.

### Track D — Monetization Readiness
1. Define canonical fee schema (`nightly`, `cleaning`, `service_fee`, `taxes`, `discounts`, `total`).
2. Implement checkout calculation endpoint with signed quote digest.
3. Add payout ETA placeholder logic and host-facing fee explainer.

**Deliverable:** trustworthy, reproducible pricing math from quote through confirmation.

---

## Acceptance Criteria for Tomorrow Night

- A guest can search mock inventory, view listing detail, get a quote, submit booking request, and receive lifecycle notifications.
- Booking record stores cancellation/refund policy snapshot and quote digest.
- Calendar lock prevents concurrent booking for same dates.
- Policy pages render with version/date metadata.
- Host sees booking request and response deadline timer.
- Fee breakdown remains consistent between quote and checkout confirmation.

---

## Recommended Sequencing (fastest risk burn-down)
1. Booking state machine + lock service
2. Checkout fee engine + policy snapshot
3. Frontend funnel wiring
4. Notification dispatcher
5. Policy publication + acceptance capture
6. Trust event capture + admin queue stubs

This order de-risks revenue and trust simultaneously while enabling immediate internal QA of Airbnb-level core journey.
