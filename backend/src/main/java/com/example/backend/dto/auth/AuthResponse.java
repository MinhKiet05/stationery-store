package com.example.backend.dto.auth;
public record AuthResponse(String accessToken, String tokenType, long expiresInSeconds,
  UserInfoResponse user) {}
