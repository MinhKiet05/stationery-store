package com.example.backend.dto.auth;
import com.example.backend.model.UserRole;
public record UserInfoResponse(Long userID, String username, String email,
  String fullName, String phoneNumber, UserRole role) {}
