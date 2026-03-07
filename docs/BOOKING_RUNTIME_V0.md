# Booking Runtime v0 (Implemented 2026-03-07)

This pass ships a concrete backend skeleton for critical Airbnb-parity booking behavior.

## Implemented
- In-memory quote creation with TTL (`POST /v1/quotes`)
- Canonical fee breakdown normalization + SHA256 fee digest
- Booking creation from live quote (`POST /v1/bookings`)
- Immutable policy snapshot freezing at booking time (with hash)
- Booking lifecycle transitions:
  - `PENDING_PAYMENT -> CONFIRMED`
  - `PENDING_PAYMENT/CONFIRMED -> CANCELLED`
- Booking retrieval (`GET /v1/bookings/:id`)
- Health endpoint (`GET /health`)

## API Surface
- `POST /v1/quotes`
- `POST /v1/bookings`
- `GET /v1/bookings/:id`
- `POST /v1/bookings/:id/confirm`
- `POST /v1/bookings/:id/cancel`

## How to run
```bash
cd api
npm start
# server on :4010 by default
```

## Environment
- `PORT` (default: 4010)
- `QUOTE_TTL_MS` (default: 900000 = 15 min)

## Notes
- Storage is intentionally in-memory for parity skeleton speed.
- Next pass should swap maps with durable persistence and add payment intent linkage + idempotency keys.
