package com.example.backend.repositories;

import com.example.backend.model.Cart;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface CartRepository extends JpaRepository<Cart, Long> {
    Optional<Cart> findByUser_UserID(Long userID);
    boolean existsByUser_UserID(Long userID);
}
