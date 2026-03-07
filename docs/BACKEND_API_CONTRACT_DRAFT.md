# StayHia Backend API Contract Draft

## Auth
- POST /api/v1/auth/register
- POST /api/v1/auth/login
- POST /api/v1/auth/verify-otp
- GET /api/v1/auth/me

## Listings
- GET /api/v1/listings
- GET /api/v1/listings/:id
- POST /api/v1/listings
- PUT /api/v1/listings/:id

## Search
- GET /api/v1/search?where=&checkin=&checkout=&guests=&filters=

## Availability & Pricing
- GET /api/v1/listings/:id/availability
- POST /api/v1/quotes

## Bookings
- POST /api/v1/bookings
- GET /api/v1/bookings/:id
- POST /api/v1/bookings/:id/cancel
- POST /api/v1/bookings/:id/confirm (host)

## Payments
- POST /api/v1/payments/checkout
- POST /api/v1/payments/webhook
- GET /api/v1/payments/:id

## Messaging
- GET /api/v1/messages/threads
- GET /api/v1/messages/threads/:id
- POST /api/v1/messages/threads/:id

## Reviews
- POST /api/v1/reviews
- GET /api/v1/listings/:id/reviews

## Admin
- GET /api/v1/admin/metrics
- GET /api/v1/admin/disputes
- POST /api/v1/admin/disputes/:id/resolve
