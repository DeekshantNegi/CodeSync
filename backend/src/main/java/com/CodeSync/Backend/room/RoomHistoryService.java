package com.CodeSync.Backend.room;

import com.CodeSync.Backend.entity.RoomHistory;
import com.CodeSync.Backend.repository.RoomHistoryRepository;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class RoomHistoryService {
    private final RoomHistoryRepository repository;

    public RoomHistoryService(RoomHistoryRepository repository) {
        this.repository = repository;
    }

    public void record(String userId, String roomCode, String role) {
        repository.findByUserIdAndRoomCode(userId, roomCode)
                .ifPresentOrElse(
                        history -> {
                            history.revisit(role);
                            repository.save(history);
                        },
                        () -> repository.save(new RoomHistory(userId, roomCode, role))
                );
    }

    public List<RoomHistory> findForUser(String userId) {
        return repository.findTop20ByUserIdOrderByLastVisitedAtDesc(userId);
    }
}
