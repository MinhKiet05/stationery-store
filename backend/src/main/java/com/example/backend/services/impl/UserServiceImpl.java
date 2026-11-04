package com.example.backend.services.impl;

import com.example.backend.dto.user.*;
import com.example.backend.model.User;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.UserService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;

/** Profile updates and password changes never accept role or status from the client. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class UserServiceImpl implements UserService {
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final EntityManager entityManager;

    @Override
    public UserResponse getMe(String username) {
        return UserResponse.from(currentUser(username));
    }

    @Override
    @Transactional
    public UserResponse updateMe(String username, UpdateProfileRequest request) {
        User user = lockedCurrentUser(username);
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        users.findByEmail(email).filter(other -> !other.getUserID().equals(user.getUserID()))
                .ifPresent(other -> { throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai"); });
        user.setEmail(email);
        user.setFullName(trim(request.fullName()));
        user.setPhoneNumber(trim(request.phoneNumber()));
        user.setAddress(trim(request.address()));
        try {
            return UserResponse.from(users.saveAndFlush(user));
        } catch (DataIntegrityViolationException exception) {
            // The database unique constraint also covers concurrent updates to the same email.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai", exception);
        }
    }

    @Override
    @Transactional
    public void changePassword(String username, ChangePasswordRequest request) {
        User user = lockedCurrentUser(username);
        if (!passwordEncoder.matches(request.oldPassword(), user.getPasswordHash())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mat khau cu khong dung");
        }
        // BCrypt limits input by UTF-8 bytes, whereas @Size counts Java characters.
        if (request.newPassword().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mat khau moi vuot qua 72 byte UTF-8");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public List<UserResponse> getUsers() {
        return users.findAll().stream().map(UserResponse::from).toList();
    }

    @Override
    @PreAuthorize("hasRole('ADMIN')")
    public UserResponse getUser(Long id) {
        return UserResponse.from(requireUser(id));
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public UserResponse updateStatus(Long id, UpdateUserStatusRequest request) {
        User user = requireUser(id);
        lock(user);
        user.setIsActive(request.isActive());
        // Existing JWT authentication reloads isActive from DB on every subsequent request.
        return UserResponse.from(user);
    }

    private User currentUser(String username) {
        if (username == null || username.isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chua dang nhap");
        }
        User user = users.findByUsername(username).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan khong ton tai"));
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi khoa");
        }
        return user;
    }

    private User lockedCurrentUser(String username) {
        User user = currentUser(username);
        lock(user);
        if (!Boolean.TRUE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi khoa");
        }
        return user;
    }

    private User requireUser(Long id) {
        return users.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Khong tim thay tai khoan"));
    }

    private void lock(User user) {
        // Refresh under the lock so a waiting writer never overwrites a newer password/status.
        entityManager.refresh(user, LockModeType.PESSIMISTIC_WRITE);
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }
}
