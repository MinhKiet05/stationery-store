package com.example.backend.dto.user;

import com.example.backend.model.UserRole;

public record AdminUserFilter(String search, UserRole role, Boolean active, Sort sort) {
    public enum Sort { NEWEST, OLDEST, NAME_ASC }
}
