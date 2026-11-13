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
    // 必须同时等 error。
    //
    // 以前只 await once(server, 'listening')。端口被占用（EADDRINUSE）走的是
    // 'error' 事件，没有监听器时 Node 会把它抛成未捕获异常，
    // 而 'listening' 那个 Promise 永远不完成 ——
    // 于是 runtime.start() 想把端口冲突收成 bootError 留住面板，这条路径接不住，
    // 托管模式的表现就是「扫码完了接入自己崩了」。
    try {
      await new Promise((resolve, reject) => {
        const onListening = () => { server.off('error', onError); resolve(); };
        const onError = (error) => { server.off('listening', onListening); reject(error); };
        server.once('listening', onListening);
        server.once('error', onError);
      });
    } catch (error) {
      try { server.close(); } catch {}
      const hint = error?.code === 'EADDRINUSE'
        ? `事件端口 ${config.port} 已被占用；请关掉占用它的程序，或改 events.port。`
        : String(error?.message ?? error);
      throw new Error(hint);
    }
  return {
    port: server.address().port,
    close: () => new Promise(resolve => { server.close(resolve); server.closeIdleConnections?.(); }),
  };
}
