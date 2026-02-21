import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { notificationBus } from "@/lib/notification-bus";

// Required so Next.js route validator recognizes this as a valid route module
export function GET() {
  return new Response("WebSocket endpoint", { status: 426 });
}

export interface TaggedWebSocket extends WebSocket {
  userId: string;
  organizationId: string;
  role: string;
  isAlive: boolean;
}

// Track all authenticated clients in a Set so the bus listener can broadcast
const clients = new Set<TaggedWebSocket>();

// Single listener on the global bus — broadcasts to matching org clients
notificationBus.on("notification", (notification: { organizationId: string }) => {
  const payload = JSON.stringify({ type: "notification", data: notification });
  for (const client of clients) {
    if (
      client.organizationId === notification.organizationId &&
      client.readyState === 1 // OPEN
    ) {
      client.send(payload);
    }
  }
});

/**
 * Resolve the session token from the Next.js cookie store.
 * better-auth uses chunked cookies for large tokens (.0, .1, …)
 * and prefixes with __Secure- when useSecureCookies is enabled.
 */
function getSessionToken(cookieStore: Awaited<ReturnType<typeof cookies>>): string | undefined {
  const isSecure = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://");
  const prefix = isSecure ? "__Secure-" : "";
  const baseName = `${prefix}better-auth.session_token`;

  // Try single cookie first
  let raw = cookieStore.get(baseName)?.value;

  // Try chunked cookies (.0, .1, .2, …)
  if (!raw) {
    let chunked = "";
    for (let i = 0; ; i++) {
      const chunk = cookieStore.get(`${baseName}.${i}`)?.value;
      if (!chunk) break;
      chunked += chunk;
    }
    if (chunked) raw = chunked;
  }

  if (!raw) return undefined;

  // better-auth signs cookies as "token.signature" — strip the signature
  const dotIndex = raw.indexOf(".");
  return dotIndex > 0 ? raw.substring(0, dotIndex) : raw;
}

export function UPGRADE(ws: WebSocket, _server: unknown, _request: IncomingMessage) {
  const client = ws as TaggedWebSocket;
  client.isAlive = true;

  (async () => {
    try {
      // next-ws patches cookies() to resolve WebSocket request cookies
      const cookieStore = await cookies();

      const sessionToken = getSessionToken(cookieStore);
      if (!sessionToken) {
        ws.close(4001, "No session token");
        return;
      }

      // Look up session in DB
      const session = await db.session.findUnique({
        where: { token: sessionToken },
        select: { userId: true, expiresAt: true },
      });

      if (!session || session.expiresAt < new Date()) {
        ws.close(4001, "Invalid or expired session");
        return;
      }

      // Get org membership
      const activeOrgId = cookieStore.get("active-org-id")?.value;

      const membership = activeOrgId
        ? await db.organizationMember.findFirst({
            where: { userId: session.userId, organizationId: activeOrgId },
            select: { organizationId: true, role: true },
          })
        : await db.organizationMember.findFirst({
            where: { userId: session.userId },
            select: { organizationId: true, role: true },
          });

      if (!membership) {
        ws.close(4001, "No organization");
        return;
      }

      const isAdminOrOwner = membership.role === "owner" || membership.role === "admin";
      if (!isAdminOrOwner) {
        ws.close(4003, "Insufficient role");
        return;
      }

      client.userId = session.userId;
      client.organizationId = membership.organizationId;
      client.role = membership.role;

      clients.add(client);

      // Ping/pong keepalive
      const pingInterval = setInterval(() => {
        if (!client.isAlive) {
          clearInterval(pingInterval);
          ws.terminate();
          return;
        }
        client.isAlive = false;
        ws.ping();
      }, 30_000);

      ws.on("pong", () => {
        client.isAlive = true;
      });

      ws.on("close", () => {
        clearInterval(pingInterval);
        clients.delete(client);
      });

      ws.send(JSON.stringify({ type: "connected" }));
    } catch (err) {
      console.error("[WS] Auth error:", err);
      ws.close(4500, "Auth error");
    }
  })();
}
