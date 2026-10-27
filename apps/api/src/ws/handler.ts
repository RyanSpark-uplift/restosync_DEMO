import type { FastifyPluginAsync } from 'fastify';
import { eq, and } from 'drizzle-orm';
import type { JWTPayload } from '../types';
import { joinRoom, leaveRoom, broadcast, type WsClient } from './broadcast';
import { db } from '../db/db';
import { tv_instances } from '../db/schema';

interface WsQuery {
  store_id?: string;
  token?: string;
  device_type?: string;
  role?: string;
  tv_instance_id?: string;
}

const wsPlugin: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: WsQuery }>('/ws', { websocket: true }, async (socket, req) => {
    const { store_id, token, device_type = 'tablet', role, tv_instance_id } = req.query;

    if (!store_id) {
      socket.close(1008, 'MISSING_PARAMS');
      return;
    }

    let resolvedRole = role;

    if (device_type === 'tv' && tv_instance_id && !token) {
      const [inst] = await db
        .select({ store_id: tv_instances.store_id, function_type: tv_instances.function_type })
        .from(tv_instances)
        .where(and(eq(tv_instances.id, tv_instance_id), eq(tv_instances.store_id, store_id)))
        .limit(1);
      if (!inst) { socket.close(1008, 'TV_INSTANCE_NOT_FOUND'); return; }
      resolvedRole = resolvedRole ?? inst.function_type;
    } else {
      if (!token) { socket.close(1008, 'MISSING_PARAMS'); return; }
      try {
        const payload = app.jwt.verify(token) as JWTPayload;
        if (payload.store_id !== store_id) { socket.close(1008, 'STORE_MISMATCH'); return; }
      } catch {
        socket.close(1008, 'UNAUTHORIZED');
        return;
      }
    }

    const client: WsClient = {
      socket: socket as unknown as WsClient['socket'],
      device_type: (device_type === 'tv' ? 'tv' : 'tablet'),
      role: resolvedRole,
      store_id,
    };

    joinRoom(client);

    // 연결 확인 ACK
    socket.send(JSON.stringify({
      event: 'connection:ack',
      store_id,
      ts: new Date().toISOString(),
      payload: { device_type: client.device_type, role },
    }));

    socket.on('message', (raw: Buffer | string) => {
      let msg: { event?: string; payload?: unknown };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return; // 파싱 실패 무시
      }

      switch (msg.event) {
        // TV 생존 신호 (AG-015 연동)
        case 'tv:heartbeat':
          socket.send(JSON.stringify({ event: 'tv:heartbeat:ack', ts: new Date().toISOString(), payload: {} }));
          break;

        // 스태프가 주문 READY 탭 (Tablet → Server → TV②)
        case 'order:mark_ready':
          broadcast(store_id, 'display:order_ready', msg.payload,
            (c) => c.device_type === 'tv' && c.role === 'pickup');
          break;
      }
    });

    socket.on('close', () => leaveRoom(client));
    socket.on('error', () => leaveRoom(client));
  });
};

export default wsPlugin;
