package com.example.backend.dto.user;

import jakarta.validation.constraints.NotNull;

/** Explicit boolean prevents an omitted value from accidentally locking an account. */
public record UpdateUserStatusRequest(@NotNull Boolean isActive) {
}
