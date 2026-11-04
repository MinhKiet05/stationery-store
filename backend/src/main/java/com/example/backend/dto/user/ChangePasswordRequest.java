package com.example.backend.dto.user;

import jakarta.validation.constraints.*;

/** Passwords are never trimmed because whitespace can be part of a credential. */
public record ChangePasswordRequest(
        @NotBlank @Size(max = 72) String oldPassword,
        @NotBlank @Size(min = 8, max = 72) String newPassword) {
}
