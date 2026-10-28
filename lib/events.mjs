import { createServer } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';

export function validSignature(bytes, header, secret) {
  if (typeof header !== 'string' || !/^sha1=[0-9a-f]{40}$/i.test(header)) return false;
  const expected = createHmac('sha1', secret).update(bytes).digest();
  const received = Buffer.from(header.slice(5), 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export async function startEventServer(config, onEvent) {
  const server = createServer(async (req, res) => {
    const respond = (code, body) => {
      if (!res.destroyed) { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); }
    };
    if (req.url === '/healthz' && req.method === 'GET') return respond(200, { status: 'ok' });
    if (req.url !== '/onebot' || req.method !== 'POST') return respond(404, { error: 'not_found' });
    if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return respond(415, { error: 'json_required' });
    if (Number(req.headers['content-length'] ?? 0) > config.maxBytes) return respond(413, { error: 'too_large' });
    const chunks = []; let length = 0;
    try {
      for await (const chunk of req) {
        length += chunk.length;
        if (length > config.maxBytes) { respond(413, { error: 'too_large' }); req.resume(); return; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      if (!validSignature(bytes, req.headers['x-signature'], config.secret)) return respond(401, { error: 'bad_signature' });
      let event;
      try { event = JSON.parse(bytes.toString('utf8')); }
      catch { return respond(400, { error: 'invalid_json' }); }
      if (!event || typeof event !== 'object' || Array.isArray(event)) return respond(400, { error: 'object_required' });
      const result = await onEvent(event);
      respond(result?.busy ? 503 : 200, result?.busy ? { error: 'queue_full' } : {});
    } catch { respond(500, { error: 'event_failed' }); }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.listen(config.port, config.host);
  try { await once(server, 'listening'); }
  catch (error) { server.close(); throw error; }
  return {
    port: server.address().port,
    close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections?.(); }),
  };
}
