package com.example.backend.services;
import com.example.backend.dto.auth.*;
public interface AuthService {
  UserInfoResponse register(RegisterRequest request);
  AuthResponse login(LoginRequest request);
  UserInfoResponse me(String username);
}
