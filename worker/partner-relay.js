/**
 * LunaCycle Partner Sync Relay — Cloudflare Worker (Free Tier)
 * Stores privacy-scoped, PIN-protected PartnerSnapshots in KV (`LUNACYCLE_SYNC`)
 * with 30-day TTL, constant-time secret verification, and instant DELETE wipe.
 */

const MAX_BODY_BYTES = 65536;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_FAILED_ATTEMPTS = 15;
const RATE_WINDOW_SECONDS = 60 * 15; // 15 minutes

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-LunaCycle-Pin, X-LunaCycle-Write-Secret',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...CORS_HEADERS,
    },
  });
}

async function constantTimeEqual(a, b) {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a || ''))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b || ''))),
  ]);
  return crypto.subtle.timingSafeEqual(new Uint8Array(hashA), new Uint8Array(hashB));
}

async function readBoundedText(request, maxBytes) {
  const contentLength = Number(request.headers.get('content-length') || '0');
  if (contentLength > maxBytes) {
    return { error: 'Payload too large', status: 413 };
  }
  if (!request.body) {
    return { text: '' };
  }
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return { error: 'Payload too large', status: 413 };
    }
    chunks.push(value);
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(combined) };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'lunacycle-partner-sync' }, 200);
    }

    const careMatch = url.pathname.match(/^\/care\/([A-Z0-9]{6})$/);
    if (careMatch) {
      const code = careMatch[1];
      const partnerKey = `partner:${code}`;
      const careKey = `care:${code}`;
      const pinHeader = request.headers.get('X-LunaCycle-Pin') || '';
      const secretHeader = request.headers.get('X-LunaCycle-Write-Secret') || '';

      const isAuthorizedCareCaller = async (partnerStored) => {
        if (partnerStored.writeSecret && secretHeader) {
          const validSecret = await constantTimeEqual(partnerStored.writeSecret, secretHeader);
          if (validSecret) return true;
        }
        if (partnerStored.pinHash) {
          return constantTimeEqual(partnerStored.pinHash, pinHeader);
        }
        return true;
      };

      if (request.method === 'PUT') {
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `rl:${clientIp}:${code}`;
        const attempts = Number((await env.LUNACYCLE_SYNC.get(rlKey)) || '0');
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          return json({ error: 'Too many failed attempts. Please wait 15 minutes.' }, 429);
        }

        const readRes = await readBoundedText(request, MAX_BODY_BYTES);
        if (readRes.error) return json({ error: readRes.error }, readRes.status);

        const partnerRaw = await env.LUNACYCLE_SYNC.get(partnerKey);
        if (!partnerRaw) {
          await env.LUNACYCLE_SYNC.put(rlKey, String(attempts + 1), {
            expirationTtl: RATE_WINDOW_SECONDS,
          });
          return json({ error: 'Partner code not found' }, 404);
        }
        const partnerStored = JSON.parse(partnerRaw);
        const authorized = await isAuthorizedCareCaller(partnerStored);
        if (!authorized) {
          await env.LUNACYCLE_SYNC.put(rlKey, String(attempts + 1), {
            expirationTtl: RATE_WINDOW_SECONDS,
          });
          return json({ error: 'Invalid PIN or writeSecret' }, 401);
        }

        let body = null;
        try {
          body = JSON.parse(readRes.text);
        } catch {
          body = null;
        }
        if (!body || typeof body !== 'object' || body.e2ee !== true) {
          return json({ error: 'Encrypted care ping payload required' }, 400);
        }

        await env.LUNACYCLE_SYNC.put(careKey, JSON.stringify(body), {
          expirationTtl: 60 * 60 * 24 * 7, // 7 days
        });
        return json({ ok: true }, 200);
      }

      if (request.method === 'GET') {
        const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
        const rlKey = `rl:${clientIp}:${code}`;
        const attempts = Number((await env.LUNACYCLE_SYNC.get(rlKey)) || '0');
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          return json({ error: 'Too many failed attempts. Please wait 15 minutes.' }, 429);
        }

        const partnerRaw = await env.LUNACYCLE_SYNC.get(partnerKey);
        if (!partnerRaw) {
          await env.LUNACYCLE_SYNC.put(rlKey, String(attempts + 1), {
            expirationTtl: RATE_WINDOW_SECONDS,
          });
          return json({ thread: null }, 200);
        }
        const partnerStored = JSON.parse(partnerRaw);
        const authorized = await isAuthorizedCareCaller(partnerStored);
        if (!authorized) {
          await env.LUNACYCLE_SYNC.put(rlKey, String(attempts + 1), {
            expirationTtl: RATE_WINDOW_SECONDS,
          });
          return json({ error: 'Unauthorized' }, 401);
        }
        const rawCare = await env.LUNACYCLE_SYNC.get(careKey);
        if (!rawCare) return json({ thread: null }, 200);
        return json({ thread: JSON.parse(rawCare) }, 200);
      }

      if (request.method === 'DELETE') {
        const partnerRaw = await env.LUNACYCLE_SYNC.get(partnerKey);
        if (!partnerRaw) {
          return json({ error: 'Partner code not found' }, 404);
        }
        const partnerStored = JSON.parse(partnerRaw);
        if (partnerStored.writeSecret) {
          const validSecret = await constantTimeEqual(partnerStored.writeSecret, secretHeader);
          if (!validSecret) return json({ error: 'Unauthorized writeSecret' }, 403);
        }
        await env.LUNACYCLE_SYNC.delete(careKey);
        return json({ ok: true }, 200);
      }

      return json({ error: 'Method not allowed' }, 405);
    }

    const match = url.pathname.match(/^\/sync\/([A-Z0-9]{6})$/);
    if (!match) {
      return json({ error: 'Not found' }, 404);
    }

    const code = match[1];
    const key = `partner:${code}`;
    const pinHeader = request.headers.get('X-LunaCycle-Pin') || '';
    const secretHeader = request.headers.get('X-LunaCycle-Write-Secret') || '';

    if (request.method === 'PUT') {
      const readRes = await readBoundedText(request, MAX_BODY_BYTES);
      if (readRes.error) {
        return json({ error: readRes.error }, readRes.status);
      }

      let body = null;
      try {
        body = JSON.parse(readRes.text);
      } catch {
        body = null;
      }

      if (!body || typeof body !== 'object' || body.e2ee !== true || typeof body.writeSecret !== 'string' || body.writeSecret.length < 16) {
        return json({ error: 'Encrypted E2EE payload required' }, 400);
      }

      const existingRaw = await env.LUNACYCLE_SYNC.get(key);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (existing.writeSecret) {
          const validSecret = await constantTimeEqual(existing.writeSecret, body.writeSecret);
          if (!validSecret) {
            return json({ error: 'Unauthorized writeSecret' }, 403);
          }
        }
      }

      await env.LUNACYCLE_SYNC.put(key, JSON.stringify(body), {
        expirationTtl: TTL_SECONDS,
      });
      return json({ ok: true, updatedAt: body.updatedAt }, 200);
    }

    if (request.method === 'GET') {
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
      const rlKey = `rl:${clientIp}:${code}`;
      const attempts = Number((await env.LUNACYCLE_SYNC.get(rlKey)) || '0');
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        return json({ error: 'Too many failed attempts. Please wait 15 minutes.' }, 429);
      }

      const raw = await env.LUNACYCLE_SYNC.get(key);
      if (!raw) {
        await env.LUNACYCLE_SYNC.put(rlKey, String(attempts + 1), {
          expirationTtl: RATE_WINDOW_SECONDS,
        });
        return json({ error: 'Partner code not found' }, 404);
      }
      const stored = JSON.parse(raw);
      if (stored.pinHash) {
        const validPin = await constantTimeEqual(stored.pinHash, pinHeader);
        if (!validPin) {
          await env.LUNACYCLE_SYNC.put(rlKey, String(attempts + 1), {
            expirationTtl: RATE_WINDOW_SECONDS,
          });
          return json({ error: 'Invalid PIN', pinRequired: true }, 401);
        }
      }
      const { writeSecret: _omit, pinHash: _omitPin, syncKey: _omitKey, ...publicSnapshot } = stored;
      return json(publicSnapshot, 200);
    }

    if (request.method === 'DELETE') {
      const raw = await env.LUNACYCLE_SYNC.get(key);
      if (!raw) {
        return json({ ok: true, deleted: false }, 200);
      }
      const stored = JSON.parse(raw);
      if (stored.writeSecret) {
        const validSecret = await constantTimeEqual(stored.writeSecret, secretHeader);
        if (!validSecret) {
          return json({ error: 'Unauthorized writeSecret' }, 403);
        }
      }
      await Promise.all([
        env.LUNACYCLE_SYNC.delete(key),
        env.LUNACYCLE_SYNC.delete(`care:${code}`),
      ]);
      return json({ ok: true, deleted: true }, 200);
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};
