const MAX_BODY_BYTES = 64 * 1024;
const MAX_ERROR_LENGTH = 1000;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function isValidDelivery(body) {
  return Boolean(
    body &&
      typeof body.deliveryId === "string" &&
      /^[A-Za-z0-9_-]{8,128}$/.test(body.deliveryId) &&
      body.payload &&
      typeof body.payload === "object" &&
      Array.isArray(body.payload.embeds) &&
      body.payload.embeds.length >= 1 &&
      body.payload.embeds.length <= 10,
  );
}

function limitedError(value) {
  return String(value ?? "Unknown error").slice(0, MAX_ERROR_LENGTH);
}

async function retryDelaySeconds(response) {
  for (const headerName of ["retry-after", "x-ratelimit-reset-after"]) {
    const value = Number(response.headers.get(headerName));
    if (Number.isFinite(value) && value > 0) {
      return Math.min(900, Math.max(1, Math.ceil(value)));
    }
  }

  try {
    const body = await response.clone().json();
    const value = Number(body?.retry_after);
    if (Number.isFinite(value) && value > 0) {
      return Math.min(900, Math.max(1, Math.ceil(value)));
    }
  } catch {
    // Discord does not always return a JSON body through every proxy path.
  }

  return response.status === 429 ? 10 : 5;
}

async function setDeliveryStatus(env, deliveryId, status, lastError = null) {
  await env.DB.prepare(
    `UPDATE deliveries
     SET status = ?, updated_at = ?, last_error = ?
     WHERE id = ?`,
  )
    .bind(status, Date.now(), lastError, deliveryId)
    .run();
}

async function enqueueRequest(request, env) {
  if (!env.RELAY_SECRET || !env.DISCORD_WEBHOOK_URL) {
    return json({ error: "Relay secrets are not configured" }, 503);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!safeEqual(authorization, `Bearer ${env.RELAY_SECRET}`)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return json({ error: "Request body is too large" }, 413);
  }

  let body;
  try {
    const rawBody = await request.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return json({ error: "Request body is too large" }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!isValidDelivery(body)) {
    return json({ error: "Invalid delivery payload" }, 400);
  }

  // Never allow a game-controlled payload to ping Discord users or roles.
  body.payload.allowed_mentions = { parse: [] };

  const receipt = await env.DB.prepare(
    "SELECT status FROM deliveries WHERE id = ?",
  )
    .bind(body.deliveryId)
    .first();

  if (receipt?.status === "sent") {
    return json(
      { accepted: true, duplicate: true, deliveryId: body.deliveryId },
      202,
    );
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO deliveries (id, status, created_at, updated_at, last_error)
     VALUES (?, 'queued', ?, ?, NULL)
     ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`,
  )
    .bind(body.deliveryId, now, now)
    .run();

  // Re-enqueuing an accepted ID is safe. The single consumer checks the D1
  // receipt before contacting Discord, covering a lost HTTP acknowledgement.
  await env.SOLO_QUEUE.send({
    deliveryId: body.deliveryId,
    payload: body.payload,
  });

  return json({ accepted: true, deliveryId: body.deliveryId }, 202);
}

async function consumeMessage(message, env) {
  const delivery = message.body;
  const deliveryId = delivery?.deliveryId;
  const payload = delivery?.payload;

  if (!isValidDelivery({ deliveryId, payload })) {
    message.ack();
    return;
  }

  const receipt = await env.DB.prepare(
    "SELECT status FROM deliveries WHERE id = ?",
  )
    .bind(deliveryId)
    .first();

  if (receipt?.status === "sent" || receipt?.status === "failed") {
    message.ack();
    return;
  }

  await setDeliveryStatus(env, deliveryId, "sending");

  try {
    const response = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      await setDeliveryStatus(env, deliveryId, "sent");
      message.ack();
      return;
    }

    const delaySeconds = await retryDelaySeconds(response);
    const responseText = await response.text();
    const failure = limitedError(`HTTP ${response.status}: ${responseText}`);

    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
      await setDeliveryStatus(env, deliveryId, "failed", failure);
      message.ack();
      return;
    }

    await setDeliveryStatus(env, deliveryId, "queued", failure);
    message.retry({ delaySeconds });
  } catch (error) {
    await setDeliveryStatus(env, deliveryId, "queued", limitedError(error));
    message.retry({ delaySeconds: 5 });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "solo-webhook-relay" });
    }

    if (request.method === "POST" && url.pathname === "/solo-result") {
      return enqueueRequest(request, env);
    }

    return json({ error: "Not found" }, 404);
  },

  async queue(batch, env) {
    for (const message of batch.messages) {
      await consumeMessage(message, env);
    }
  },
};
