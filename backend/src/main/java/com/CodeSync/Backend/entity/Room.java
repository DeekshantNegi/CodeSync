package com.CodeSync.Backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

@Entity
@Table(name = "rooms")
public class Room {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 32)
    private String roomCode;

    @Column(nullable = false, length = 128)
    private String hostUserId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RoomStatus status;

    @Column(nullable = false)
    private LocalDateTime createdAt;

    @Column(nullable = false)
    private LocalDateTime lastActiveAt;

    protected Room() {
    }

    public Room(String roomCode, String hostUserId) {
        this.roomCode = roomCode;
        this.hostUserId = hostUserId;
        this.status = RoomStatus.ACTIVE;
        this.createdAt = LocalDateTime.now();
        this.lastActiveAt = this.createdAt;
    }

    public Long getId() { return id; }
    public String getRoomCode() { return roomCode; }
    public String getHostUserId() { return hostUserId; }
    public RoomStatus getStatus() { return status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public LocalDateTime getLastActiveAt() { return lastActiveAt; }

    public void touch() {
        this.lastActiveAt = LocalDateTime.now();
    }
}