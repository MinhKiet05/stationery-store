package com.example.backend.dto.user;

import com.example.backend.model.UserRole;
import jakarta.validation.constraints.NotNull;

public record AdminUserChange(@NotNull UserRole expectedRole, Boolean expectedActive,
                              UserRole role, Boolean isActive) {}
