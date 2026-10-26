package com.example.backend.controller;

import com.example.backend.dto.auth.*;
import com.example.backend.services.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<UserInfoResponse> register(@Valid @RequestBody RegisterRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(body));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest body) {
        return authService.login(body);
    }

    @GetMapping("/me")
    public UserInfoResponse me(Authentication authentication) {
        return authService.me(authentication.getName());
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout() {
        // JWT is stateless: the client must discard its token. No server-side revocation here.
        return ResponseEntity.noContent().build();
    }
}
