package com.example.backend.dto.user;

import com.example.backend.model.User;
import com.example.backend.model.UserRole;
import java.time.LocalDateTime;

/** Public account projection: excludes credentials and all JPA relationships. */
public record UserResponse(Long userID, String username, String email, String fullName,
                           String phoneNumber, String address, UserRole role,
                           Boolean isActive, LocalDateTime createdAt) {
    public static UserResponse from(User user) {
        return new UserResponse(user.getUserID(), user.getUsername(), user.getEmail(),
                user.getFullName(), user.getPhoneNumber(), user.getAddress(), user.getRole(),
                user.getIsActive(), user.getCreatedAt());
    }
}
