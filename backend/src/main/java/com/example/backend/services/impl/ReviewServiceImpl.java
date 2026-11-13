package com.example.backend.services.impl;

import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.dto.review.ReviewResponse;
import com.example.backend.model.Product;
import com.example.backend.model.OrderStatus;
import com.example.backend.model.Review;
import com.example.backend.model.User;
import com.example.backend.repositories.ProductRepository;
import com.example.backend.repositories.OrderDetailRepository;
import com.example.backend.repositories.ReviewRepository;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.ReviewService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class ReviewServiceImpl implements ReviewService {
    private final ReviewRepository reviews;
    private final ProductRepository products;
    private final OrderDetailRepository orderDetails;
    private final UserRepository users;
    private final EntityManager em;

    @Override
    @Transactional(readOnly = true)
    public List<ReviewResponse> getByProduct(Long productID) {
        product(productID);
        return reviews.findByProduct_ProductID(productID).stream()
                .map(this::toResponse).toList();
    }

    @Override
    @Transactional
    public ReviewResponse create(Long productID, String username, ReviewRequest request) {
        validate(request);
        User user = currentUser(username);
        Product product = lockProduct(productID);
        if (!orderDetails.existsByOrder_User_UserIDAndOrder_StatusAndVariant_Product_ProductID(
                user.getUserID(), OrderStatus.DELIVERED, productID)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Chua mua san pham trong don da giao");
        }
        if (reviews.existsByUser_UserIDAndProduct_ProductID(user.getUserID(), productID)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Da danh gia san pham nay");
        }
        Review review = new Review();
        review.setUser(user);
        review.setProduct(product);
        review.setRating(request.rating());
        review.setComment(request.comment().trim());
        review = reviews.saveAndFlush(review);
        refreshRating(product);
        return toResponse(review);
    }

    @Override
    @Transactional
    public ReviewResponse update(Long reviewID, String username, ReviewRequest request) {
        validate(request);
        User user = currentUser(username);
        Product product = lockProduct(productIDOfReview(reviewID));
        Review review = review(reviewID);
        if (!Objects.equals(review.getUser().getUserID(), user.getUserID())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Khong duoc sua danh gia cua nguoi khac");
        }
        review.setRating(request.rating());
        review.setComment(request.comment().trim());
        reviews.flush();
        refreshRating(product);
        return toResponse(review);
    }

    @Override
    @Transactional
    public void delete(Long reviewID, String username) {
        User user = currentUser(username);
        Product product = lockProduct(productIDOfReview(reviewID));
        Review review = review(reviewID);
        if (!Objects.equals(review.getUser().getUserID(), user.getUserID())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Khong duoc xoa danh gia cua nguoi khac");
        }
        reviews.delete(review);
        reviews.flush();
        refreshRating(product);
    }

    private void refreshRating(Product product) {
        long count = reviews.countByProduct_ProductID(product.getProductID());
        long sum = reviews.sumRatingByProductID(product.getProductID());
        product.setReviewCount(Math.toIntExact(count));
        product.setRatingAverage(count == 0 ? BigDecimal.ZERO.setScale(2) :
                BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(count), 2, RoundingMode.HALF_UP));
    }

    private Product lockProduct(Long productID) {
        Product product = em.find(Product.class, productID, LockModeType.PESSIMISTIC_WRITE);
        if (product == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "San pham khong ton tai");
        return product;
    }

    private Product product(Long productID) {
        return products.findById(productID)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "San pham khong ton tai"));
    }

    private Long productIDOfReview(Long reviewID) {
        return em.createQuery("select r.product.productID from Review r where r.reviewID = :id", Long.class)
                .setParameter("id", reviewID).getResultStream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Danh gia khong ton tai"));
    }

    private Review review(Long reviewID) {
        return reviews.findById(reviewID)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Danh gia khong ton tai"));
    }

    private User currentUser(String username) {
        if (username == null || username.isBlank()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        User user = users.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!Boolean.TRUE.equals(user.getIsActive())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }

    private void validate(ReviewRequest request) {
        if (request == null || request.rating() == null || request.rating() < 1 || request.rating() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rating phai tu 1 den 5");
        }
        if (request.comment() == null || request.comment().isBlank() || request.comment().length() > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Binh luan bat buoc va khong qua 5000 ky tu");
        }
    }

    private ReviewResponse toResponse(Review review) {
        return new ReviewResponse(review.getReviewID(), review.getProduct().getProductID(),
                review.getUser().getUserID(), review.getUser().getUsername(), review.getRating(),
                review.getComment(), review.getReviewDate());
    }
}
