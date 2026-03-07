# StayHia Booking Procedure Spec (v1)

## Booking Modes
1. Instant Book
2. Request to Book

## Core Booking States
- DRAFT
- PRICE_QUOTED
- PENDING_PAYMENT
- AWAITING_HOST (request mode)
- CONFIRMED
- CANCELLED_GUEST
- CANCELLED_HOST
- EXPIRED
- COMPLETED
- REFUND_PENDING
- REFUNDED

## Procedure Flow
1. Guest selects dates + guests
2. Availability validation
3. Quote generation
   - nightly subtotal
   - cleaning
   - platform service fee
   - taxes
   - total
4. Reserve action
5. Payment authorization/capture
6. Confirmation or host-review path
7. Notifications to guest + host
8. Calendar lock + receipt issue

## Key Rules
- Quote TTL: 15 minutes default
- Request-to-book host response SLA: 24h
- Auto-expire if no host response
- Prevent double-booking with atomic calendar lock
- Cancellation policy attached at booking-time snapshot

## Audit Trail
Each status transition logs:
- actor (guest/host/system/admin)
- timestamp
- previous state
- new state
- reason code
