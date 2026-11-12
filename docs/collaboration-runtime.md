# Collaboration runtime setup

The frontend uses the backend's JSON WebSocket endpoint at `/ws`. It does not use STOMP or require a separate Yjs WebSocket service; Yjs document updates are carried through the authenticated room connection.

## Local frontend environment

The frontend defaults to same-origin API, collaboration WebSocket, and audio Socket.IO URLs, which Vite proxies to Spring Boot and the audio service during local development. `VITE_API_URL`, `VITE_SOCKET_URL`, and `VITE_AUDIO_URL` are optional overrides for deployments that use separate public endpoints.

## LiveKit room audio

Room audio uses a separate Node.js/Express/Socket.IO service for authenticated signaling and host moderation, with LiveKit as the SFU for media. The Spring Boot service remains responsible for account tokens and room ownership. The audio service verifies the same HS256 `JWT_SECRET` as Spring Boot and reads `rooms.host_user_id` from PostgreSQL; it does not trust a client-supplied host flag. LiveKit API credentials and access tokens remain on the server.

The service is under `audio-service/`:

```text
audio-service/
  src/config.js       # Environment and database configuration
  src/moderation.js   # Host mute policy
  src/server.js       # Express health route and Socket.IO/LiveKit integration
  test/               # Moderation, configuration, and authorization tests
```

For local development, run a LiveKit server separately. Install the LiveKit server binary for your OS, then run its development server in one terminal:

```powershell
livekit-server --dev --bind 127.0.0.1
```

Use the development API credentials printed or documented by that LiveKit version. In separate PowerShell terminals, set the **same private `JWT_SECRET`** of at least 32 bytes for Spring Boot and the audio service. Configure the Spring Boot database variables as described above. Copy `audio-service/.env.example` to `audio-service/.env`, fill in your local database and LiveKit values, and then start the audio service from the repository root:

```powershell
Copy-Item .\audio-service\.env.example .\audio-service\.env
# Edit audio-service\.env with your local values before starting the service.
npm --prefix .\audio-service install
npm --prefix .\audio-service run dev
```

The audio service listens on port `8090`; Vite proxies `/audio` and its Socket.IO WebSocket there. After the collaboration server confirms room admission, the frontend automatically joins the matching LiveKit room and subscribes to audio without requesting microphone access. Participants can listen but are granted no microphone publishing permission. The verified room host can use **Broadcast** in the room header; selecting it requests microphone permission and publishes audio to current and future room participants. **Stop broadcast** disables the host microphone. The audio service identifies the host from the persisted room owner and the signed account token, never from a client-supplied host flag. Audio signaling reconnects and rejoins automatically, and leaving the classroom disconnects its LiveKit and Socket.IO connections and removes attached audio elements.

Browsers may block audible autoplay until the participant interacts with the page. If that happens, the room header shows **Enable audio**; this resumes playback without requesting microphone access. At most 50 audio participants are admitted to a room by the audio service. Room presence and mute policy are held in the audio service's memory; run one instance unless shared policy state and distributed Socket.IO adapters are configured.

Browser echo cancellation, noise suppression, and automatic gain control are enabled when the host starts broadcasting. Listening never opens or requests access to a participant's microphone.

For deployment, use HTTPS/WSS for the frontend and LiveKit endpoint. LiveKit uses STUN to discover its public address when `rtc.use_external_ip` is enabled and provides an embedded TURN server. A production `livekit.yaml` can enable TURN/TLS as follows; use a trusted certificate and set `turn.domain` to the certificate's hostname:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
turn:
  enabled: true
  domain: turn.example.com
  tls_port: 443
  cert_file: /path/to/turn.crt
  key_file: /path/to/turn.key
```

Allow the LiveKit signaling endpoint and configured TCP/UDP media ports through the firewall. The embedded TURN/TLS listener can use port `443` when it is not behind a load balancer. See the [LiveKit deployment guide](https://docs.livekit.io/transport/self-hosting/deployment/) for current firewall, certificate, and scaling guidance. Microphone capture is restricted by browsers to secure contexts (HTTPS or localhost). A Vite/Cloudflare frontend tunnel does not expose a self-hosted LiveKit server or its media ports; remote participants need a publicly reachable LiveKit deployment. Never put LiveKit API secrets or TURN credentials in frontend environment variables.

## Temporary remote testing with Cloudflare Quick Tunnel

Install `cloudflared` and ensure it is available on `PATH`. Start PostgreSQL and the backend locally first; leave backend port `8080` bound to the local machine. In a second PowerShell window, from the repository root, run:

```powershell
.\scripts\start-quick-tunnel.ps1
```

The script starts a Quick Tunnel to Vite on `127.0.0.1:5173`, then starts Vite with only that exact generated `trycloudflare.com` hostname allowed. Share the printed `https://` URL with your tester. API and WebSocket requests are proxied privately from Vite to `127.0.0.1:8080`; the browser uses `wss://` automatically. Stop the script with Ctrl+C to stop both Vite and the tunnel.

The Vite proxy forwards the local development origin expected by the backend's existing origin allowlist; it does not change backend security rules. Room creation and WebSocket room joining still require valid JWTs, and PostgreSQL is never tunneled. Quick Tunnels are temporary and intended for testing, not production hosting.

## Backend environment

Configure PostgreSQL using `DB_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USERNAME`, and `DB_PASSWORD`. Set `JWT_SECRET` to a private value of at least 32 bytes, and set `ALLOWED_ORIGINS` to a comma-separated list of frontend origins. The backend defaults to port `8080`; override it with `PORT`.

`JWT_SECRET` is required; the backend intentionally has no built-in signing secret. Use a different private value per environment and do not commit it.

## API and collaboration protocol

The API is rooted at `/api`: public authentication endpoints are `POST /api/auth/signup`, `POST /api/auth/signin`, and `POST /api/auth/guest`; authenticated endpoints include `GET` and `PATCH /api/auth/me`, `POST /api/rooms`, `GET /api/rooms/{roomCode}`, `GET /api/history`, and `POST /api/execute`. `GET /api/health` is public. All other API routes require the JWT bearer token retained by the frontend.

Collaboration uses a native JSON WebSocket at `/ws`, not STOMP or SockJS. The WebSocket handshake is permitted, but the client must send a valid JWT in its `join-room` message to join a room; subsequent collaboration messages are processed on that connection.

## Editor and board state

The host is the only participant allowed to change editor files or the whiteboard. This is enforced by the backend as well as by read-only controls in the frontend. Other participants can view and run the shared code.

The backend periodically saves file contents, Yjs editor updates, whiteboard records, chat history (up to the latest 500 messages), and the latest run result in PostgreSQL. The room state is restored when someone rejoins, including after the backend restarts or everyone leaves. Collaboration while a room is active is held in each backend process's memory, so run a single backend instance unless shared/distributed room coordination is added.

## Sandboxed code execution

The `/api/execute` endpoint runs JavaScript, Python, and Java programs in Docker. The backend host must have Docker Engine installed and running, and the backend process must be allowed to use its Docker daemon. Pull the runtime images before accepting requests:

```powershell
docker pull node:22-alpine
docker pull python:3.12-alpine
docker pull eclipse-temurin:21-jdk-alpine
```

Each run uses a fresh container with no network, a read-only source mount and root filesystem, dropped Linux capabilities, no-new-privileges, a 128 MiB memory limit, a half-CPU limit, a 64-process limit, and a five-second default timeout. Standard input is limited to 64 KB; stdout and stderr are each capped at 16 KB. At most two runs execute concurrently. Override the timeout with `EXECUTION_TIMEOUT_SECONDS` (1–30 seconds). Docker images should be pulled ahead of time; the API does not pull images while handling a request.

The Docker daemon socket is highly privileged: access to it can provide host-level control. Run the backend with only the Docker permissions it needs, keep the daemon private, and do not expose its socket to the frontend. These container settings are a basic isolation boundary, not a replacement for a dedicated multi-tenant code-execution service with stronger VM isolation. TypeScript, C/C++, HTML, CSS, JSON, and plain text are editor languages but are not executable by this endpoint.
