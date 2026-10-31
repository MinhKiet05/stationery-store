package com.example.backend.controller;

import com.example.backend.dto.user.*;
import com.example.backend.services.UserService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

/** HTTP adapter; self-service identity always comes from the verified principal. */
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    private final UserService service;

    @GetMapping("/me")
    public UserResponse me(Authentication authentication) {
        return service.getMe(authentication.getName());
    }

    @PutMapping("/me")
    public UserResponse updateMe(Authentication authentication, @Valid @RequestBody UpdateProfileRequest request) {
        return service.updateMe(authentication.getName(), request);
    }

    @PutMapping("/me/password")
    public ResponseEntity<Void> changePassword(Authentication authentication,
                                               @Valid @RequestBody ChangePasswordRequest request) {
        service.changePassword(authentication.getName(), request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public List<UserResponse> users() {
        return service.getUsers();
    }

    @GetMapping("/{id}")
    public UserResponse user(@PathVariable Long id) {
        return service.getUser(id);
    }

    @PatchMapping("/{id}/status")
    public UserResponse status(@PathVariable Long id, @Valid @RequestBody UpdateUserStatusRequest request) {
        return service.updateStatus(id, request);
    }
}
