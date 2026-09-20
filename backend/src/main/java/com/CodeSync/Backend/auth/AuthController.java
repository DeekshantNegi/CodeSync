package com.CodeSync.Backend.auth;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final JwtService jwtService;

    public AuthController(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @PostMapping("/guest")
    public ResponseEntity<Map<String, String>> guest(@Valid @RequestBody GuestLoginRequest request) {
        String displayName = request.displayName().trim();
        return ResponseEntity.ok(Map.of(
                "token", jwtService.issueGuestToken(displayName),
                "displayName", displayName
        ));
    }

    public record GuestLoginRequest(
            @NotBlank @Size(max = 40) String displayName
    ) {
    }
}
