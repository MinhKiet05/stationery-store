package com.example.backend.services;

import com.example.backend.dto.user.*;
import java.util.List;

/** Account operations use the authenticated username for all self-service requests. */
public interface UserService {
    UserResponse getMe(String username);
    UserResponse updateMe(String username, UpdateProfileRequest request);
    void changePassword(String username, ChangePasswordRequest request);
    List<UserResponse> getUsers();
    UserResponse getUser(Long id);
    UserResponse updateStatus(Long id, UpdateUserStatusRequest request);
}
