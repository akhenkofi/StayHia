import http from "node:http";
import { createHash, randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT || 4010);
const QUOTE_TTL_MS = Number(process.env.QUOTE_TTL_MS || 15 * 60 * 1000);

const quotes = new Map();
const bookings = new Map();

const STATES = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  CANCELLED: "CANCELLED"
};

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
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
  return createHash("sha256")
    .update(JSON.stringify(feeBreakdown))
    .digest("hex");
}

function snapshotPolicy(policy) {
  const frozenAt = new Date().toISOString();
  const normalized = {
    cancellationPolicyId: policy?.cancellationPolicyId || "flexible_v1",
    houseRulesVersion: policy?.houseRulesVersion || "default_v1",
    refundTermsVersion: policy?.refundTermsVersion || "refund_v1"
  };

  const hash = createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");

  return { ...normalized, frozenAt, hash };
}

function nowMs() {
  return Date.now();
}

function pruneExpiredQuotes() {
  const ts = nowMs();
  for (const [id, q] of quotes.entries()) {
    if (q.expiresAtMs <= ts || q.status === "CONSUMED") quotes.delete(id);
  }
}

async function handler(req, res) {
  pruneExpiredQuotes();

  if (req.method === "GET" && req.url === "/health") {
    return send(res, 200, { ok: true, service: "stayhia-api", quoteTtlMs: QUOTE_TTL_MS });
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
    return send(res, 201, quote);
  }

  if (req.method === "POST" && req.url === "/v1/bookings") {
    const body = await parseBody(req);
    const quote = quotes.get(body.quoteId);

    if (!quote) return send(res, 404, { error: "QUOTE_NOT_FOUND" });
    if (quote.expiresAtMs <= nowMs()) return send(res, 409, { error: "QUOTE_EXPIRED" });

    const policySnapshot = snapshotPolicy(body.policy);

    const bookingId = `b_${randomUUID()}`;
    const booking = {
      bookingId,
      quoteId: quote.quoteId,
      listingId: quote.listingId,
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
      createdAt: new Date().toISOString(),
      events: [
        {
          type: "BOOKING_CREATED",
          at: new Date().toISOString(),
          state: STATES.PENDING_PAYMENT
        }
      ]
    };

    bookings.set(bookingId, booking);
    quote.status = "CONSUMED";

    return send(res, 201, booking);
  }

  if (req.method === "GET" && req.url?.startsWith("/v1/bookings/")) {
    const bookingId = req.url.split("/").pop();
    const booking = bookings.get(bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });
    return send(res, 200, booking);
  }

  if (req.method === "POST" && req.url?.match(/^\/v1\/bookings\/[^/]+\/confirm$/)) {
    const bookingId = req.url.split("/")[3];
    const booking = bookings.get(bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });

    if (booking.state !== STATES.PENDING_PAYMENT) {
      return send(res, 409, { error: "INVALID_STATE_TRANSITION", state: booking.state });
    }

    booking.state = STATES.CONFIRMED;
    booking.events.push({ type: "BOOKING_CONFIRMED", at: new Date().toISOString(), state: booking.state });
    return send(res, 200, booking);
  }

  if (req.method === "POST" && req.url?.match(/^\/v1\/bookings\/[^/]+\/cancel$/)) {
    const bookingId = req.url.split("/")[3];
    const booking = bookings.get(bookingId);
    if (!booking) return send(res, 404, { error: "BOOKING_NOT_FOUND" });

    if (booking.state === STATES.CANCELLED) {
      return send(res, 409, { error: "ALREADY_CANCELLED" });
    }

    booking.state = STATES.CANCELLED;
    booking.events.push({ type: "BOOKING_CANCELLED", at: new Date().toISOString(), state: booking.state });
    return send(res, 200, booking);
  }

  return send(res, 404, { error: "NOT_FOUND" });
}

const server = http.createServer((req, res) => {
  handler(req, res).catch((err) => {
    send(res, 400, { error: "BAD_REQUEST", message: err.message });
  });
});

server.listen(PORT, () => {
  console.log(`StayHia API listening on :${PORT}`);
});
