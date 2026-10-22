# Collaboration runtime setup

The frontend uses the backend's JSON WebSocket endpoint at `/ws`. It does not use STOMP or require a separate Yjs WebSocket service; Yjs document updates are carried through the authenticated room connection.

## Local frontend environment

The frontend defaults to same-origin API and WebSocket URLs, which Vite proxies to Spring Boot during local development. Do not set direct backend URLs when using a Cloudflare Quick Tunnel:

```dotenv
VITE_STUN_URL=stun:stun.l.google.com:19302
```

For deployments where direct peer-to-peer audio is blocked, configure a TURN relay:

```dotenv
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=your-turn-username
VITE_TURN_CREDENTIAL=your-turn-credential
```

The WebSocket URL is built from the page's current hostname and uses `wss://` automatically over HTTPS. `VITE_API_URL` and `VITE_SOCKET_URL` remain optional overrides for deployments that need non-default endpoints.

## Temporary remote testing with Cloudflare Quick Tunnel

Install `cloudflared` and ensure it is available on `PATH`. Start PostgreSQL and the backend locally first; leave backend port `8080` bound to the local machine. In a second PowerShell window, from the repository root, run:

```powershell
.\scripts\start-quick-tunnel.ps1
```

The script starts a Quick Tunnel to Vite on `127.0.0.1:5173`, then starts Vite with only that exact generated `trycloudflare.com` hostname allowed. Share the printed `https://` URL with your tester. API and WebSocket requests are proxied privately from Vite to `127.0.0.1:8080`; the browser uses `wss://` automatically. Stop the script with Ctrl+C to stop both Vite and the tunnel.

The Vite proxy forwards the local development origin expected by the backend's existing origin allowlist; it does not change backend security rules. Room creation and WebSocket room joining still require valid JWTs, and PostgreSQL is never tunneled. Quick Tunnels are temporary and intended for testing, not production hosting.

## Backend environment

Configure PostgreSQL using `DB_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, and `DB_PASSWORD`. Set `JWT_SECRET` to a private value of at least 32 bytes, and set `ALLOWED_ORIGINS` to a comma-separated list of frontend origins. The backend defaults to port `8080`; override it with `PORT`.

## API and collaboration protocol

The API is rooted at `/api`: public authentication endpoints are `POST /api/auth/signup`, `POST /api/auth/signin`, and `POST /api/auth/guest`; authenticated endpoints include `GET` and `PATCH /api/auth/me`, `POST /api/rooms`, `GET /api/rooms/{roomCode}`, `GET /api/history`, and `POST /api/execute`. `GET /api/health` is public. All other API routes require the JWT bearer token retained by the frontend.

Collaboration uses a native JSON WebSocket at `/ws`, not STOMP or SockJS. The WebSocket handshake is permitted, but the client must send a valid JWT in its `join-room` message to join a room; subsequent collaboration messages are processed on that connection.

## Editor and board state

Yjs editor documents and whiteboard records are held in backend memory for the active room. Participants joining an active room receive the current editor state, language metadata, whiteboard state, and latest run result. Restarting the backend or leaving with no participants discards this collaboration state; it is not persisted in PostgreSQL.

## Sandboxed code execution

The `/api/execute` endpoint runs JavaScript, Python, and Java programs in Docker. The backend host must have Docker Engine installed and running, and the backend process must be allowed to use its Docker daemon. Pull the runtime images before accepting requests:

```powershell
docker pull node:22-alpine
docker pull python:3.12-alpine
docker pull eclipse-temurin:21-jdk-alpine
```

Each run uses a fresh container with no network, a read-only source mount and root filesystem, dropped Linux capabilities, no-new-privileges, a 128 MiB memory limit, a half-CPU limit, a 64-process limit, and a five-second default timeout. Standard input is limited to 64 KB; stdout and stderr are each capped at 16 KB. At most two runs execute concurrently. Override the timeout with `EXECUTION_TIMEOUT_SECONDS` (1–30 seconds). Docker images should be pulled ahead of time; the API does not pull images while handling a request.

The Docker daemon socket is highly privileged: access to it can provide host-level control. Run the backend with only the Docker permissions it needs, keep the daemon private, and do not expose its socket to the frontend. These container settings are a basic isolation boundary, not a replacement for a dedicated multi-tenant code-execution service with stronger VM isolation. TypeScript, C/C++, HTML, CSS, JSON, and plain text are editor languages but are not executable by this endpoint.
