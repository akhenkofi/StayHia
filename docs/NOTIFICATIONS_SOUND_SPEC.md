# StayHia Notifications + Sound Spec

## Channels
- In-app
- Push
- Email
- SMS (critical booking lifecycle only)

## Event Classes
1. Booking lifecycle
   - Request sent
   - Host accepted/declined
   - Payment success/failure
   - Upcoming check-in reminders
2. Messaging
   - New message
3. Safety/account
   - New login
   - Verification required
4. Host ops
   - New booking request
   - Calendar conflict warning

## Priority
- P1 Critical: payment failure, booking cancellation, account security
- P2 Important: booking accepted, check-in reminder
- P3 Informational: promotions, tips

## Sound Behavior
- P1: default critical sound + persistent badge
- P2: normal sound + badge
- P3: silent by default
- Quiet hours support (user configurable)

## Anti-spam Rules
- Merge repeated events
- Throttle non-critical notifications
- Respect locale time zone and quiet hours
