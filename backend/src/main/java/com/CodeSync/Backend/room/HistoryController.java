package com.CodeSync.Backend.room;

import com.CodeSync.Backend.entity.RoomHistory;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.List;

@RestController
@RequestMapping("/api/history")
public class HistoryController {
    private final RoomHistoryService roomHistoryService;

    public HistoryController(RoomHistoryService roomHistoryService) {
        this.roomHistoryService = roomHistoryService;
    }

    @GetMapping
    public List<HistoryResponse> list(Authentication authentication) {
        return roomHistoryService.findForUser(authentication.getName()).stream()
                .map(HistoryResponse::from)
                .toList();
    }

    public record HistoryResponse(String roomCode, String role, LocalDateTime lastVisitedAt) {
        static HistoryResponse from(RoomHistory history) {
            return new HistoryResponse(history.getRoomCode(), history.getRole(), history.getLastVisitedAt());
        }
    }
}
