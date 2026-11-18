package com.example.backend.repositories;

import com.example.backend.model.User;
import com.example.backend.model.UserRole;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
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
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.username = :username")
    Optional<User> findForUpdateByUsername(@Param("username") String username);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select u from User u where u.userID = :id")
    Optional<User> findForUpdateById(@Param("id") Long id);

    Optional<User> findByEmail(String email);
    boolean existsByUsername(String username);
    boolean existsByEmail(String email);
    List<User> findByRole(UserRole role);
    List<User> findByIsActiveTrue();
    Page<User> findByRoleAndFullNameContainingIgnoreCase(UserRole role, String fullName, Pageable pageable);
}
