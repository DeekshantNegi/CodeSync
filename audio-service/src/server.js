import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { Pool } from 'pg';
import { jwtVerify } from 'jose';
import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { isUserMutedByHost, setUserMutePolicy } from './moderation.js';

const MAX_ROOM_PARTICIPANTS = 50;

function getJwtAlgorithm(secret) {
  const keyLength = Buffer.byteLength(secret, 'utf8');
  if (keyLength >= 64) return 'HS512';
  if (keyLength >= 48) return 'HS384';
  return 'HS256';
}

export function normalizeRoomCode(value) {
  if (typeof value !== 'string') return null;
  const roomCode = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{1,32}$/.test(roomCode) ? roomCode : null;
}

export function createAudioService({
  config = loadConfig(),
  pool = new Pool({ ...config.database, max: config.databaseMaxConnections }),
  roomService = new RoomServiceClient(
    config.liveKitHttpUrl,
    config.liveKitApiKey,
    config.liveKitApiSecret,
  ),
  logger = console,
} = {}) {
  const app = express();
  app.get('/health', (_request, response) => response.json({ service: 'codesync-audio', status: 'UP' }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: config.allowedOrigins, methods: ['GET', 'POST'] },
    path: '/socket.io',
  });
  const roomMembers = new Map();
  const roomPolicies = new Map();
  const jwtKey = new TextEncoder().encode(config.jwtSecret);
  const jwtAlgorithm = getJwtAlgorithm(config.jwtSecret);

  const findActiveRoom = async (roomCode) => {
    const result = await pool.query(
      'SELECT room_code, host_user_id FROM rooms WHERE room_code = $1 AND status = $2',
      [roomCode, 'ACTIVE'],
    );
    return result.rows[0] || null;
  };

  const getPolicy = (roomCode) => {
    let policy = roomPolicies.get(roomCode);
    if (!policy) {
      policy = { muteAll: false, mutedUsers: new Set(), allowedUsers: new Set() };
      roomPolicies.set(roomCode, policy);
    }
    return policy;
  };

  const isMutedByHost = (roomCode, userId) => {
    return isUserMutedByHost(getPolicy(roomCode), userId);
  };

  const getMembers = (roomCode) => {
    let members = roomMembers.get(roomCode);
    if (!members) {
      members = new Map();
      roomMembers.set(roomCode, members);
    }
    return members;
  };

  const publicMember = (roomCode, member) => ({
    identity: member.identity,
    userId: member.userId,
    displayName: member.displayName,
    isHost: member.isHost,
    mutedByHost: !member.isHost && isMutedByHost(roomCode, member.userId),
  });

  const broadcastParticipants = (roomCode) => {
    const participants = [...getMembers(roomCode).values()].map((member) => publicMember(roomCode, member));
    io.to(roomCode).emit('audio:participants', {
      participants,
      muteAll: getPolicy(roomCode).muteAll,
    });
  };

  const setParticipantMuted = async (roomCode, targetUserId, muted) => {
    const policy = getPolicy(roomCode);
    setUserMutePolicy(policy, targetUserId, muted);

    const activeMembers = [...getMembers(roomCode).values()]
      .filter((member) => member.userId === targetUserId && !member.isHost);

    await Promise.all(activeMembers.map(async (member) => {
      await roomService.updateParticipant(roomCode, member.identity, {
        permission: {
          canSubscribe: true,
          canPublish: false,
          canPublishData: false,
        },
      });

      if (muted) {
        try {
          const participant = await roomService.getParticipant(roomCode, member.identity);
          await Promise.all(participant.tracks
            .filter((track) => track.source === TrackSource.MICROPHONE)
            .map((track) => roomService.mutePublishedTrack(roomCode, member.identity, track.sid, true)));
        } catch (error) {
          if (!['NotFound', 'NOT_FOUND'].includes(error?.code)) throw error;
        }
      }

      io.to(member.socketId).emit('audio:moderation', {
        mutedByHost: muted || isMutedByHost(roomCode, targetUserId),
        message: muted ? 'The host muted your microphone.' : 'The host allowed you to unmute.',
      });
    }));

    broadcastParticipants(roomCode);
  };

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token !== 'string' || !token) {
      next(new Error('Authentication required. Sign in again to join room audio.'));
      return;
    }
    try {
      const { payload } = await jwtVerify(token, jwtKey, { algorithms: [jwtAlgorithm] });
      if (typeof payload.sub !== 'string' || !payload.sub) {
        next(new Error('Invalid account token. Sign in again to join room audio.'));
        return;
      }
      socket.data.userId = payload.sub;
      socket.data.displayName = typeof payload.displayName === 'string'
        ? payload.displayName
        : 'Participant';
      next();
    } catch {
      next(new Error('Your sign-in has expired. Sign in again to join room audio.'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('audio:join', async (request, acknowledge = () => {}) => {
      if (socket.data.roomCode || socket.data.joiningAudio) {
        acknowledge({ ok: false, error: 'You have already joined room audio.' });
        return;
      }
      socket.data.joiningAudio = true;
      try {
        const roomCode = normalizeRoomCode(request?.roomId);
        if (!roomCode) {
          acknowledge({ ok: false, error: 'Enter a valid room code.' });
          return;
        }
        const persistedRoom = await findActiveRoom(roomCode);
        if (!persistedRoom) {
          acknowledge({ ok: false, error: 'Room not found or no longer active.' });
          return;
        }

        const currentMembers = getMembers(roomCode);
        if (currentMembers.size >= MAX_ROOM_PARTICIPANTS) {
          acknowledge({ ok: false, error: 'This audio room has reached its participant limit.' });
          return;
        }

        const isHost = socket.data.userId === persistedRoom.host_user_id;
        const mutedByHost = !isHost && isMutedByHost(roomCode, socket.data.userId);
        const identity = `${socket.data.userId}:${randomUUID()}`;
        const displayName = typeof request.displayName === 'string' && request.displayName.trim()
          ? request.displayName.trim().slice(0, 100)
          : socket.data.displayName;
        const accessToken = new AccessToken(config.liveKitApiKey, config.liveKitApiSecret, {
          identity,
          name: displayName,
          metadata: JSON.stringify({ userId: socket.data.userId, isHost }),
          ttl: '1h',
        });
        accessToken.addGrant({
          roomJoin: true,
          room: roomCode,
          canPublish: isHost,
          canSubscribe: true,
          canPublishData: false,
        });
        const token = await accessToken.toJwt();

        if (!socket.connected) {
          acknowledge({ ok: false, error: 'The audio connection was closed. Rejoin room audio.' });
          return;
        }

        socket.data.roomCode = roomCode;
        socket.data.identity = identity;
        socket.data.isHost = isHost;
        socket.join(roomCode);
        currentMembers.set(socket.id, {
          socketId: socket.id,
          identity,
          userId: socket.data.userId,
          displayName,
          isHost,
        });

        acknowledge({
          ok: true,
          token,
          serverUrl: config.liveKitUrl,
          identity,
          participant: publicMember(roomCode, currentMembers.get(socket.id)),
          isHost,
          mutedByHost,
          muteAll: getPolicy(roomCode).muteAll,
        });
        broadcastParticipants(roomCode);
      } catch (error) {
        logger.error('Unable to join LiveKit audio room.', error);
        acknowledge({ ok: false, error: 'Unable to join room audio. Check the audio service and LiveKit connection.' });
      } finally {
        socket.data.joiningAudio = false;
      }
    });

    socket.on('audio:mute', async ({ muted } = {}, acknowledge = () => {}) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode || typeof muted !== 'boolean') {
        acknowledge({ ok: false, error: 'Join room audio before changing microphone state.' });
        return;
      }
      if (muted) {
        try {
          const participant = await roomService.getParticipant(roomCode, socket.data.identity);
          await Promise.all(participant.tracks
            .filter((track) => track.source === TrackSource.MICROPHONE)
            .map((track) => roomService.mutePublishedTrack(roomCode, socket.data.identity, track.sid, true)));
        } catch (error) {
          if (!['NotFound', 'NOT_FOUND'].includes(error?.code)) {
            logger.error('Unable to mute participant microphone.', error);
            acknowledge({ ok: false, error: 'Unable to mute the microphone on the audio server.' });
            return;
          }
        }
      } else if (!socket.data.isHost && isMutedByHost(roomCode, socket.data.userId)) {
        acknowledge({ ok: false, error: 'The host must allow you to unmute first.' });
        socket.emit('audio:moderation', {
          mutedByHost: true,
          message: 'The host has muted your microphone. You cannot unmute yet.',
        });
        return;
      }
      acknowledge({ ok: true });
    });

    socket.on('audio:moderate', async ({ identity, muted } = {}, acknowledge = () => {}) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode || !socket.data.isHost || typeof identity !== 'string' || typeof muted !== 'boolean') {
        acknowledge({ ok: false, error: 'Only the verified room host can change participant microphone permissions.' });
        return;
      }
      const target = [...getMembers(roomCode).values()].find((member) => member.identity === identity);
      if (!target || target.isHost) {
        acknowledge({ ok: false, error: 'That participant is not available for moderation.' });
        return;
      }
      try {
        await setParticipantMuted(roomCode, target.userId, muted);
        acknowledge({ ok: true });
      } catch (error) {
        logger.error('Unable to update participant microphone permissions.', error);
        acknowledge({ ok: false, error: 'The audio server could not update that participant’s microphone permissions.' });
      }
    });

    socket.on('audio:mute-all', async ({ muted } = {}, acknowledge = () => {}) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode || !socket.data.isHost || typeof muted !== 'boolean') {
        acknowledge({ ok: false, error: 'Only the verified room host can mute or allow the room.' });
        return;
      }

      getPolicy(roomCode).muteAll = muted;
      const targetUsers = new Set(
        [...getMembers(roomCode).values()]
          .filter((member) => !member.isHost)
          .map((member) => member.userId),
      );
      try {
        await Promise.all([...targetUsers].map((userId) => setParticipantMuted(roomCode, userId, muted)));
        if (!muted) {
          const policy = getPolicy(roomCode);
          policy.mutedUsers.clear();
          policy.allowedUsers.clear();
        }
        broadcastParticipants(roomCode);
        acknowledge({ ok: true });
      } catch (error) {
        logger.error('Unable to apply mute-all to the room.', error);
        acknowledge({ ok: false, error: 'The audio server could not update all participant permissions.' });
      }
    });

    const leaveAudio = (acknowledge) => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) {
        if (typeof acknowledge === 'function') acknowledge({ ok: true });
        return;
      }
      const members = getMembers(roomCode);
      members.delete(socket.id);
      socket.leave(roomCode);
      socket.data.roomCode = null;
      socket.data.identity = null;
      socket.data.isHost = false;
      if (members.size === 0) {
        roomMembers.delete(roomCode);
        roomPolicies.delete(roomCode);
      } else {
        broadcastParticipants(roomCode);
      }
      if (typeof acknowledge === 'function') acknowledge({ ok: true });
    };

    socket.on('audio:leave', leaveAudio);
    socket.on('disconnect', leaveAudio);
  });

  return {
    app,
    httpServer,
    io,
    pool,
    listen: (port = config.port) => new Promise((resolve, reject) => {
      httpServer.once('error', reject);
      httpServer.listen(port, () => {
        httpServer.off('error', reject);
        resolve(httpServer.address());
      });
    }),
    close: async () => {
      await new Promise((resolve) => io.close(resolve));
      await pool.end();
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const service = createAudioService();
  const address = await service.listen();
  console.info(`CodeSync audio service listening on port ${address.port}.`);
}
