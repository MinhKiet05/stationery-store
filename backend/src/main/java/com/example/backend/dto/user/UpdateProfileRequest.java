package com.example.backend.dto.user;

import jakarta.validation.constraints.*;

/** Editable profile fields only; role, username and account status are server controlled. */
public record UpdateProfileRequest(
        @NotBlank @Email @Size(max = 150) String email,
        @Size(max = 120) String fullName,
        @Size(max = 30) String phoneNumber,
        @Size(max = 500) String address) {
}
