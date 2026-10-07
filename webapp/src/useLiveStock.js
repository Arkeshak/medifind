import { useEffect, useRef, useState } from 'react';

const LIVE_URL = import.meta.env.DEV ? 'ws://localhost:8082' : window.configs?.liveUrl;

export function useLiveStock(pharmacyId, onEvent) {
  const [status, setStatus] = useState(LIVE_URL ? 'connecting' : 'off');
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent; // always call the latest handler

  useEffect(() => {
    if (!LIVE_URL) return undefined;
    let ws;
    let retry = 0;
    let timer;
    let stopped = false;

    const connect = () => {
      setStatus(retry === 0 ? 'connecting' : 'reconnecting');
      ws = new WebSocket(LIVE_URL);

      ws.onopen = () => {
        retry = 0;
        setStatus('live');
        ws.send(JSON.stringify({ type: 'subscribe', pharmacyId: pharmacyId ? Number(pharmacyId) : null }));
      };
      ws.onmessage = (msg) => {
        try {
          const data = JSON.parse(msg.data);
          if (data.type === 'stock_changed') onEventRef.current?.(data);
        } catch {
          /* ignore malformed messages */
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setStatus('reconnecting');
        const delay = Math.min(30000, 1000 * 2 ** retry++);
        timer = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, [pharmacyId]);

  return status;
}
