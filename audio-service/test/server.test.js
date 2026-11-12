import test from 'node:test';
import assert from 'node:assert/strict';
import { SignJWT, jwtVerify } from 'jose';
import { io as createSocketClient } from 'socket.io-client';
import { createAudioService } from '../src/server.js';

const jwtSecret = 'test-secret-with-at-least-thirty-two-bytes';

async function createToken(userId, secret = jwtSecret, algorithm = 'HS256') {
  return new SignJWT({ displayName: userId })
    .setProtectedHeader({ alg: algorithm })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

function connectClient(url, token) {
  const socket = createSocketClient(url, {
    auth: { token },
    forceNew: true,
    path: '/socket.io',
    reconnection: false,
    transports: ['websocket'],
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function request(socket, event, payload) {
  return new Promise((resolve) => {
    if (payload === undefined) socket.emit(event, resolve);
    else socket.emit(event, payload, resolve);
  });
}

test('only the persisted room host can mute, allow, or mute all participants', async (t) => {
  const permissionUpdates = [];
  const pool = {
    query: async (_query, [roomCode, status]) => ({
      rows: roomCode === 'ROOM-123' && status === 'ACTIVE'
        ? [{ room_code: roomCode, host_user_id: 'host-user' }]
        : [],
    }),
    end: async () => {},
  };
  const roomService = {
    updateParticipant: async (...args) => permissionUpdates.push(args),
    getParticipant: async () => ({ tracks: [] }),
    mutePublishedTrack: async () => {},
  };
  const service = createAudioService({
    config: {
      allowedOrigins: ['http://localhost:5173'],
      jwtSecret,
      liveKitHttpUrl: 'http://localhost:7880',
      liveKitApiKey: 'devkey',
      liveKitApiSecret: 'development-secret',
      liveKitUrl: 'ws://localhost:7880',
      database: {},
      databaseMaxConnections: 1,
      port: 0,
    },
    pool,
    roomService,
    logger: { error: (message, error) => assert.fail(`${message}: ${error}`) },
  });
  const address = await service.listen(0);
  const url = `http://127.0.0.1:${address.port}`;
  const clients = [];

  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await service.close();
  });

  const host = await connectClient(url, await createToken('host-user'));
  clients.push(host);
  const participant = await connectClient(url, await createToken('student-user'));
  clients.push(participant);

  const hostJoin = await request(host, 'audio:join', { roomId: 'ROOM-123' });
  const participantJoin = await request(participant, 'audio:join', { roomId: 'room-123' });
  assert.equal(hostJoin.ok, true);
  assert.equal(hostJoin.isHost, true);
  assert.equal(participantJoin.ok, true);
  assert.equal(participantJoin.isHost, false);
  const hostClaims = await jwtVerify(hostJoin.token, new TextEncoder().encode('development-secret'));
  const participantClaims = await jwtVerify(
    participantJoin.token,
    new TextEncoder().encode('development-secret'),
  );
  assert.equal(hostClaims.payload.video.canPublish, true);
  assert.equal(hostClaims.payload.video.canSubscribe, true);
  assert.equal(participantClaims.payload.video.canPublish, false);
  assert.equal(participantClaims.payload.video.canSubscribe, true);

  const forgedHostAction = await request(participant, 'audio:moderate', {
    identity: hostJoin.identity,
    muted: true,
  });
  assert.equal(forgedHostAction.ok, false);

  const mute = await request(host, 'audio:moderate', {
    identity: participantJoin.identity,
    muted: true,
  });
  assert.equal(mute.ok, true);
  assert.equal(permissionUpdates.at(-1)[2].permission.canPublish, false);
  assert.equal((await request(participant, 'audio:mute', { muted: false })).ok, false);

  assert.equal((await request(host, 'audio:moderate', {
    identity: participantJoin.identity,
    muted: false,
  })).ok, true);
  assert.equal(permissionUpdates.at(-1)[2].permission.canPublish, false);
  assert.equal((await request(host, 'audio:mute-all', { muted: true })).ok, true);
  assert.equal(permissionUpdates.at(-1)[2].permission.canPublish, false);
  assert.equal((await request(host, 'audio:mute', { muted: false })).ok, true);
});

test('notifies current room members when late participants join, leave, and reconnect', async (t) => {
  const pool = {
    query: async (_query, [roomCode, status]) => ({
      rows: roomCode === 'ROOM-123' && status === 'ACTIVE'
        ? [{ room_code: roomCode, host_user_id: 'host-user' }]
        : [],
    }),
    end: async () => {},
  };
  const service = createAudioService({
    config: {
      allowedOrigins: [],
      jwtSecret,
      liveKitHttpUrl: 'http://localhost:7880',
      liveKitApiKey: 'devkey',
      liveKitApiSecret: 'development-secret',
      liveKitUrl: 'ws://localhost:7880',
      database: {},
      databaseMaxConnections: 1,
      port: 0,
    },
    pool,
    roomService: {},
    logger: { error: (message, error) => assert.fail(`${message}: ${error}`) },
  });
  const address = await service.listen(0);
  const url = `http://127.0.0.1:${address.port}`;
  const clients = [];

  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await service.close();
  });

  const host = await connectClient(url, await createToken('host-user'));
  clients.push(host);
  assert.equal((await request(host, 'audio:join', { roomId: 'ROOM-123' })).ok, true);

  const participantCount = new Promise((resolve) => {
    host.once('audio:participants', ({ participants }) => resolve(participants.length));
  });
  const participant = await connectClient(url, await createToken('student-user'));
  clients.push(participant);
  assert.equal((await request(participant, 'audio:join', { roomId: 'ROOM-123' })).ok, true);
  assert.equal(await participantCount, 2);

  const leftCount = new Promise((resolve) => {
    host.once('audio:participants', ({ participants }) => resolve(participants.length));
  });
  assert.deepEqual(await request(participant, 'audio:leave'), { ok: true });
  assert.equal(await leftCount, 1);

  const rejoinedCount = new Promise((resolve) => {
    host.once('audio:participants', ({ participants }) => resolve(participants.length));
  });
  assert.equal((await request(participant, 'audio:join', { roomId: 'ROOM-123' })).ok, true);
  assert.equal(await rejoinedCount, 2);

  const remainingCount = new Promise((resolve) => {
    host.once('audio:participants', ({ participants }) => resolve(participants.length));
  });
  participant.disconnect();
  assert.equal(await remainingCount, 1);
});

test('rejects invalid JWTs before allowing a socket connection', async (t) => {
  const service = createAudioService({
    config: {
      allowedOrigins: [],
      jwtSecret,
      liveKitHttpUrl: 'http://localhost:7880',
      liveKitApiKey: 'devkey',
      liveKitApiSecret: 'development-secret',
      liveKitUrl: 'ws://localhost:7880',
      database: {},
      databaseMaxConnections: 1,
      port: 0,
    },
    pool: { query: async () => ({ rows: [] }), end: async () => {} },
    roomService: {},
    logger: { error: () => {} },
  });
  const address = await service.listen(0);

  t.after(() => service.close());

  const socket = createSocketClient(`http://127.0.0.1:${address.port}`, {
    auth: { token: 'not-a-valid-jwt' },
    forceNew: true,
    path: '/socket.io',
    reconnection: false,
    transports: ['websocket'],
  });
  t.after(() => socket.disconnect());

  await assert.rejects(new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  }), /sign-in has expired/);
});

test('accepts HS512 JWTs signed with a 512-bit backend secret', async (t) => {
  const longJwtSecret = 'a'.repeat(64);
  const service = createAudioService({
    config: {
      allowedOrigins: [],
      jwtSecret: longJwtSecret,
      liveKitHttpUrl: 'http://localhost:7880',
      liveKitApiKey: 'devkey',
      liveKitApiSecret: 'development-secret',
      liveKitUrl: 'ws://localhost:7880',
      database: {},
      databaseMaxConnections: 1,
      port: 0,
    },
    pool: { query: async () => ({ rows: [] }), end: async () => {} },
    roomService: {},
  });
  const address = await service.listen(0);

  t.after(() => service.close());

  const socket = await connectClient(
    `http://127.0.0.1:${address.port}`,
    await createToken('backend-user', longJwtSecret, 'HS512'),
  );
  t.after(() => socket.disconnect());
  assert.equal(socket.connected, true);
});
