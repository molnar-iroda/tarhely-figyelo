// A helyi kezelőfelület: 127.0.0.1-re kötött HTTP-kiszolgáló, ami a
// beállításokat, az állapotot és a műveleteket adja a böngészőnek. Védelem:
// csak helyi cím; indításonként új, véletlen belépőkulcs (süti); a módosító
// kérések külön fejlécet kérnek (idegen oldal nem tud ilyet küldeni).

import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { join } from "node:path";

import { type Api, type ApiDeps, type ApiResult, buildApi } from "./api.ts";
import { createOperations, type Operations } from "./operations.ts";

const STATIC_FILES: Readonly<Record<string, { file: string; type: string }>> = {
  "/": { file: "index.html", type: "text/html; charset=utf-8" },
  "/app.js": { file: "app.js", type: "text/javascript; charset=utf-8" },
  "/style.css": { file: "style.css", type: "text/css; charset=utf-8" }
};

const COOKIE = "tarhely_felulet";
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const MAX_BODY_BYTES = 1024 * 1024;

export interface UiOptions {
  readonly projectDir: string;
  readonly cliPath: string;
  readonly configPath: string;
  readonly port: number;
  readonly idleLimitMs?: number;
  readonly deps?: Partial<ApiDeps>;
  readonly operations?: Operations;
  /** Hívás, ha a kiszolgáló tétlenség miatt leáll. */
  readonly onIdle?: () => void;
}

export interface UiServer {
  readonly server: Server;
  readonly token: string;
  readonly port: number;
  close(): Promise<void>;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookie(request: IncomingMessage, name: string): string | null {
  for (const part of (request.headers.cookie ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      return rest.join("=");
    }
  }
  return null;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("A kérés túl nagy.");
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text === "" ? {} : JSON.parse(text);
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer, extra: Record<string, string> = {}): void {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    ...extra
  });
  response.end(body);
}

export async function startUi(options: UiOptions): Promise<UiServer> {
  const token = randomBytes(24).toString("hex");
  let lastActivity = Date.now();
  let operations: Operations | null = options.operations ?? null;
  // A megszakított futás zárfájlját takarítjuk, különben a következő futás „már fut”-ot jelezne.
  const getOperations = (): Operations => {
    operations ??= createOperations(options.cliPath, options.projectDir, options.configPath, () => {
      try {
        const lock = api.lockPath();
        if (lock !== null && existsSync(lock)) {
          unlinkSync(lock);
        }
      } catch {
        // a zárfájl takarítása nem fontos
      }
    });
    return operations;
  };
  const api: Api = buildApi({
    projectDir: options.projectDir,
    configPath: options.configPath,
    operations: { start: (r) => getOperations().start(r), view: () => getOperations().view(), stop: () => getOperations().stop() },
    ...options.deps
  });

  const server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      send(response, 500, "application/json; charset=utf-8", JSON.stringify({ hiba: error instanceof Error ? error.message : String(error) }));
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? "/", "http://localhost");
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : options.port;
    const host = request.headers.host ?? "";
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) {
      send(response, 403, "text/plain; charset=utf-8", "Tiltott cím.");
      return;
    }
    // Belépés: a megnyitó hivatkozás kulcsa süti lesz, és tiszta címre irányít.
    const given = url.searchParams.get("k");
    if (given !== null) {
      if (safeEqual(given, token)) {
        send(response, 302, "text/plain; charset=utf-8", "", {
          location: "/",
          "set-cookie": `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict`
        });
      } else {
        send(response, 403, "text/plain; charset=utf-8", "Érvénytelen belépőkulcs. Nyisd meg újra a Tárhely-figyelőt az asztali ikonnal.");
      }
      return;
    }
    const cookie = readCookie(request, COOKIE);
    if (cookie === null || !safeEqual(cookie, token)) {
      send(response, 403, "text/plain; charset=utf-8", "Nincs belépve. Nyisd meg a Tárhely-figyelőt az asztali ikonnal.");
      return;
    }
    lastActivity = Date.now();

    if (request.method === "GET" && STATIC_FILES[url.pathname] !== undefined) {
      const entry = STATIC_FILES[url.pathname];
      if (entry !== undefined) {
        send(response, 200, entry.type, readFileSync(join(options.projectDir, "src", "ui", "public", entry.file)));
        return;
      }
    }
    if (!url.pathname.startsWith("/api/")) {
      send(response, 404, "text/plain; charset=utf-8", "Nincs ilyen oldal.");
      return;
    }
    const mutating = request.method !== "GET";
    if (mutating && request.headers["x-tarhely"] !== "1") {
      send(response, 403, "application/json; charset=utf-8", JSON.stringify({ hiba: "Hiányzó kérésfejléc." }));
      return;
    }
    const body = mutating ? await readBody(request) : {};
    const result: ApiResult = await api.handle(request.method ?? "GET", url.pathname, url.searchParams, body);
    if (result.file !== undefined) {
      send(response, result.status, result.file.type, result.file.content, {
        "content-disposition": `attachment; filename="${result.file.name}"`
      });
      return;
    }
    send(response, result.status, "application/json; charset=utf-8", JSON.stringify(result.body));
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : options.port;

  const idleLimit = options.idleLimitMs ?? IDLE_LIMIT_MS;
  const timer = setInterval(() => {
    if (Date.now() - lastActivity > idleLimit && !(operations?.view().running ?? false)) {
      options.onIdle?.();
    }
  }, Math.min(60_000, Math.max(50, idleLimit / 4)));
  timer.unref();

  return {
    server,
    token,
    port,
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(timer);
        server.closeAllConnections();
        server.close(() => resolve());
      })
  };
}
