package com.CodeSync.Backend.repository;

import com.CodeSync.Backend.entity.RoomHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RoomHistoryRepository extends JpaRepository<RoomHistory, Long> {
    Optional<RoomHistory> findByUserIdAndRoomCode(String userId, String roomCode);
    List<RoomHistory> findTop20ByUserIdOrderByLastVisitedAtDesc(String userId);
}
