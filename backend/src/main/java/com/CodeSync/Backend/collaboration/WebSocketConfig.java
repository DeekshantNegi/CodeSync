package com.CodeSync.Backend.collaboration;

import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

import java.util.Arrays;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {
    private final CollaborationWebSocketHandler collaborationWebSocketHandler;
    private final String[] allowedOrigins;

    public WebSocketConfig(
            CollaborationWebSocketHandler collaborationWebSocketHandler,
            @Value("${codesync.allowed-origins}") String allowedOrigins
    ) {
        this.collaborationWebSocketHandler = collaborationWebSocketHandler;
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .toArray(String[]::new);
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(collaborationWebSocketHandler, "/ws")
            .setAllowedOrigins(allowedOrigins);
    }
}
