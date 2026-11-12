package com.CodeSync.Backend.collaboration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.CodeSync.Backend.room.RoomService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Iterator;
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
    private static final Logger LOGGER = LoggerFactory.getLogger(CollaborationRoomService.class);
    private static final int MAX_EDITOR_UPDATE_LENGTH = 2_000_000;
    private static final long MAX_EDITOR_HISTORY_BYTES = 16_000_000;
    private static final long MAX_ROOM_EDITOR_HISTORY_BYTES = 8_000_000;
    private static final int MAX_EDITOR_HISTORY_UPDATES = 20_000;
    private static final int MAX_FILE_CONTENT_LENGTH = 500_000;
    private static final int MAX_ROOM_FILES = 100;
    private static final int MAX_ROOM_CONTENT_LENGTH = 3_000_000;
    private static final int MAX_WHITEBOARD_RECORDS = 10_000;
    private static final int MAX_WHITEBOARD_UPDATE_LENGTH = 2_000_000;
    private static final int MAX_WHITEBOARD_STATE_LENGTH = 3_000_000;
    private static final int MAX_MESSAGES = 500;
    private final ObjectMapper objectMapper;
    private final RoomService persistedRoomService;
    private final Map<String, Room> rooms = new ConcurrentHashMap<>();
    private final Map<String, Participant> participantsBySession = new ConcurrentHashMap<>();

    public CollaborationRoomService(
            ObjectMapper objectMapper,
            RoomService persistedRoomService
    ) {
        this.objectMapper = objectMapper;
        this.persistedRoomService = persistedRoomService;
    }

    public void joinRoom(
            String roomId,
            String displayName,
            String userId,
            String hostUserId,
            String savedState,
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
        Room room;
        try {
            room = rooms.computeIfAbsent(safeRoomId, id -> restoreRoom(id, savedState));
        } catch (IllegalStateException exception) {
            LOGGER.error("Unable to restore collaboration state for room {}", safeRoomId, exception);
            throw exception;
        }
        Participant participant;
        boolean host;
        synchronized (room) {
            Participant existingHost = room.hostSessionId == null
                    ? null
                    : room.participants.get(room.hostSessionId);
            host = userId.equals(hostUserId) || existingHost == null;
            if (host && existingHost != null) {
                putParticipant(room, existingHost.withHost(false));
            }
            participant = new Participant(session.getId(), userId, safeName, safeRoomId, host, session);
            putParticipant(room, participant);
            if (host) {
                room.hostSessionId = session.getId();
            }
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
                putParticipant(room, nextHost.withHost(true));
                broadcast(room, message("host-changed").put("participantId", room.hostSessionId), null);
            }
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
        if (persistRoom(room) && room.participants.isEmpty()) {
            rooms.remove(participant.roomId, room);
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

        if (!participant.isHost()
                && ("code-change".equals(type)
                || "file-delete".equals(type)
                || "editor-update".equals(type)
                || "whiteboard-update".equals(type))) {
            sendError(sender, "Only the host can edit room files and the whiteboard.");
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
        if (fileName == null || !fileName.isTextual() || content == null
                || !content.isTextual() || fileName.asText().isBlank()
                || fileName.asText().length() > 128
                || content.asText().length() > MAX_FILE_CONTENT_LENGTH) {
            sendError(participantsBySession.get(senderId).session(), "The file name or content is invalid or too large.");
            return;
        }
        synchronized (room) {
            if ((!room.files.containsKey(fileName.asText()) && room.files.size() >= MAX_ROOM_FILES)
                    || !fitsRoomContentLimit(room, fileName.asText(), content.asText())) {
                sendError(participantsBySession.get(senderId).session(),
                        "This room has reached its file count or storage limit.");
                return;
            }
            ObjectNode file = objectMapper.createObjectNode();
            file.set("content", content.deepCopy());
            if (payload.has("language")) {
                file.set("language", payload.get("language").deepCopy());
            }
            room.files.put(fileName.asText(), file);
            room.dirty = true;
        }
        broadcast(room, withId(message("code-change"), senderId, payload), senderId);
    }

    private void deleteFile(Room room, JsonNode payload, String senderId) throws IOException {
        String fileName = text(payload, "fileName");
        if (!fileName.isBlank()) {
            synchronized (room) {
                if (room.files.size() <= 1 && room.files.containsKey(fileName)) {
                    sendError(participantsBySession.get(senderId).session(), "The last file in a room cannot be deleted.");
                    return;
                }
                boolean removed = room.files.remove(fileName) != null;
                Set<String> removedUpdates = room.editorUpdates.remove(fileName);
                if (removedUpdates != null) {
                    room.editorHistoryTotalBytes -= room.editorHistoryBytes.getOrDefault(fileName, 0L);
                }
                room.editorHistoryBytes.remove(fileName);
                room.editorSeedOwners.remove(fileName);
                if (removed) room.dirty = true;
            }
            broadcast(room, withId(message("file-delete"), senderId, payload), senderId);
        }
    }

    private void broadcastWhiteboard(Room room, JsonNode payload, String senderId) throws IOException {
        JsonNode changes = payload.path("changes");
        JsonNode records = changes.path("put");
        JsonNode removals = changes.path("remove");
        if (!changes.isObject() || changes.toString().length() > MAX_WHITEBOARD_UPDATE_LENGTH) {
            sendError(participantsBySession.get(senderId).session(), "The whiteboard update is invalid or too large.");
            return;
        }
        synchronized (room) {
            ObjectNode updatedWhiteboard = room.whiteboard.deepCopy();
            if (records.isArray()) {
                for (JsonNode record : records) {
                    String id = text(record, "id");
                    if (!id.isBlank()) {
                        updatedWhiteboard.set(id, record.deepCopy());
                    }
                }
            }
            if (removals.isArray()) {
                for (JsonNode id : removals) {
                    if (id.isTextual()) {
                        updatedWhiteboard.remove(id.asText());
                    }
                }
            }
            if (updatedWhiteboard.size() > MAX_WHITEBOARD_RECORDS
                    || updatedWhiteboard.toString().length() > MAX_WHITEBOARD_STATE_LENGTH) {
                sendError(participantsBySession.get(senderId).session(),
                        "The whiteboard has reached its storage limit.");
                return;
            }
            room.whiteboard = updatedWhiteboard;
            room.dirty = true;
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
            if (storedUpdates.isEmpty() && participant.isHost()) {
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
        JsonNode content = payload.get("content");
        if (fileName.isBlank() || encodedUpdate.isBlank() || encodedUpdate.length() > MAX_EDITOR_UPDATE_LENGTH) {
            sendError(participant.session(), "The collaborative editor update is invalid or too large.");
            return;
        }
        if (content == null || !content.isTextual() || content.asText().length() > MAX_FILE_CONTENT_LENGTH) {
            sendError(participant.session(), "The collaborative editor content is invalid or too large.");
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
            if (!fitsRoomContentLimit(room, fileName, content.asText())) {
                sendError(participant.session(), "This room has reached its shared file storage limit.");
                return;
            }
            Set<String> updates = room.editorUpdates.computeIfAbsent(
                    fileName,
                    ignored -> ConcurrentHashMap.newKeySet()
            );
            isNew = !updates.contains(encodedUpdate);
            long currentBytes = room.editorHistoryBytes.getOrDefault(fileName, 0L);
            if (isNew && (updates.size() >= MAX_EDITOR_HISTORY_UPDATES
                    || currentBytes + encodedUpdate.length() > MAX_EDITOR_HISTORY_BYTES
                    || room.editorHistoryTotalBytes + encodedUpdate.length() > MAX_ROOM_EDITOR_HISTORY_BYTES)) {
                sendError(participant.session(), "This room has reached its collaborative editor history limit.");
                return;
            }
            if (isNew) {
                updates.add(encodedUpdate);
                room.editorHistoryBytes.put(fileName, currentBytes + encodedUpdate.length());
                room.editorHistoryTotalBytes += encodedUpdate.length();
            }
            JsonNode existingFile = room.files.get(fileName);
            if (existingFile instanceof ObjectNode file) {
                file.put("content", content.asText());
            }
            room.dirty = true;
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
            room.dirty = true;
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
        String text = text(payload, "text").trim();
        if (text.isEmpty() || text.length() > 2_000) {
            sendError(sender.session(), "Chat messages must contain 1 to 2000 characters.");
            return;
        }
        ObjectNode chatMessage = withSender(message("chat-message"), sender, payload);
        chatMessage.put("text", text);
        room.messages.add(chatMessage.deepCopy());
        while (room.messages.size() > MAX_MESSAGES) {
            room.messages.remove(0);
        }
        room.dirty = true;
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

    @Scheduled(fixedDelay = 1000)
    public void persistDirtyRoomStates() {
        rooms.values().forEach(room -> {
            if (persistRoom(room) && room.participants.isEmpty()) {
                rooms.remove(room.roomId, room);
            }
        });
    }

    private Room restoreRoom(String roomId, String savedState) {
        Room room = new Room(roomId, objectMapper);
        if (savedState == null || savedState.isBlank()) return room;

        try {
            JsonNode state = objectMapper.readTree(savedState);
            JsonNode files = state.path("files");
            if (files.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> iterator = files.properties().iterator();
                while (iterator.hasNext()) {
                    Map.Entry<String, JsonNode> entry = iterator.next();
                    room.files.put(entry.getKey(), entry.getValue().deepCopy());
                }
            }
            JsonNode messages = state.path("messages");
            if (messages.isArray()) {
                int start = Math.max(0, messages.size() - MAX_MESSAGES);
                for (int index = start; index < messages.size(); index++) {
                    room.messages.add(messages.get(index).deepCopy());
                }
            }
            JsonNode whiteboard = state.path("whiteboard");
            if (whiteboard.isObject()) {
                room.whiteboard = (ObjectNode) whiteboard.deepCopy();
            }
            JsonNode lastResult = state.path("lastCodeResult");
            if (lastResult.isObject()) room.lastCodeResult = lastResult.deepCopy();
            room.lastCodeResultAuthor = state.path("lastCodeResultAuthor").asText(null);
            room.lastCodeResultFile = state.path("lastCodeResultFile").asText(null);
            JsonNode savedEditorUpdates = state.path("editorUpdates");
            if (savedEditorUpdates.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> filesWithUpdates = savedEditorUpdates.properties().iterator();
                while (filesWithUpdates.hasNext()) {
                    Map.Entry<String, JsonNode> entry = filesWithUpdates.next();
                    if (!room.files.containsKey(entry.getKey()) || !entry.getValue().isArray()) continue;
                    Set<String> updates = ConcurrentHashMap.newKeySet();
                    long fileBytes = 0;
                    for (JsonNode update : entry.getValue()) {
                        if (!update.isTextual() || update.asText().length() > MAX_EDITOR_UPDATE_LENGTH) {
                            throw new IOException("A saved editor update is invalid.");
                        }
                        try {
                            Base64.getDecoder().decode(update.asText());
                        } catch (IllegalArgumentException exception) {
                            throw new IOException("A saved editor update is invalid.", exception);
                        }
                        if (updates.add(update.asText())) {
                            fileBytes += update.asText().length();
                            room.editorHistoryTotalBytes += update.asText().length();
                        }
                    }
                    if (fileBytes > MAX_EDITOR_HISTORY_BYTES
                            || room.editorHistoryTotalBytes > MAX_ROOM_EDITOR_HISTORY_BYTES) {
                        throw new IOException("Saved editor updates exceed the room history limit.");
                    }
                    room.editorUpdates.put(entry.getKey(), updates);
                    room.editorHistoryBytes.put(entry.getKey(), fileBytes);
                }
            }
            return room;
        } catch (IOException exception) {
            throw new IllegalStateException("The saved room state is invalid.", exception);
        }
    }

    private boolean persistRoom(Room room) {
        String state;
        synchronized (room) {
            if (!room.dirty) return true;
            ObjectNode snapshot = objectMapper.createObjectNode();
            ObjectNode files = snapshot.putObject("files");
            room.files.forEach((name, file) -> files.set(name, file.deepCopy()));
            ArrayNode messages = snapshot.putArray("messages");
            room.messages.forEach(message -> messages.add(message.deepCopy()));
            ObjectNode editorUpdates = snapshot.putObject("editorUpdates");
            room.editorUpdates.forEach((fileName, updates) -> {
                ArrayNode encodedUpdates = editorUpdates.putArray(fileName);
                updates.forEach(encodedUpdates::add);
            });
            snapshot.set("whiteboard", room.whiteboard.deepCopy());
            if (room.lastCodeResult != null) {
                snapshot.set("lastCodeResult", room.lastCodeResult.deepCopy());
            }
            if (room.lastCodeResultAuthor != null) {
                snapshot.put("lastCodeResultAuthor", room.lastCodeResultAuthor);
            }
            if (room.lastCodeResultFile != null) {
                snapshot.put("lastCodeResultFile", room.lastCodeResultFile);
            }
            try {
                state = objectMapper.writeValueAsString(snapshot);
            } catch (IOException exception) {
                LOGGER.error("Unable to serialize collaboration state for room {}", room.roomId, exception);
                return false;
            }
            room.dirty = false;
        }

        try {
            persistedRoomService.updateCollaborationState(room.roomId, state);
            return true;
        } catch (RuntimeException exception) {
            synchronized (room) {
                room.dirty = true;
            }
            LOGGER.error("Unable to persist collaboration state for room {}", room.roomId, exception);
            return false;
        }
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

    private boolean fitsRoomContentLimit(Room room, String changedFileName, String nextContent) {
        long totalLength = nextContent.length();
        for (Map.Entry<String, JsonNode> entry : room.files.entrySet()) {
            if (entry.getKey().equals(changedFileName)) continue;
            totalLength += entry.getValue().path("content").asText().length();
            if (totalLength > MAX_ROOM_CONTENT_LENGTH) return false;
        }
        return totalLength <= MAX_ROOM_CONTENT_LENGTH;
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

    private void putParticipant(Room room, Participant participant) {
        room.participants.put(participant.sessionId(), participant);
        participantsBySession.put(participant.sessionId(), participant);
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
        private long editorHistoryTotalBytes;
        private final Map<String, String> editorSeedOwners = new ConcurrentHashMap<>();
        private String hostSessionId;
        private ObjectNode whiteboard;
        private JsonNode lastCodeResult;
        private String lastCodeResultAuthor;
        private String lastCodeResultFile;
        private Instant voiceStartedAt;
        private volatile boolean dirty;

        private Room(String roomId, ObjectMapper objectMapper) {
            this.roomId = roomId;
            this.whiteboard = objectMapper.createObjectNode();
        }
    }
}
