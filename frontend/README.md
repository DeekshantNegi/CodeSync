# CodeSync frontend

CodeSync is a real-time collaborative coding workspace with authentication, shared rooms, a Monaco editor, a whiteboard, chat, room audio, and containerized code execution.

## Run locally

1. Start PostgreSQL and the Spring Boot backend. Configure `DB_URL` (or `DB_HOST`, `DB_PORT`, `DB_NAME`), `DB_USERNAME`, `DB_PASSWORD`, and a private `JWT_SECRET` of at least 32 bytes.
2. From this directory, install dependencies and start Vite:

   ```powershell
   npm install
   npm run dev
   ```

Vite proxies `/api` and `/ws` to the backend at `127.0.0.1:8080`, and `/audio` to the Node audio service at `127.0.0.1:8090`. Room audio also requires a configured LiveKit server; see [the collaboration runtime guide](../docs/collaboration-runtime.md). For remote browser testing, use HTTPS; browser microphone access is not available on arbitrary insecure origins.

## Build and lint

```powershell
npm run build
npm run lint
```

See [the collaboration runtime guide](../docs/collaboration-runtime.md) for deployment, audio/TURN configuration, and code-execution requirements.
