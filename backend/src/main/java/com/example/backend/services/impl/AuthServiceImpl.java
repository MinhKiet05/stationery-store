package com.example.backend.services.impl;

import com.example.backend.dto.auth.*;
import com.example.backend.model.User;
import com.example.backend.model.UserRole;
import com.example.backend.repositories.UserRepository;
import com.example.backend.security.JwtTokenService;
import com.example.backend.services.AuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService tokenService;

    @Override
    @Transactional
    public UserInfoResponse register(RegisterRequest request) {
        String username = request.username().trim();
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (userRepository.existsByUsername(username))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username da ton tai");
        if (userRepository.existsByEmail(email))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email da ton tai");
        User user = User.builder()
            .username(username).email(email)
            .passwordHash(passwordEncoder.encode(request.password()))
            .fullName(request.fullName() == null ? null : request.fullName().trim())
            .phoneNumber(request.phoneNumber() == null ? null : request.phoneNumber().trim())
            .role(UserRole.CUSTOMER).isActive(true).build();
        try {
            return toInfo(userRepository.saveAndFlush(user));
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username hoac email da ton tai", e);
        }
    }

    @Override
    @Transactional(readOnly = true)
    public AuthResponse login(LoginRequest request) {
        // Generic response to avoid revealing which identifier exists.
        User user = userRepository.findByUsername(request.username().trim())
            .orElseThrow(this::badCredentials);
        if (!Boolean.TRUE.equals(user.getIsActive()) ||
                !passwordEncoder.matches(request.password(), user.getPasswordHash()))
            throw badCredentials();
        return new AuthResponse(tokenService.issue(user), "Bearer",
                tokenService.expirySeconds(), toInfo(user));
    }

    @Override
    @Transactional(readOnly = true)
    public UserInfoResponse me(String username) {
        User user = userRepository.findByUsername(username)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Khong xac thuc"));
        if (!Boolean.TRUE.equals(user.getIsActive()))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Tai khoan da bi khoa");
        return toInfo(user);
    }

    private ResponseStatusException badCredentials() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Thong tin dang nhap khong hop le");
    }

    private UserInfoResponse toInfo(User user) {
        return new UserInfoResponse(user.getUserID(), user.getUsername(), user.getEmail(),
                user.getFullName(), user.getPhoneNumber(), user.getRole());
    }
}
