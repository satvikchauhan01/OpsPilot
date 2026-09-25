import { Router } from 'express';
import { bus } from './bus.js';

const HEARTBEAT_MS = 20_000;

// Server-Sent Events: one long-lived response per browser tab. Every bus event is written to
// it as `event: <type>`. The heartbeat comment keeps proxies from closing an idle connection.
export function streamRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');

    const send = ({ type, data, at }) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify({ ...data, at })}\n\n`);
    };
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

    bus.on('event', send);
    req.on('close', () => {
      clearInterval(heartbeat);
      bus.off('event', send);
    });
  });

  return router;
}
