/**
 * GMG ResalesFlow realtime server — partyserver on Cloudflare Workers + Durable Objects.
 *
 * Carries human-facing "who did what" events between admin sessions. Data refresh stays on
 * Supabase Realtime, so if this server is down only these notifications are lost.
 *
 * Rooms  (URL: /parties/main/{room})
 *   property-{id}     property publish/draft changes (later: live property files)
 *   application-{id}  reserved for presence / form edit-collision (follow-ups)
 *
 * Connect (WebSocket): ?ticket=<signed ticket from /api/admin/realtime-ticket>
 *   - Origin must match ALLOWED_ORIGINS (defence in depth; the ticket is the real auth)
 *   - Ticket is HMAC-verified locally with REALTIME_TICKET_SECRET — no database access here
 *
 * Publish (HTTP POST to the room): Authorization: Bearer <REALTIME_PUBLISH_SECRET>
 *   Body is validated against lib/realtime/events.js and re-serialised before broadcast.
 *
 * Config: vars ALLOWED_ORIGINS (wrangler.jsonc); secrets REALTIME_TICKET_SECRET,
 *         REALTIME_PUBLISH_SECRET (`npx wrangler secret put <NAME> [--env test]`).
 */
import { Server, routePartykitRequest } from 'partyserver';
import { verifyTicket, timingSafeEqualString } from '../lib/realtime/ticket';
import { parseRoom, sanitizeEvent } from '../lib/realtime/events';

const MAX_PUBLISH_BYTES = 4096;

/** ALLOWED_ORIGINS is comma-separated; an entry may contain one "*" wildcard (e.g. https://*.vercel.app). */
function isOriginAllowed(origin, allowedOrigins = '') {
  if (!origin) return false;
  return allowedOrigins.split(',').map((o) => o.trim()).filter(Boolean).some((pattern) => {
    if (!pattern.includes('*')) return pattern === origin;
    const [prefix, suffix] = pattern.split('*');
    return origin.startsWith(prefix) && origin.endsWith(suffix) && origin.length > prefix.length + suffix.length;
  });
}

const roomFromUrl = (url) => decodeURIComponent(new URL(url).pathname.split('/').pop() || '');

export class Main extends Server {
  static options = { hibernate: true };

  onConnect(conn, ctx) {
    // Survives hibernation; used to avoid echoing an event back to its author
    conn.setState({
      userId: ctx.request.headers.get('X-Realtime-User'),
      role: ctx.request.headers.get('X-Realtime-Role'),
    });
  }

  onMessage() {
    // Clients are receive-only for now; ignore anything they send.
  }

  async onRequest(req) {
    if (req.method !== 'POST') return new Response(null, { status: 405 });

    const auth = req.headers.get('Authorization') || '';
    const secret = this.env.REALTIME_PUBLISH_SECRET;
    if (!secret || !(await timingSafeEqualString(auth, `Bearer ${secret}`))) {
      return new Response(null, { status: 401 });
    }

    const body = await req.text();
    if (body.length > MAX_PUBLISH_BYTES) return new Response(null, { status: 413 });

    let event;
    try {
      event = sanitizeEvent(JSON.parse(body), this.name);
    } catch {
      event = null;
    }
    if (!event) return new Response(null, { status: 400 });

    const exclude = [];
    for (const conn of this.getConnections()) {
      if (conn.state?.userId === event.actorId) exclude.push(conn.id);
    }
    this.broadcast(JSON.stringify(event), exclude);

    return Response.json({ ok: true });
  }
}

export default {
  async fetch(request, env) {
    // Only known room shapes are routable
    const path = new URL(request.url).pathname;
    if (path.startsWith('/parties/') && !parseRoom(roomFromUrl(request.url))) {
      return new Response(null, { status: 404 });
    }

    const response = await routePartykitRequest(request, env, {
      onBeforeConnect: async (req) => {
        if (!isOriginAllowed(req.headers.get('Origin'), env.ALLOWED_ORIGINS)) {
          return new Response(null, { status: 403 });
        }
        const ticket = new URL(req.url).searchParams.get('ticket');
        const claims = await verifyTicket(ticket, env.REALTIME_TICKET_SECRET);
        if (!claims?.sub) return new Response(null, { status: 401 });

        const authed = new Request(req);
        authed.headers.set('X-Realtime-User', claims.sub);
        authed.headers.set('X-Realtime-Role', claims.role || '');
        return authed;
      },
    });

    return response || new Response(null, { status: 404 });
  },
};
