import http from "node:http";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT || 4010);
const QUOTE_TTL_MS = Number(process.env.QUOTE_TTL_MS || 15 * 60 * 1000);
const NOTIFY_DEDUPE_WINDOW_MS = Number(process.env.NOTIFY_DEDUPE_WINDOW_MS || 6 * 60 * 60 * 1000);
const QUIET_HOURS_START = Number(process.env.NOTIFY_QUIET_HOURS_START || 22);
const QUIET_HOURS_END = Number(process.env.NOTIFY_QUIET_HOURS_END || 7);
const NOTIFY_MAX_ATTEMPTS = Number(process.env.NOTIFY_MAX_ATTEMPTS || 5);
const NOTIFY_BACKOFF_BASE_MS = Number(process.env.NOTIFY_BACKOFF_BASE_MS || 30 * 1000);
const PAYOUT_HOLD_HOURS = Number(process.env.PAYOUT_HOLD_HOURS || 24);
const FAIL_NOTIFICATION_TEMPLATE_KEYS = new Set(
  String(process.env.FAIL_NOTIFICATION_TEMPLATE_KEYS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "runtime-store.json");

const quotes = new Map();
const bookings = new Map();
const paymentIntents = new Map();
const payoutRecords = new Map();
const idempotencyRecords = new Map();
const notificationQueue = [];
const notificationDeliveryLog = new Map();
const notificationPreferences = new Map();
const payoutReconciliationEvents = [];

const STATES = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED"
};

const NOTIFICATION_PRIORITIES = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  NORMAL: "NORMAL"
};

function defaultNotificationPreferences(userId) {
  return {
    userId,
    channels: {
      in_app: true,
      email: true,
      sms: false,
      push: true
    },
    bookingEvents: {
      BOOKING_CREATED: true,
      BOOKING_CONFIRMED: true,
      BOOKING_CANCELLED: true
    },
    quietHoursOverrideCriticalOnly: true,
    updatedAt: new Date().toISOString()
  };
}

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function mapEntriesToObject(map) {
  return Object.fromEntries(map.entries());
}

function hydrateMap(targetMap, sourceObject) {
  for (const [key, value] of Object.entries(sourceObject || {})) {
    targetMap.set(key, value);
  }
}

function loadRuntimeStore() {
  ensureDataDir();
  if (!fs.existsSync(STORE_FILE)) return;

  try {
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    if (!raw.trim()) return;

    const data = JSON.parse(raw);

    hydrateMap(quotes, data.quotes);
    hydrateMap(bookings, data.bookings);
    hydrateMap(paymentIntents, data.paymentIntents);
    hydrateMap(payoutRecords, data.payoutRecords);
    hydrateMap(idempotencyRecords, data.idempotencyRecords);
    hydrateMap(notificationDeliveryLog, data.notificationDeliveryLog);
    hydrateMap(notificationPreferences, data.notificationPreferences);

    for (const row of data.notificationQueue || []) {
      notificationQueue.push(row);
    }

    for (const row of data.payoutReconciliationEvents || []) {
      payoutReconciliationEvents.push(row);
    }
  } catch (err) {
    console.error("Failed to load runtime store:", err.message);
  }
}

function persistRuntimeStore(reason = "unspecified") {
  ensureDataDir();

  const snapshot = {
    persistedAt: new Date().toISOString(),
    persistReason: reason,
    counts: {
      quotes: quotes.size,
      bookings: bookings.size,
      paymentIntents: paymentIntents.size,
      payoutRecords: payoutRecords.size,
      idempotencyRecords: idempotencyRecords.size,
      notificationQueue: notificationQueue.length,
      notificationDeliveryLog: notificationDeliveryLog.size,
      notificationPreferences: notificationPreferences.size,
      payoutReconciliationEvents: payoutReconciliationEvents.length
    },
    quotes: mapEntriesToObject(quotes),
    bookings: mapEntriesToObject(bookings),
    paymentIntents: mapEntriesToObject(paymentIntents),
    payoutRecords: mapEntriesToObject(payoutRecords),
    idempotencyRecords: mapEntriesToObject(idempotencyRecords),
    notificationQueue,
    notificationDeliveryLog: mapEntriesToObject(notificationDeliveryLog),
    notificationPreferences: mapEntriesToObject(notificationPreferences),
    payoutReconciliationEvents
  };

  const tempPath = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(snapshot, null, 2));
  fs.renameSync(tempPath, STORE_FILE);
}

function getNotificationPreferences(userId) {
  if (!userId) return defaultNotificationPreferences("unknown");
  if (!notificationPreferences.has(userId)) {
    notificationPreferences.set(userId, defaultNotificationPreferences(userId));
    persistRuntimeStore("default_notification_preferences_created");
  }
  return notificationPreferences.get(userId);
}

function shouldSendByPreference(item) {
  const recipientUserId = item.audience === "host" ? item.hostId : item.guestId;
  const prefs = getNotificationPreferences(recipientUserId);

  if (!prefs.channels?.[item.channel]) {
    return { allowed: false, reason: "CHANNEL_DISABLED" };
  }

  if (prefs.bookingEvents?.[item.eventType] === false) {
    return { allowed: false, reason: "EVENT_DISABLED" };
  }

  if (
    prefs.quietHoursOverrideCriticalOnly &&
    item.priority !== NOTIFICATION_PRIORITIES.CRITICAL &&
    isQuietHours(nowMs())
  ) {
    return { allowed: false, reason: "QUIET_HOURS_BLOCKED" };
  }

  return { allowed: true };
}

function responseHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "https://stayhia.com",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  };
}

function send(res, status, payload) {
  res.writeHead(status, responseHeaders());
  res.end(JSON.stringify(payload, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function recordIdempotency(scopeKey, payload) {
  idempotencyRecords.set(scopeKey, {
    payload,
    at: new Date().toISOString()
  });
  persistRuntimeStore("idempotency_recorded");
}

function getIdempotency(scopeKey) {
  return idempotencyRecords.get(scopeKey);
}

function canonicalizeFees(fees) {
  const rows = [
    { kind: "nightly_total", amount: Number(fees.nightlyTotal || 0), currency: fees.currency || "USD" },
    { kind: "cleaning_fee", amount: Number(fees.cleaningFee || 0), currency: fees.currency || "USD" },
    { kind: "service_fee", amount: Number(fees.serviceFee || 0), currency: fees.currency || "USD" },
    { kind: "taxes", amount: Number(fees.taxes || 0), currency: fees.currency || "USD" },
    { kind: "discount", amount: Number(fees.discount || 0), currency: fees.currency || "USD" }
  ];

  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return { rows, total: Number(total.toFixed(2)) };
}

function feeDigest(feeBreakdown) {
  return createHash("sha256").update(JSON.stringify(feeBreakdown)).digest("hex");
}

function snapshotPolicy(policy) {
  const frozenAt = new Date().toISOString();
  const normalized = {
    cancellationPolicyId: policy?.cancellationPolicyId || "flexible_v1",
    houseRulesVersion: policy?.houseRulesVersion || "default_v1",
    refundTermsVersion: policy?.refundTermsVersion || "refund_v1"
  };

  const hash = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");

  return { ...normalized, frozenAt, hash };
}

function nowMs() {
  return Date.now();
}

function payoutEtaFromCapture(capturedAtIso) {
  const capturedAtMs = new Date(capturedAtIso).getTime();
  const availableAtMs = capturedAtMs + PAYOUT_HOLD_HOURS * 60 * 60 * 1000;
  return {
    holdHours: PAYOUT_HOLD_HOURS,
    capturedAt: new Date(capturedAtMs).toISOString(),
    estimatedAvailableAt: new Date(availableAtMs).toISOString(),
    estimatedAvailableAtMs: availableAtMs,
    remainingMs: Math.max(0, availableAtMs - nowMs())
  };
}

function appendPayoutReconciliationEvent(event) {
  payoutReconciliationEvents.unshift(event);
  if (payoutReconciliationEvents.length > 500) {
    payoutReconciliationEvents.length = 500;
  }
}

function reconcileDuePayouts({ limit = 50, source = "auto" } = {}) {
  const ts = nowMs();
  let released = 0;

  for (const payout of payoutRecords.values()) {
    if (released >= limit) break;
    if (payout.state !== "PENDING_RELEASE") continue;
    if (Number(payout.estimatedAvailableAtMs || 0) > ts) continue;

    payout.state = "RELEASED";
    payout.releasedAt = new Date(ts).toISOString();
    payout.updatedAt = payout.releasedAt;

    const booking = bookings.get(payout.bookingId);
    if (booking?.payout?.payoutId === payout.payoutId) {
      booking.payout.state = payout.state;
      booking.payout.releasedAt = payout.releasedAt;
    }

    appendPayoutReconciliationEvent({
      eventId: `pre_${randomUUID()}`,
      payoutId: payout.payoutId,
      bookingId: payout.bookingId,
      hostId: payout.hostId,
      type: "PAYOUT_AUTO_RELEASED",
      source,
      at: payout.releasedAt,
      amount: payout.amount,
      currency: payout.currency
    });

    released += 1;
  }

  if (released > 0) persistRuntimeStore(`payout_reconciled:${source}`);

  return {
    source,
    released,
    scanned: payoutRecords.size,
    pendingRelease: Array.from(payoutRecords.values()).filter((x) => x.state === "PENDING_RELEASE").length,
    releasedTotal: Array.from(payoutRecords.values()).filter((x) => x.state === "RELEASED").length,
    reconciliationEventCount: payoutReconciliationEvents.length
  };
}

function isQuietHours(tsMs) {
  const hour = new Date(tsMs).getHours();
  if (QUIET_HOURS_START === QUIET_HOURS_END) return false;
  if (QUIET_HOURS_START < QUIET_HOURS_END) {
    return hour >= QUIET_HOURS_START && hour < QUIET_HOURS_END;
  }
  return hour >= QUIET_HOURS_START || hour < QUIET_HOURS_END;
}

function pruneExpiredQuotes() {
  const ts = nowMs();
  let removed = 0;
  for (const [id, q] of quotes.entries()) {
    if (q.expiresAtMs <= ts || q.status === "CONSUMED") {
      quotes.delete(id);
      removed += 1;
    }
  }
  if (removed > 0) persistRuntimeStore("expired_quotes_pruned");
}

function enqueueNotification(item) {
  notificationQueue.push({
    notificationId: `n_${randomUUID()}`,
    status: "QUEUED",
    createdAt: new Date().toISOString(),
    createdAtMs: nowMs(),
    attemptCount: 0,
    maxAttempts: Number(item.maxAttempts || NOTIFY_MAX_ATTEMPTS),
    nextAttemptAtMs: nowMs(),
    ...item
  });
}

function retryBackoffMs(attemptCount) {
  return NOTIFY_BACKOFF_BASE_MS * 2 ** Math.max(0, attemptCount - 1);
}

function nextAttemptAfterQuietHours(tsMs) {
  const dt = new Date(tsMs);
  const next = new Date(dt);

  if (!isQuietHours(tsMs)) return tsMs;

  if (QUIET_HOURS_START < QUIET_HOURS_END) {
    next.setHours(QUIET_HOURS_END, 0, 0, 0);
    if (next.getTime() <= tsMs) next.setDate(next.getDate() + 1);
    return next.getTime();
  }

  if (dt.getHours() >= QUIET_HOURS_START) {
    next.setDate(next.getDate() + 1);
  }
  next.setHours(QUIET_HOURS_END, 0, 0, 0);
  return next.getTime();
}

function shouldSimulateTransientFailure(item) {
  return FAIL_NOTIFICATION_TEMPLATE_KEYS.has(item.templateKey);
}

function createNotificationFromBookingEvent({ booking, eventType }) {
  const base = {
    bookingId: booking.bookingId,
    listingId: booking.listingId,
    guestId: booking.guestId,
    hostId: booking.hostId || "host_unknown",
    eventType
  };

  if (eventType === "BOOKING_CREATED") {
    return [
      {
        ...base,
        channel: "in_app",
        audience: "guest",
        priority: NOTIFICATION_PRIORITIES.NORMAL,
        dedupeKey: `guest:${booking.bookingId}:BOOKING_CREATED`,
        templateKey: "booking_created_guest"
      },
      {
        ...base,
        channel: "in_app",
        audience: "host",
        priority: NOTIFICATION_PRIORITIES.HIGH,
        dedupeKey: `host:${booking.bookingId}:BOOKING_CREATED`,
        templateKey: "booking_created_host"
      }
    ];
  }

  if (eventType === "BOOKING_CONFIRMED") {
    return [
      {
        ...base,
        channel: "in_app",
        audience: "guest",
        priority: NOTIFICATION_PRIORITIES.HIGH,
        dedupeKey: `guest:${booking.bookingId}:BOOKING_CONFIRMED`,
        templateKey: "booking_confirmed_guest"
      },
      {
        ...base,
        channel: "in_app",
        audience: "host",
        priority: NOTIFICATION_PRIORITIES.HIGH,
        dedupeKey: `host:${booking.bookingId}:BOOKING_CONFIRMED`,
        templateKey: "booking_confirmed_host"
      }
    ];
  }

  if (eventType === "BOOKING_CANCELLED") {
    return [
      {
        ...base,
        channel: "in_app",
        audience: "guest",
        priority: NOTIFICATION_PRIORITIES.CRITICAL,
        dedupeKey: `guest:${booking.bookingId}:BOOKING_CANCELLED`,
        templateKey: "booking_cancelled_guest"
      },
      {
        ...base,
        channel: "in_app",
        audience: "host",
        priority: NOTIFICATION_PRIORITIES.CRITICAL,
        dedupeKey: `host:${booking.bookingId}:BOOKING_CANCELLED`,
        templateKey: "booking_cancelled_host"
      }
    ];
  }

  return [];
}

function enqueueBookingNotifications(booking, eventType) {
  const jobs = createNotificationFromBookingEvent({ booking, eventType });
  jobs.forEach(enqueueNotification);
  persistRuntimeStore(`booking_notifications_enqueued:${eventType}`);
  return jobs.length;
}

function dispatchNotifications({ limit = 25 } = {}) {
  const ts = nowMs();
  const result = {
    attempted: 0,
    sent: 0,
    deduped: 0,
    deferredQuietHours: 0,
    suppressedByPreference: 0,
    retriedScheduled: 0,
    deadLettered: 0,
    requeuedDue: 0,
    remaining: 0
  };

  let mutated = false;

  for (const item of notificationQueue) {
    if (result.attempted >= limit) break;

    const isDispatchableStatus = item.status === "QUEUED" || item.status === "RETRY_SCHEDULED" || item.status === "DEFERRED_QUIET_HOURS";
    if (!isDispatchableStatus) continue;
    if (Number(item.nextAttemptAtMs || 0) > ts) continue;

    if (item.status === "RETRY_SCHEDULED" || item.status === "DEFERRED_QUIET_HOURS") {
      result.requeuedDue += 1;
    }

    item.status = "QUEUED";
    result.attempted += 1;
    mutated = true;

    const lastSentAt = notificationDeliveryLog.get(item.dedupeKey);
    if (lastSentAt && ts - lastSentAt < NOTIFY_DEDUPE_WINDOW_MS) {
      item.status = "DEDUPED";
      item.processedAt = new Date().toISOString();
      result.deduped += 1;
      continue;
    }

    const preferenceGate = shouldSendByPreference(item);
    if (!preferenceGate.allowed) {
      if (preferenceGate.reason === "QUIET_HOURS_BLOCKED") {
        item.status = "DEFERRED_QUIET_HOURS";
        item.nextAttemptAtMs = nextAttemptAfterQuietHours(ts);
        item.processedAt = new Date().toISOString();
        result.deferredQuietHours += 1;
      } else {
        item.status = "SUPPRESSED_PREFERENCE";
        item.processedAt = new Date().toISOString();
        result.suppressedByPreference += 1;
      }
      continue;
    }

    if (shouldSimulateTransientFailure(item)) {
      item.attemptCount += 1;
      item.lastError = "TRANSIENT_PROVIDER_FAILURE";
      item.lastErrorAt = new Date().toISOString();

      if (item.attemptCount >= item.maxAttempts) {
        item.status = "DEAD_LETTER";
        item.processedAt = item.lastErrorAt;
        result.deadLettered += 1;
      } else {
        item.status = "RETRY_SCHEDULED";
        item.nextAttemptAtMs = ts + retryBackoffMs(item.attemptCount);
        result.retriedScheduled += 1;
      }
      continue;
    }

    item.status = "SENT";
    item.sentAt = new Date().toISOString();
    item.processedAt = item.sentAt;
    item.attemptCount += 1;
    notificationDeliveryLog.set(item.dedupeKey, ts);
    result.sent += 1;
  }

  result.remaining = notificationQueue.filter(
    (x) => x.status === "QUEUED" || x.status === "RETRY_SCHEDULED" || x.status === "DEFERRED_QUIET_HOURS"
  ).length;

  if (mutated) persistRuntimeStore("notification_dispatch_run");

  return result;
}

async function handler(req, res) {
  pruneExpiredQuotes();
  reconcileDuePayouts({ limit: 25, source: "request_tick" });

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, {
      ok: true,
      service: "stayhia-api",
      quoteTtlMs: QUOTE_TTL_MS,
      notificationDedupeWindowMs: NOTIFY_DEDUPE_WINDOW_MS,
      quietHours: { startHour: QUIET_HOURS_START, endHour: QUIET_HOURS_END },
      notificationPreferenceProfiles: notificationPreferences.size,
      paymentIntentCount: paymentIntents.size,
      payoutRecordCount: payoutRecords.size,
      payoutReconciliationEventCount: payoutReconciliationEvents.length,
      idempotencyRecordCount: idempotencyRecords.size,
      persistence: {
        storeFile: STORE_FILE,
        quotes: quotes.size,
        bookings: bookings.size,
        paymentIntents: paymentIntents.size,
        payoutRecords: payoutRecords.size,
        idempotencyRecords: idempotencyRecords.size,
        notificationQueue: notificationQueue.length
      },
      notificationRetryPolicy: {
        maxAttempts: NOTIFY_MAX_ATTEMPTS,
        backoffBaseMs: NOTIFY_BACKOFF_BASE_MS,
        failTemplateKeys: Array.from(FAIL_NOTIFICATION_TEMPLATE_KEYS)
      }
    });
  }

  if (req.method === "POST" && req.url === "/v1/quotes") {
    const body = await parseBody(req);
    const feeBreakdown = canonicalizeFees(body.fees || {});
    const digest = feeDigest(feeBreakdown);

    const quoteId = `q_${randomUUID()}`;
    const createdAtMs = nowMs();
    const expiresAtMs = createdAtMs + QUOTE_TTL_MS;

    const quote = {
      quoteId,
      listingId: body.listingId,
      hostId: body.hostId,
      guestId: body.guestId,
      checkIn: body.checkIn,
      checkOut: body.checkOut,
      guests: Number(body.guests || 1),
      feeBreakdown,
      feeDigest: digest,
      createdAtMs,
      expiresAtMs,
      status: "OPEN"
    };

    quotes.set(quoteId, quote);
    persistRuntimeStore("quote_created");
    return send(res, 201, quote);
  }

  if (req.method === "POST" && req.url === "/v1/bookings") {
    const body = await parseBody(req);
    const quote = quotes.get(body.quoteId);

    if (!quote) return send(res, 404, { error: "QUOTE_NOT_FOUND" });
    if (quote.expiresAtMs <= nowMs()) return send(res, 409, { error: "QUOTE_EXPIRED" });

    const policySnapshot = snapshotPolicy(body.policy);

    const bookingId = `b_${randomUUID()}`;
    const createdAt = new Date().toISOString();
    const booking = {
      bookingId,
      quoteId: quote.quoteId,
      listingId: quote.listingId,
      hostId: quote.hostId,
      guestId: quote.guestId,
      stay: {
        checkIn: quote.checkIn,
        checkOut: quote.checkOut,
        guests: quote.guests
      },
      feeBreakdown: quote.feeBreakdown,
      feeDigest: quote.feeDigest,
      policySnapshot,
      state: STATES.PENDING_PAYMENT,
      createdAt,
      events: [
        {
          type: "BOOKING_CREATED",
          at: createdAt,
          state: STATES.PENDING_PAYMENT
        }
      ]
    };

    bookings.set(bookingId, booking);
    quote.status = "CONSUMED";
    persistRuntimeStore("booking_created");

    const notificationsQueued = enqueueBookingNotifications(booking, "BOOKING_CREATED");

    return send(res, 201, { ...booking, notificationsQueued });
  }

  if (req.method === "POST" && req.url === "/v1/payments/intents") {
    const body = await parseBody(req);
    const booking = bookings.get(body.bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });
    if (booking.state !== STATES.PENDING_PAYMENT) {
      return send(res, 409, { error: "BOOKING_NOT_PENDING_PAYMENT", state: booking.state });
    }

    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!idempotencyKey) return send(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });

    const scopeKey = `payment_intent:create:${booking.bookingId}:${idempotencyKey}`;
    const prior = getIdempotency(scopeKey);
    if (prior) return send(res, 200, { ...prior.payload, idempotentReplay: true });

    const paymentIntentId = `pi_${randomUUID()}`;
    const intent = {
      paymentIntentId,
      bookingId: booking.bookingId,
      quoteId: booking.quoteId,
      amount: Number(body.amount || booking.feeBreakdown?.total || 0),
      currency: body.currency || "USD",
      status: "REQUIRES_CONFIRMATION",
      createdAt: new Date().toISOString(),
      idempotencyKey
    };

    paymentIntents.set(paymentIntentId, intent);
    persistRuntimeStore("payment_intent_created");
    recordIdempotency(scopeKey, intent);

    return send(res, 201, intent);
  }

  if (req.method === "POST" && req.url?.match(/^\/v1\/payments\/intents\/[^/]+\/confirm$/)) {
    const paymentIntentId = req.url.split("/")[4];
    const intent = paymentIntents.get(paymentIntentId);
    if (!intent) return send(res, 404, { error: "PAYMENT_INTENT_NOT_FOUND" });

    const body = await parseBody(req);
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    if (!idempotencyKey) return send(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });

    const scopeKey = `payment_intent:confirm:${paymentIntentId}:${idempotencyKey}`;
    const prior = getIdempotency(scopeKey);
    if (prior) return send(res, 200, { ...prior.payload, idempotentReplay: true });

    if (intent.status === "SUCCEEDED") {
      recordIdempotency(scopeKey, intent);
      return send(res, 200, { ...intent, idempotentReplay: true });
    }

    intent.status = "SUCCEEDED";
    intent.confirmedAt = new Date().toISOString();
    intent.confirmationIdempotencyKey = idempotencyKey;
    persistRuntimeStore("payment_intent_confirmed");

    recordIdempotency(scopeKey, intent);
    return send(res, 200, intent);
  }

  if (req.method === "GET" && req.url?.startsWith("/v1/bookings/")) {
    const bookingId = req.url.split("/").pop();
    const booking = bookings.get(bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });
    return send(res, 200, booking);
  }

  if (req.method === "GET" && req.url?.match(/^\/v1\/payouts\/[^/]+$/)) {
    const payoutId = req.url.split("/").pop();
    const payout = payoutRecords.get(payoutId);
    if (!payout) return send(res, 404, { error: "PAYOUT_NOT_FOUND" });

    return send(res, 200, {
      ...payout,
      eta: payoutEtaFromCapture(payout.capturedAt)
    });
  }

  if (req.method === "GET" && req.url?.startsWith("/v1/hosts/") && req.url.includes("/payouts")) {
    const [pathname, query = ""] = req.url.split("?");
    const pathParts = pathname.split("/");
    const hostId = decodeURIComponent(pathParts[3] || "");
    if (!hostId) return send(res, 400, { error: "HOST_ID_REQUIRED" });

    const searchParams = new URLSearchParams(query);
    const status = searchParams.get("status");
    const limit = Number(searchParams.get("limit") || 50);

    let rows = Array.from(payoutRecords.values()).filter((x) => x.hostId === hostId);
    if (status) rows = rows.filter((x) => x.state === status);

    rows = rows
      .sort((a, b) => Number(b.estimatedAvailableAtMs || 0) - Number(a.estimatedAvailableAtMs || 0))
      .slice(0, limit)
      .map((row) => ({
        ...row,
        eta: payoutEtaFromCapture(row.capturedAt)
      }));

    return send(res, 200, { hostId, count: rows.length, payouts: rows });
  }

  if (req.method === "POST" && req.url?.match(/^\/v1\/bookings\/[^/]+\/confirm$/)) {
    const bookingId = req.url.split("/")[3];
    const booking = bookings.get(bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });

    const body = await parseBody(req);
    const idempotencyKey = String(body.idempotencyKey || "").trim();
    const paymentIntentId = String(body.paymentIntentId || "").trim();

    if (!idempotencyKey) return send(res, 400, { error: "IDEMPOTENCY_KEY_REQUIRED" });
    if (!paymentIntentId) return send(res, 400, { error: "PAYMENT_INTENT_REQUIRED" });

    const scopeKey = `booking:confirm:${bookingId}:${idempotencyKey}`;
    const prior = getIdempotency(scopeKey);
    if (prior) return send(res, 200, { ...prior.payload, idempotentReplay: true });

    if (booking.state !== STATES.PENDING_PAYMENT) {
      return send(res, 409, { error: "INVALID_STATE_TRANSITION", state: booking.state });
    }

    const intent = paymentIntents.get(paymentIntentId);
    if (!intent) return send(res, 404, { error: "PAYMENT_INTENT_NOT_FOUND" });
    if (intent.bookingId !== booking.bookingId) {
      return send(res, 409, { error: "PAYMENT_INTENT_BOOKING_MISMATCH" });
    }
    if (intent.status !== "SUCCEEDED") {
      return send(res, 409, { error: "PAYMENT_NOT_CAPTURED", paymentStatus: intent.status });
    }

    booking.payment = {
      paymentIntentId: intent.paymentIntentId,
      amount: intent.amount,
      currency: intent.currency,
      capturedAt: intent.confirmedAt,
      idempotencyKey
    };

    const payoutId = `po_${randomUUID()}`;
    const payoutEta = payoutEtaFromCapture(intent.confirmedAt);
    const payout = {
      payoutId,
      bookingId: booking.bookingId,
      hostId: booking.hostId,
      paymentIntentId: intent.paymentIntentId,
      amount: intent.amount,
      currency: intent.currency,
      state: "PENDING_RELEASE",
      holdHours: payoutEta.holdHours,
      capturedAt: payoutEta.capturedAt,
      estimatedAvailableAt: payoutEta.estimatedAvailableAt,
      estimatedAvailableAtMs: payoutEta.estimatedAvailableAtMs,
      createdAt: new Date().toISOString(),
      releasedAt: null
    };
    payoutRecords.set(payoutId, payout);

    booking.payout = {
      payoutId,
      state: payout.state,
      estimatedAvailableAt: payout.estimatedAvailableAt,
      holdHours: payout.holdHours
    };

    booking.state = STATES.CONFIRMED;
    const event = { type: "BOOKING_CONFIRMED", at: new Date().toISOString(), state: booking.state };
    booking.events.push(event);
    persistRuntimeStore("booking_confirmed");

    const payload = { ...booking, notificationsQueued: enqueueBookingNotifications(booking, event.type) };
    recordIdempotency(scopeKey, payload);
    return send(res, 200, payload);
  }

  if (req.method === "POST" && req.url?.match(/^\/v1\/bookings\/[^/]+\/cancel$/)) {
    const bookingId = req.url.split("/")[3];
    const booking = bookings.get(bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });

    if (booking.state === STATES.CANCELLED) {
      return send(res, 409, { error: "ALREADY_CANCELLED" });
    }

    booking.state = STATES.CANCELLED;
    const event = { type: "BOOKING_CANCELLED", at: new Date().toISOString(), state: booking.state };
    booking.events.push(event);
    persistRuntimeStore("booking_cancelled");

    const notificationsQueued = enqueueBookingNotifications(booking, event.type);
    return send(res, 200, { ...booking, notificationsQueued });
  }

  if (req.method === "POST" && req.url === "/v1/payouts/reconcile") {
    const body = await parseBody(req);
    const limit = Number(body.limit || 50);
    const source = String(body.source || "manual");
    return send(res, 200, reconcileDuePayouts({ limit, source }));
  }

  if (req.method === "GET" && req.url?.startsWith("/v1/payouts/reconciliation-events")) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const limit = Number(url.searchParams.get("limit") || 100);

    return send(res, 200, {
      count: payoutReconciliationEvents.slice(0, limit).length,
      events: payoutReconciliationEvents.slice(0, limit)
    });
  }

  if (req.method === "POST" && req.url?.match(/^\/v1\/payouts\/[^/]+\/release$/)) {
    const payoutId = req.url.split("/")[3];
    const payout = payoutRecords.get(payoutId);
    if (!payout) return send(res, 404, { error: "PAYOUT_NOT_FOUND" });
    if (payout.state === "RELEASED") return send(res, 409, { error: "PAYOUT_ALREADY_RELEASED" });

    payout.state = "RELEASED";
    payout.releasedAt = new Date().toISOString();
    payout.updatedAt = payout.releasedAt;

    const booking = bookings.get(payout.bookingId);
    if (booking?.payout?.payoutId === payoutId) {
      booking.payout.state = payout.state;
      booking.payout.releasedAt = payout.releasedAt;
    }

    appendPayoutReconciliationEvent({
      eventId: `pre_${randomUUID()}`,
      payoutId: payout.payoutId,
      bookingId: payout.bookingId,
      hostId: payout.hostId,
      type: "PAYOUT_MANUALLY_RELEASED",
      source: "manual_endpoint",
      at: payout.releasedAt,
      amount: payout.amount,
      currency: payout.currency
    });

    persistRuntimeStore("payout_released");
    return send(res, 200, payout);
  }

  if (req.method === "POST" && req.url === "/v1/notifications/dispatch") {
    const body = await parseBody(req);
    const limit = Number(body.limit || 25);
    return send(res, 200, dispatchNotifications({ limit }));
  }

  if (req.method === "POST" && req.url === "/v1/notifications/requeue") {
    const body = await parseBody(req);
    const status = String(body.status || "DEAD_LETTER");
    const limit = Number(body.limit || 50);

    let moved = 0;
    for (const item of notificationQueue) {
      if (moved >= limit) break;
      if (item.status !== status) continue;

      item.status = "QUEUED";
      item.nextAttemptAtMs = nowMs();
      item.updatedAt = new Date().toISOString();
      moved += 1;
    }

    if (moved > 0) persistRuntimeStore(`notifications_requeued:${status}`);

    return send(res, 200, { moved, status, limit });
  }

  if (req.method === "GET" && req.url?.startsWith("/v1/notifications/outbox")) {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const statusFilter = url.searchParams.get("status");
    const limit = Number(url.searchParams.get("limit") || 100);

    let rows = notificationQueue;
    if (statusFilter) rows = rows.filter((x) => x.status === statusFilter);

    return send(res, 200, {
      count: rows.slice(0, limit).length,
      notifications: rows.slice(0, limit)
    });
  }

  if (req.method === "GET" && req.url?.match(/^\/v1\/notification-preferences\/[^/]+$/)) {
    const userId = decodeURIComponent(req.url.split("/").pop());
    return send(res, 200, getNotificationPreferences(userId));
  }

  if (req.method === "PUT" && req.url?.match(/^\/v1\/notification-preferences\/[^/]+$/)) {
    const userId = decodeURIComponent(req.url.split("/").pop());
    const body = await parseBody(req);
    const existing = getNotificationPreferences(userId);

    const next = {
      ...existing,
      channels: { ...existing.channels, ...(body.channels || {}) },
      bookingEvents: { ...existing.bookingEvents, ...(body.bookingEvents || {}) },
      quietHoursOverrideCriticalOnly:
        typeof body.quietHoursOverrideCriticalOnly === "boolean"
          ? body.quietHoursOverrideCriticalOnly
          : existing.quietHoursOverrideCriticalOnly,
      updatedAt: new Date().toISOString()
    };

    notificationPreferences.set(userId, next);
    persistRuntimeStore("notification_preferences_updated");
    return send(res, 200, next);
  }

  return send(res, 404, { error: "NOT_FOUND" });
}

loadRuntimeStore();

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, responseHeaders());
    return res.end();
  }

  handler(req, res).catch((err) => {
    send(res, 400, { error: "BAD_REQUEST", message: err.message });
  });
});

server.listen(PORT, () => {
  console.log(`StayHia API listening on :${PORT}`);
  console.log(`Runtime store: ${STORE_FILE}`);
});
