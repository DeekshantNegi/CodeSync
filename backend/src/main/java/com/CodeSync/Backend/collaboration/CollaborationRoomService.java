package com.CodeSync.Backend.collaboration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.util.Base64;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.Set;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class CollaborationRoomService {
    private static final int MAX_EDITOR_UPDATE_LENGTH = 2_000_000;
    private static final long MAX_EDITOR_HISTORY_BYTES = 16_000_000;
    private static final int MAX_EDITOR_HISTORY_UPDATES = 20_000;
    private final ObjectMapper objectMapper;
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, Participant> participantsBySession = new ConcurrentHashMap<>();

    public CollaborationRoomService(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

        public void joinRoom(
            String roomId,
            String displayName,
            String userId,
            String hostUserId,
            WebSocketSession session
        ) throws IOException {
        String safeRoomId = roomId == null || roomId.isBlank() ? "default" : roomId.trim();
        String safeName = displayName == null || displayName.isBlank() ? "Guest" : displayName.trim();
        Participant current = participantsBySession.get(session.getId());
        if (current != null && current.roomId().equals(safeRoomId)) {
            Room currentRoom = rooms.get(safeRoomId);
            if (currentRoom != null) {
                send(session, roomState(currentRoom, session.getId()));
                send(session, message("room-joined").put("roomId", safeRoomId));
                return;
            }
        }
        if (current != null) {
            leave(session);
        }
        Room room = rooms.computeIfAbsent(safeRoomId, id -> new Room(id, objectMapper));
        boolean host = userId.equals(hostUserId);
        Participant participant = new Participant(session.getId(), userId, safeName, safeRoomId, host, session);

        room.participants.put(session.getId(), participant);
        participantsBySession.put(session.getId(), participant);
        if (host) {
            room.hostSessionId = session.getId();
        }

        send(session, roomState(room, session.getId()));
        send(session, message("room-joined").put("roomId", safeRoomId));
        broadcast(room, message("participant-joined")
                .put("participantId", session.getId())
                .put("displayName", safeName)
                .put("isHost", host), session.getId());
    }

    public void leave(WebSocketSession session) throws IOException {
        Participant participant = participantsBySession.remove(session.getId());
        if (participant == null) {
            return;
        }

        Room room = rooms.get(participant.roomId);
        if (room == null) {
            return;
        }

        room.participants.remove(session.getId());
        leaveVoice(room, participant);
        broadcast(room, message("participant-left").put("participantId", session.getId()), session.getId());

        if (session.getId().equals(room.hostSessionId)) {
                room.hostSessionId = room.participants.values().stream()
                    .findFirst()
                    .map(nextParticipant -> nextParticipant.sessionId())
                    .orElse(null);
            if (room.hostSessionId != null) {
                Participant nextHost = room.participants.get(room.hostSessionId);
                room.participants.put(room.hostSessionId, nextHost.withHost(true));
                broadcast(room, message("host-changed").put("participantId", room.hostSessionId), null);
            }
        }

        if (room.participants.isEmpty()) {
            rooms.remove(participant.roomId, room);
        }

        List<String> availableEditors = new ArrayList<>();
        room.editorSeedOwners.forEach((fileName, ownerId) -> {
            if (ownerId.equals(participant.sessionId())) {
                room.editorSeedOwners.remove(fileName, ownerId);
                Set<String> updates = room.editorUpdates.get(fileName);
                if (updates == null || updates.isEmpty()) {
                    availableEditors.add(fileName);
                }
            }
        });
        for (String fileName : availableEditors) {
            broadcast(room, message("editor-seed-available").put("fileName", fileName), null);
        }
    }

    public void route(String type, JsonNode payload, WebSocketSession sender) throws IOException {
        Participant participant = participantsBySession.get(sender.getId());
        if (participant == null) {
            if ("leave-room".equals(type) || "leave-voice".equals(type)) {
                return;
            }
            sendError(sender, "Join a room before sending collaboration events.");
            return;
        }

        Room room = rooms.get(participant.roomId);
        if (room == null) {
            sendError(sender, "Room is no longer active.");
            return;
        }

        switch (type) {
            case "leave-room" -> leave(sender);
            case "code-change" -> broadcastCode(room, payload, participant.sessionId());
            case "file-delete" -> deleteFile(room, payload, participant.sessionId());
            case "whiteboard-update" -> broadcastWhiteboard(room, payload, participant.sessionId());
            case "whiteboard-sync-request" -> send(sender, roomState(room, sender.getId()));
            case "editor-sync-request" -> sendEditorSyncState(room, participant, payload);
            case "editor-update" -> routeEditorUpdate(room, participant, payload);
            case "chat-message" -> broadcastChat(room, participant, payload);
            case "code-result" -> broadcastCodeResult(room, participant, payload);
            case "join-voice" -> joinVoice(room, participant);
            case "leave-voice" -> leaveVoice(room, participant);
            case "voice-signal" -> relayToTarget(payload, type, sender);
            case "audio-access-request" -> routeAudioRequest(room, participant, payload);
            case "audio-access-response" -> routeAudioResponse(room, participant, payload);
            case "audio-control" -> routeAudioControl(room, participant, payload);
            case "kick-user" -> kick(room, participant, payload);
            default -> sendError(sender, "Unsupported collaboration event: " + type);
        }
    }

    private void broadcastCode(Room room, JsonNode payload, String senderId) throws IOException {
        JsonNode fileName = payload.get("fileName");
        JsonNode content = payload.get("content");
        if (fileName != null && content != null) {
            synchronized (room) {
                ObjectNode file = objectMapper.createObjectNode();
                file.set("content", content.deepCopy());
                if (payload.has("language")) {
                    file.set("language", payload.get("language").deepCopy());
                }
                room.files.put(fileName.asText(), file);
            }
        }
        broadcast(room, withId(message("code-change"), senderId, payload), senderId);
    }

    private void deleteFile(Room room, JsonNode payload, String senderId) throws IOException {
        String fileName = text(payload, "fileName");
        if (!fileName.isBlank()) {
            synchronized (room) {
                room.files.remove(fileName);
                room.editorUpdates.remove(fileName);
                room.editorHistoryBytes.remove(fileName);
                room.editorSeedOwners.remove(fileName);
            }
            broadcast(room, withId(message("file-delete"), senderId, payload), senderId);
        }
    }

    private void broadcastWhiteboard(Room room, JsonNode payload, String senderId) throws IOException {
        JsonNode changes = payload.path("changes");
        JsonNode records = changes.path("put");
        JsonNode removals = changes.path("remove");
        synchronized (room) {
            if (records.isArray()) {
                for (JsonNode record : records) {
                    String id = text(record, "id");
                    if (!id.isBlank()) {
                        room.whiteboard.set(id, record.deepCopy());
                    }
                }
            }
            if (removals.isArray()) {
                for (JsonNode id : removals) {
                    if (id.isTextual()) {
                        room.whiteboard.remove(id.asText());
                    }
                }
        }
        }
        if (records.isArray() || removals.isArray()) {
            broadcast(room, withId(message("whiteboard-update"), senderId, payload), senderId);
        }
    }

    private void sendEditorSyncState(Room room, Participant participant, JsonNode payload) throws IOException {
        String fileName = text(payload, "fileName");
        if (fileName.isBlank()) {
            sendError(participant.session(), "An editor file name is required.");
            return;
        }
        List<String> updates;
        boolean canSeed = false;
        synchronized (room) {
            if (!room.files.containsKey(fileName)) {
                sendError(participant.session(), "The requested collaborative file does not exist.");
                return;
            }
            Set<String> storedUpdates = room.editorUpdates.computeIfAbsent(
                    fileName,
                    ignored -> ConcurrentHashMap.newKeySet()
            );
            updates = List.copyOf(storedUpdates);
            if (storedUpdates.isEmpty()) {
                String seedOwner = room.editorSeedOwners.putIfAbsent(fileName, participant.sessionId());
                canSeed = seedOwner == null || seedOwner.equals(participant.sessionId());
            }
        }

        ObjectNode response = message("editor-sync-state").put("fileName", fileName);
        ArrayNode encodedUpdates = response.putArray("updates");
        updates.forEach(encodedUpdates::add);
        response.put("canSeed", canSeed);
        send(participant.session(), response);
    }

    private void routeEditorUpdate(Room room, Participant participant, JsonNode payload) throws IOException {
        String fileName = text(payload, "fileName");
        String encodedUpdate = text(payload, "update");
        if (fileName.isBlank() || encodedUpdate.isBlank() || encodedUpdate.length() > MAX_EDITOR_UPDATE_LENGTH) {
            sendError(participant.session(), "The collaborative editor update is invalid or too large.");
            return;
        }
        try {
            Base64.getDecoder().decode(encodedUpdate);
        } catch (IllegalArgumentException exception) {
            sendError(participant.session(), "The collaborative editor update is not valid base64 data.");
            return;
        }

        boolean isNew;
        synchronized (room) {
            if (!room.files.containsKey(fileName)) {
                sendError(participant.session(), "The requested collaborative file no longer exists.");
                return;
            }
            Set<String> updates = room.editorUpdates.computeIfAbsent(
                    fileName,
                    ignored -> ConcurrentHashMap.newKeySet()
            );
            isNew = !updates.contains(encodedUpdate);
            long currentBytes = room.editorHistoryBytes.getOrDefault(fileName, 0L);
            if (isNew && (updates.size() >= MAX_EDITOR_HISTORY_UPDATES
                    || currentBytes + encodedUpdate.length() > MAX_EDITOR_HISTORY_BYTES)) {
                sendError(participant.session(), "This room has reached its collaborative editor history limit.");
                return;
            }
            if (isNew) {
                updates.add(encodedUpdate);
                room.editorHistoryBytes.put(fileName, currentBytes + encodedUpdate.length());
            }
        }
        if (isNew) {
            ObjectNode update = message("editor-update");
            update.put("fileName", fileName);
            update.put("update", encodedUpdate);
            update.put("from", participant.sessionId());
            broadcast(room, update, participant.sessionId());
        }
    }

    private void broadcastCodeResult(Room room, Participant participant, JsonNode payload) throws IOException {
        JsonNode result = payload.get("result");
        if (result == null || !result.isObject()) {
            sendError(participant.session(), "The compile result is invalid.");
            return;
        }
        ObjectNode message = withSender(message("code-result"), participant, payload);
        synchronized (room) {
            room.lastCodeResult = result.deepCopy();
            room.lastCodeResultAuthor = participant.displayName();
            room.lastCodeResultFile = text(payload, "fileName");
        }
        broadcast(room, message, null);
    }

    private void joinVoice(Room room, Participant participant) throws IOException {
        boolean wasEmpty = room.voiceParticipants.isEmpty();
        room.voiceParticipants.add(participant.sessionId());
        if (wasEmpty) {
            room.voiceStartedAt = Instant.now();
        }
        ArrayNode users = objectMapper.createArrayNode();
        room.voiceParticipants.stream()
                .filter(id -> !id.equals(participant.sessionId()))
                .forEach(users::add);
        ObjectNode roster = message("voice-users");
        roster.set("users", users);
        send(participant.session(), roster);
        broadcast(room, withSender(message("user-joined-voice"), participant, null), participant.sessionId());
        broadcastVoiceCallState(room);
    }

    private void leaveVoice(Room room, Participant participant) throws IOException {
        if (!room.voiceParticipants.remove(participant.sessionId())) {
            return;
        }
        broadcast(room, withSender(message("user-left-voice"), participant, null), participant.sessionId());
        if (room.voiceParticipants.isEmpty()) {
            room.voiceStartedAt = null;
        }
        broadcastVoiceCallState(room);
    }

    private void broadcastChat(Room room, Participant sender, JsonNode payload) throws IOException {
        ObjectNode chatMessage = withSender(message("chat-message"), sender, payload);
        room.messages.add(chatMessage.deepCopy());
        broadcast(room, chatMessage, null);
    }

    private void routeAudioRequest(Room room, Participant requester, JsonNode payload) throws IOException {
        ObjectNode request = withSender(message("audio-access-request"), requester, payload);
        Participant host = room.participants.get(room.hostSessionId);
        if (host != null) {
            send(host.session(), request);
        }
    }

    private void routeAudioResponse(Room room, Participant host, JsonNode payload) throws IOException {
        if (!host.isHost()) {
            sendError(host.session(), "Only the host can approve audio access.");
            return;
        }
        String targetId = text(payload, "participantId");
        Participant target = room.participants.get(targetId);
        if (target != null) {
            send(target.session(), withSender(message("audio-access-response"), host, payload));
            if (payload.path("approved").asBoolean(false)) {
                send(target.session(), withSender(
                        message("audio-control").put("muted", false),
                        host,
                        payload
                ));
            }
        }
    }

    private void routeAudioControl(Room room, Participant host, JsonNode payload) throws IOException {
        if (!host.isHost()) {
            sendError(host.session(), "Only the host can control participant microphones.");
            return;
        }

        String targetId = text(payload, "participantId");
        Participant target = room.participants.get(targetId);
        if (target != null && payload.has("muted")) {
            send(target.session(), withSender(message("audio-control"), host, payload));
        }
    }

    private void kick(Room room, Participant host, JsonNode payload) throws IOException {
        if (!host.isHost()) {
            sendError(host.session(), "Only the host can remove participants.");
            return;
        }
        String targetId = text(payload, "participantId");
        Participant target = room.participants.get(targetId);
        if (target == null || target.sessionId().equals(host.sessionId())) {
            return;
        }

        send(target.session(), message("kicked").put("reason", text(payload, "reason")));
        target.session().close(CloseStatus.POLICY_VIOLATION);
    }

    private void relayToTarget(JsonNode payload, String type, WebSocketSession sender) throws IOException {
        Participant target = participantsBySession.get(text(payload, "to"));
        Participant senderParticipant = participantsBySession.get(sender.getId());
        if (target == null || senderParticipant == null
                || !target.roomId().equals(senderParticipant.roomId())) {
            return;
        }
        ObjectNode signal = message(type).set("signal", payload.get("signal"));
        signal.put("from", sender.getId());
        send(target.session(), signal);
    }

    private ObjectNode roomState(Room room, String participantId) {
        ObjectNode state = message("room-state");
        state.put("roomId", room.roomId);
        state.put("participantId", participantId);
        state.put("hostId", room.hostSessionId);
        ArrayNode participants = state.putArray("participants");
        room.participants.values().forEach(participant -> participants.addObject()
                .put("id", participant.sessionId())
                .put("name", participant.displayName())
                .put("isHost", participant.isHost()));
        ObjectNode files = state.putObject("files");
        room.files.forEach(files::set);
        ArrayNode messages = state.putArray("messages");
        room.messages.forEach(messages::add);
        synchronized (room) {
            if (room.whiteboard != null) {
                state.set("whiteboard", room.whiteboard.deepCopy());
            }
        }
        synchronized (room) {
            if (room.lastCodeResult != null) {
                ObjectNode codeResult = state.putObject("codeResult");
                codeResult.set("result", room.lastCodeResult.deepCopy());
                codeResult.put("displayName", room.lastCodeResultAuthor);
                codeResult.put("fileName", room.lastCodeResultFile);
            }
        }
        if (room.voiceStartedAt != null) {
            state.put("voiceStartedAt", room.voiceStartedAt.toString());
        }
        return state;
    }

    private void broadcastVoiceCallState(Room room) throws IOException {
        ObjectNode state = message("voice-call-state");
        if (room.voiceStartedAt != null) {
            state.put("startedAt", room.voiceStartedAt.toString());
        }
        broadcast(room, state, null);
    }

    private ObjectNode withSender(ObjectNode target, Participant sender, JsonNode payload) {
        target.put("from", sender.sessionId());
        target.put("displayName", sender.displayName());
        if (payload != null) {
            for (var entry : payload.properties()) {
                if (!target.has(entry.getKey())) {
                    target.set(entry.getKey(), entry.getValue());
                }
            }
        }
        return target;
    }

    private ObjectNode withId(ObjectNode target, String senderId, JsonNode payload) {
        target.put("from", senderId);
        for (var entry : payload.properties()) {
            if (!target.has(entry.getKey())) {
                target.set(entry.getKey(), entry.getValue());
            }
        }
        return target;
    }

    private ObjectNode message(String type) {
        ObjectNode message = objectMapper.createObjectNode();
        message.put("type", type);
        return message;
    }

    private String text(JsonNode payload, String field) {
        JsonNode value = payload == null ? null : payload.get(field);
        return value == null ? "" : value.asText();
    }

    private void broadcast(Room room, ObjectNode message, String excludedSessionId) throws IOException {
        for (Participant participant : room.participants.values()) {
            if (!participant.sessionId().equals(excludedSessionId)) {
                send(participant.session(), message);
            }
        }
    }

    private void sendError(WebSocketSession session, String error) throws IOException {
        send(session, message("error").put("message", error));
    }

    private void send(WebSocketSession session, JsonNode message) throws IOException {
        if (session.isOpen()) {
            synchronized (session) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(message)));
            }
        }
    }

    private record Participant(String sessionId, String userId, String displayName, String roomId, boolean isHost, WebSocketSession session) {
        private Participant withHost(boolean host) {
            return new Participant(sessionId, userId, displayName, roomId, host, session);
        }
    }

    private static final class Room {
        private final String roomId;
        private final Map<String, Participant> participants = new ConcurrentHashMap<>();
        private final Map<String, JsonNode> files = new ConcurrentHashMap<>();
        private final List<JsonNode> messages = new CopyOnWriteArrayList<>();
        private final Set<String> voiceParticipants = ConcurrentHashMap.newKeySet();
        private final Map<String, Set<String>> editorUpdates = new ConcurrentHashMap<>();
        private final Map<String, Long> editorHistoryBytes = new ConcurrentHashMap<>();
        private final Map<String, String> editorSeedOwners = new ConcurrentHashMap<>();
        private String hostSessionId;
        private ObjectNode whiteboard;
        private JsonNode lastCodeResult;
        private String lastCodeResultAuthor;
        private String lastCodeResultFile;
        private Instant voiceStartedAt;

        private Room(String roomId, ObjectMapper objectMapper) {
            this.roomId = roomId;
            this.whiteboard = objectMapper.createObjectNode();
        }
    }
}
