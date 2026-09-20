package com.CodeSync.Backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "room_history")
public class RoomHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String userId;

    @Column(nullable = false, length = 32)
    private String roomCode;

    @Column(nullable = false, length = 20)
    private String role;

    @Column(nullable = false)
    private LocalDateTime lastVisitedAt;

    protected RoomHistory() {
    }

    public RoomHistory(String userId, String roomCode, String role) {
        this.userId = userId;
        this.roomCode = roomCode;
        this.role = role;
        this.lastVisitedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public String getUserId() { return userId; }
    public String getRoomCode() { return roomCode; }
    public String getRole() { return role; }
    public LocalDateTime getLastVisitedAt() { return lastVisitedAt; }

    public void revisit(String role) {
        this.role = role;
        this.lastVisitedAt = LocalDateTime.now();
    }
}
