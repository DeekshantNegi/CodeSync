package com.CodeSync.Backend.repository;

import com.CodeSync.Backend.entity.Room;
import com.CodeSync.Backend.entity.RoomStatus;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoomRepository extends JpaRepository<Room, Long> {
    Optional<Room> findByRoomCodeAndStatus(String roomCode, RoomStatus status);
    boolean existsByRoomCode(String roomCode);
}