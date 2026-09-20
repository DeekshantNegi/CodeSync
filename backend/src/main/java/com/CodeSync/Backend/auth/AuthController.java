package com.CodeSync.Backend.auth;

import com.CodeSync.Backend.entity.User;
import com.CodeSync.Backend.repository.UserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public AuthController(JwtService jwtService, UserRepository userRepository, PasswordEncoder passwordEncoder) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    @PostMapping("/signup")
    public ResponseEntity<AuthResponse> signup(@Valid @RequestBody SignupRequest request) {
        String email = request.email().trim().toLowerCase();
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        User user = userRepository.save(new User(email, request.displayName().trim(), passwordEncoder.encode(request.password())));
        return ResponseEntity.status(HttpStatus.CREATED).body(AuthResponse.from(user, jwtService.issueUserToken(user)));
    }

    @PostMapping("/signin")
    public ResponseEntity<AuthResponse> signin(@Valid @RequestBody SigninRequest request) {
        User user = userRepository.findByEmailIgnoreCase(request.email().trim())
                .filter(candidate -> passwordEncoder.matches(request.password(), candidate.getPasswordHash()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid email or password"));
        return ResponseEntity.ok(AuthResponse.from(user, jwtService.issueUserToken(user)));
    }

    @GetMapping("/me")
    public ResponseEntity<UserResponse> me(Authentication authentication) {
        return ResponseEntity.ok(UserResponse.from(requireUser(authentication)));
    }

    @PatchMapping("/me")
    public ResponseEntity<UserResponse> update(@Valid @RequestBody ProfileRequest request, Authentication authentication) {
        User user = requireUser(authentication);
        user.updateDisplayName(request.displayName().trim());
        return ResponseEntity.ok(UserResponse.from(userRepository.save(user)));
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

    public record SignupRequest(
            @NotBlank @Email @Size(max = 160) String email,
            @NotBlank @Size(min = 2, max = 100) String displayName,
            @NotBlank @Size(min = 8, max = 100) String password
    ) {
    }

    public record SigninRequest(@NotBlank @Email String email, @NotBlank String password) {
    }

    public record ProfileRequest(@NotBlank @Size(min = 2, max = 100) String displayName) {
    }

    public record UserResponse(Long id, String email, String displayName) {
        static UserResponse from(User user) {
            return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName());
        }
    }

    public record AuthResponse(String token, Long id, String email, String displayName) {
        static AuthResponse from(User user, String token) {
            return new AuthResponse(token, user.getId(), user.getEmail(), user.getDisplayName());
        }
    }

    private User requireUser(Authentication authentication) {
        try {
            return userRepository.findById(Long.valueOf(authentication.getName()))
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));
        } catch (NumberFormatException exception) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid user token");
        }
    }
}
