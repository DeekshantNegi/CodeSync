package com.CodeSync.Backend.room;

import com.CodeSync.Backend.entity.Room;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

@RestController
@RequestMapping("/api/rooms")
public class RoomController {
    private final RoomService roomService;

    public RoomController(RoomService roomService) {
        this.roomService = roomService;
    }

    @PostMapping
    public ResponseEntity<RoomResponse> create(Authentication authentication) {
        return ResponseEntity.ok(RoomResponse.from(roomService.create(authentication.getName())));
    }

    @GetMapping("/{roomCode}")
    public ResponseEntity<RoomResponse> join(@PathVariable String roomCode, Authentication authentication) {
        return ResponseEntity.ok(RoomResponse.from(roomService.requireActive(roomCode)));
    }

    public record RoomResponse(
            String roomCode,
            String hostUserId,
            String status,
            LocalDateTime createdAt
    ) {
        static RoomResponse from(Room room) {
            return new RoomResponse(
                    room.getRoomCode(),
                    room.getHostUserId(),
                    room.getStatus().name(),
                    room.getCreatedAt()
            );
        }
    }
}
