package com.example.backend.repositories;

import com.example.backend.model.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    List<Review> findByProduct_ProductID(Long productID);
    List<Review> findByUser_UserID(Long userID);
    boolean existsByUser_UserIDAndProduct_ProductID(Long userID, Long productID);
    long countByProduct_ProductID(Long productID);
    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.product.productID = :productID")
    Double averageRatingByProductID(@Param("productID") Long productID);
}
