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

    public RoomService(RoomRepository roomRepository) {
        this.roomRepository = roomRepository;
    }

    public Room create(String hostUserId) {
        String roomCode;
        do {
            roomCode = generateCode();
        } while (roomRepository.existsByRoomCode(roomCode));
        return roomRepository.save(new Room(roomCode, hostUserId));
    }

    public Room requireActive(String roomCode) {
        return roomRepository.findByRoomCodeAndStatus(roomCode.trim().toUpperCase(Locale.ROOT), RoomStatus.ACTIVE)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Room not found"));
    }

    private String generateCode() {
        StringBuilder code = new StringBuilder("SYNC-");
        for (int index = 0; index < 8; index++) {
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }
}
