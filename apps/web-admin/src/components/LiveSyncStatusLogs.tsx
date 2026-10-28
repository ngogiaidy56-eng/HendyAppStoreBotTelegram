import React, { useEffect, useState } from 'react';

type LiveEvent = { type?: string; action?: string; targetType?: string; targetId?: string; status?: string; at?: number };

export default function LiveSyncStatusLogs({ token }: { token: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'offline'>('connecting');

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | undefined;
    const base = String(import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/$/, '');

    fetch(base + '/api/admin/audit', { headers: { authorization: 'Bearer ' + token } })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || 'Không tải được nhật ký kiểm toán');
        if (!cancelled) setLogs(data.logs || []);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không tải được nhật ký'); });

    if (token) {
      try {
        const wsUrl = new URL('/api/admin/live/ws', base);
        wsUrl.protocol = wsUrl.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(wsUrl, ['hendy-admin-stream-v1', 'hendy-auth.' + token]);
        socket.addEventListener('open', () => { if (!cancelled) { setConnection('connected'); setError(''); } });
        socket.addEventListener('message', (message) => {
          if (cancelled || typeof message.data !== 'string') return;
          let event: LiveEvent;
          try { event = JSON.parse(message.data); } catch { return; }
          if (!event.action || !event.at) return;
          setLogs((current) => [{
            id: 'live-' + event.at + '-' + event.action + '-' + Math.random().toString(36).slice(2, 7),
            action: event.action,
            target_type: event.targetType || event.type || 'system',
            target_id: event.targetId || '',
            status: event.status || '',
            created_at: event.at,
            live: true,
          }, ...current].slice(0, 100));
        });
        socket.addEventListener('error', () => { if (!cancelled) setConnection('offline'); });
        socket.addEventListener('close', () => { if (!cancelled) setConnection('offline'); });
      } catch (cause) {
        setConnection('offline');
        setError(cause instanceof Error ? cause.message : 'Không thể kết nối luồng realtime');
      }
    } else setConnection('offline');

    return () => { cancelled = true; socket?.close(1000, 'component_unmounted'); };
  }, [token]);

  return <section className="panel">
    <h2>Nhật ký đồng bộ và kiểm toán</h2>
    <p role="status">Realtime: {connection === 'connected' ? 'Đang kết nối' : connection === 'connecting' ? 'Đang kết nối…' : 'Ngoại tuyến'}</p>
    {error && <p role="alert">{error}</p>}
    {logs.map((log) => <article key={log.id} className="setting-row">
      <div><b>{log.action}</b><p>{log.target_type}:{log.target_id}{log.status ? ' · ' + log.status : ''}{log.live ? ' · live' : ''}</p></div>
      <small>{new Date(log.created_at * 1000).toLocaleString('vi-VN')}</small>
    </article>)}
  </section>;
}
