package com.example.backend.dto.ai;
import jakarta.validation.constraints.*;
public record ChatRequest(@NotBlank @Size(max = 1000) String message) {}
