package com.CodeSync.Backend.collaboration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.CodeSync.Backend.auth.JwtService;
import com.CodeSync.Backend.room.RoomService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.WebSocketMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
public class CollaborationWebSocketHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final CollaborationRoomService roomService;
    private final JwtService jwtService;
    private final RoomService persistedRoomService;

    public CollaborationWebSocketHandler(
            ObjectMapper objectMapper,
            CollaborationRoomService roomService,
            JwtService jwtService,
            RoomService persistedRoomService
    ) {
        this.objectMapper = objectMapper;
        this.roomService = roomService;
        this.jwtService = jwtService;
        this.persistedRoomService = persistedRoomService;
    }

    @Override
    public void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        JsonNode payload = objectMapper.readTree(message.getPayload());
        String type = payload.path("type").asText("");

        if ("join-room".equals(type)) {
            Claims claims;
            try {
                claims = jwtService.parse(payload.path("token").asText());
            } catch (JwtException | IllegalArgumentException exception) {
                session.close(CloseStatus.POLICY_VIOLATION);
                return;
            }

            var persistedRoom = persistedRoomService.requireActive(payload.path("roomId").asText());
            String displayName = claims.get("displayName", String.class);
            roomService.joinRoom(
                    persistedRoom.getRoomCode(),
                    displayName,
                    claims.getSubject(),
                    persistedRoom.getHostUserId(),
                    session
            );
            return;
        }

        roomService.route(type, payload, session);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        roomService.leave(session);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        roomService.leave(session);
        if (session.isOpen()) {
            session.close(CloseStatus.SERVER_ERROR);
        }
    }
}
