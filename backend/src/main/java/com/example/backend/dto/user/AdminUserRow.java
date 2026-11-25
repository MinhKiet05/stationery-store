package com.example.backend.dto.user;

import com.example.backend.model.UserRole;
import java.time.LocalDateTime;

/** Deliberately excludes credentials, address and entity relationships. */
public record AdminUserRow(Long userID, String username, String fullName, String email,
                           String phoneNumber, UserRole role, Boolean isActive, LocalDateTime createdAt) {}
