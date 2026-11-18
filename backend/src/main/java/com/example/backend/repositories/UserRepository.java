package com.example.backend.repositories;

import com.example.backend.model.User;
import com.example.backend.model.UserRole;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long>, JpaSpecificationExecutor<User> {
    @org.springframework.data.jpa.repository.Query("""
        select new com.example.backend.dto.user.UserResponse(
            u.userID, u.username, u.email, u.fullName, u.phoneNumber, u.address, u.role, u.isActive, u.createdAt)
        from User u
        """)
    List<com.example.backend.dto.user.UserResponse> findAllResponses();
    Optional<User> findByUsername(String username);
    Optional<User> findByEmail(String email);
    boolean existsByUsername(String username);
    boolean existsByEmail(String email);
    List<User> findByRole(UserRole role);
    List<User> findByIsActiveTrue();
    Page<User> findByRoleAndFullNameContainingIgnoreCase(UserRole role, String fullName, Pageable pageable);
}
