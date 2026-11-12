package com.CodeSync.Backend.room;

import com.CodeSync.Backend.entity.Room;
import com.CodeSync.Backend.entity.RoomStatus;
import com.CodeSync.Backend.repository.RoomRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.util.Locale;

@Service
public class RoomService {
    private static final String ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private final SecureRandom random = new SecureRandom();
    private final RoomRepository roomRepository;
    private final RoomHistoryService roomHistoryService;

    public RoomService(RoomRepository roomRepository, RoomHistoryService roomHistoryService) {
        this.roomRepository = roomRepository;
        this.roomHistoryService = roomHistoryService;
    }

    public Room create(String hostUserId) {
        String roomCode;
        do {
            roomCode = generateCode();
        } while (roomRepository.existsByRoomCode(roomCode));
        Room room = roomRepository.save(new Room(roomCode, hostUserId));
        roomHistoryService.record(hostUserId, room.getRoomCode(), "HOST");
        return room;
    }

    public Room join(String roomCode, String userId) {
        Room room = requireActive(roomCode);
        roomHistoryService.record(userId, room.getRoomCode(), room.getHostUserId().equals(userId) ? "HOST" : "PARTICIPANT");
        return room;
    }

    public Room requireActive(String roomCode) {
        return roomRepository.findByRoomCodeAndStatus(roomCode.trim().toUpperCase(Locale.ROOT), RoomStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));
    }

    public void updateCollaborationState(String roomCode, String state) {
        Room room = requireActive(roomCode);
        room.updateCollaborationState(state);
        roomRepository.save(room);
    }

    private String generateCode() {
        StringBuilder code = new StringBuilder("SYNC-");
        for (int index = 0; index < 8; index++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }
}
