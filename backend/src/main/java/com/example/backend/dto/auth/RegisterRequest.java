package com.example.backend.dto.auth;
import jakarta.validation.constraints.*;
public record RegisterRequest(
  @NotBlank @Size(min=3,max=80) String username,
  @NotBlank @Email @Size(max=150) String email,
  @NotBlank @Size(min=8,max=72) String password,
  @Size(max=120) String fullName,
  @Size(max=30) String phoneNumber
) {}
