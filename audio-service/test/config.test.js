import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.js';
import { normalizeRoomCode } from '../src/server.js';

const validEnvironment = {
  JWT_SECRET: 'test-secret-with-at-least-thirty-two-bytes',
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_API_KEY: 'devkey',
  LIVEKIT_API_SECRET: 'development-secret',
};

test('requires a shared JWT secret and LiveKit server credentials', () => {
  assert.throws(
    () => loadConfig({}),
    /JWT_SECRET, LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET/,
  );
  assert.throws(
    () => loadConfig({ ...validEnvironment, JWT_SECRET: 'too-short' }),
    /at least 32 bytes/,
  );
});

test('loads local database defaults and converts the LiveKit URL for server APIs', () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.liveKitHttpUrl, 'http://localhost:7880');
  assert.equal(config.port, 8090);
  assert.equal(config.database.host, '127.0.0.1');
  assert.equal(config.database.database, 'CodeSync');
  assert.deepEqual(config.allowedOrigins, ['http://localhost:5173', 'http://127.0.0.1:5173']);
});

test('accepts the JDBC PostgreSQL URL used by the Spring backend', () => {
  const config = loadConfig({
    ...validEnvironment,
    DB_URL: 'jdbc:postgresql://127.0.0.1:5432/CodeSync',
  });

  assert.deepEqual(config.database, {
    connectionString: 'postgresql://127.0.0.1:5432/CodeSync',
  });
});

test('validates room codes before querying the room database', () => {
  assert.equal(normalizeRoomCode(' sync-a1b2c3d4 '), 'SYNC-A1B2C3D4');
  assert.equal(normalizeRoomCode(''), null);
  assert.equal(normalizeRoomCode('bad/room'), null);
  assert.equal(normalizeRoomCode(null), null);
});
