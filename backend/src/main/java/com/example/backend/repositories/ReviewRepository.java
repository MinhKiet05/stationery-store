package com.example.backend.repositories;

import com.example.backend.model.Review;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface ReviewRepository extends JpaRepository<Review, Long> {
    @Query("""
        select new com.example.backend.dto.review.ReviewRow(
            r.reviewID, r.product.productID, r.user.userID, r.user.username,
            r.rating, r.comment, r.reviewDate, i.imageUrl, index(i))
        from Review r left join r.images i where r.product.productID = :productID
        order by r.reviewDate desc, r.reviewID desc, index(i)
        """)
    List<com.example.backend.dto.review.ReviewRow> findRowsByProductID(@Param("productID") Long productID);
    List<Review> findByProduct_ProductID(Long productID);
    List<Review> findByUser_UserID(Long userID);
    boolean existsByUser_UserIDAndProduct_ProductID(Long userID, Long productID);
    long countByProduct_ProductID(Long productID);
    @Query("SELECT AVG(r.rating) FROM Review r WHERE r.product.productID = :productID")
    Double averageRatingByProductID(@Param("productID") Long productID);
    @Query("SELECT COALESCE(SUM(r.rating), 0) FROM Review r WHERE r.product.productID = :productID")
    Long sumRatingByProductID(@Param("productID") Long productID);
}
