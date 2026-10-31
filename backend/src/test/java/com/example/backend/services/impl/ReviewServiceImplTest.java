package com.example.backend.services.impl;

import com.example.backend.dto.review.ReviewRequest;
import com.example.backend.model.Product;
import com.example.backend.model.Review;
import com.example.backend.model.OrderStatus;
import com.example.backend.repositories.OrderDetailRepository;
import com.example.backend.model.User;
import com.example.backend.repositories.ProductRepository;
import com.example.backend.repositories.ReviewRepository;
import com.example.backend.repositories.UserRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.TypedQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReviewServiceImplTest {
    @Mock ReviewRepository reviews;
    @Mock ProductRepository products;
    @Mock OrderDetailRepository orderDetails;
    @Mock UserRepository users;
    @Mock EntityManager em;
    @Mock TypedQuery<Long> productIdQuery;
    ReviewServiceImpl service;
    Product product;
    Review review;

    @BeforeEach
    void setUp() {
        service = new ReviewServiceImpl(reviews, products, orderDetails, users, em);
        product = Product.builder().productID(10L).ratingAverage(new BigDecimal("4.00"))
                .reviewCount(1).build();
        User owner = User.builder().userID(20L).username("owner").isActive(true).build();
        review = Review.builder().reviewID(30L).product(product).user(owner).rating(4).build();
    }

    @Test
    void createReviewAfterDeliveredPurchaseUpdatesAggregate() {
        givenCurrentUser("owner", review.getUser());
        when(em.find(eq(Product.class), eq(10L), eq(LockModeType.PESSIMISTIC_WRITE)))
                .thenReturn(product);
        when(orderDetails.existsByOrder_User_UserIDAndOrder_StatusAndVariant_Product_ProductID(
                20L, OrderStatus.DELIVERED, 10L)).thenReturn(true);
        when(reviews.saveAndFlush(any(Review.class))).thenAnswer(invocation -> {
            Review saved = invocation.getArgument(0);
            saved.setReviewID(31L);
            return saved;
        });
        when(reviews.countByProduct_ProductID(10L)).thenReturn(2L);
        when(reviews.sumRatingByProductID(10L)).thenReturn(9L);

        var response = service.create(10L, "owner", new ReviewRequest(5, " Good "));

        assertEquals(31L, response.reviewID());
        assertEquals("Good", response.comment());
        assertEquals(new BigDecimal("4.50"), product.getRatingAverage());
    }

    @Test
    void duplicateReviewIsRejectedEvenAfterAnotherPurchase() {
        givenCurrentUser("owner", review.getUser());
        when(em.find(eq(Product.class), eq(10L), eq(LockModeType.PESSIMISTIC_WRITE)))
                .thenReturn(product);
        when(orderDetails.existsByOrder_User_UserIDAndOrder_StatusAndVariant_Product_ProductID(
                20L, OrderStatus.DELIVERED, 10L)).thenReturn(true);
        when(reviews.existsByUser_UserIDAndProduct_ProductID(20L, 10L)).thenReturn(true);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.create(10L, "owner", new ReviewRequest(5, "Valid")));

        assertEquals(409, error.getStatusCode().value());
        verify(reviews, never()).saveAndFlush(any());
    }

    @Test
    void undeliveredPurchaseCannotBeReviewed() {
        givenCurrentUser("owner", review.getUser());
        when(em.find(eq(Product.class), eq(10L), eq(LockModeType.PESSIMISTIC_WRITE)))
                .thenReturn(product);

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.create(10L, "owner", new ReviewRequest(5, "Valid")));

        assertEquals(403, error.getStatusCode().value());
        verify(reviews, never()).saveAndFlush(any());
    }

    @Test
    void updateRecalculatesAverageAfterFlush() {
        givenCurrentUser("owner", review.getUser());
        givenReviewLock();
        when(reviews.countByProduct_ProductID(10L)).thenReturn(2L);
        when(reviews.sumRatingByProductID(10L)).thenReturn(9L);

        service.update(30L, "owner", new ReviewRequest(5, "Updated"));

        assertEquals(5, review.getRating());
        assertEquals("Updated", review.getComment());
        assertEquals(2, product.getReviewCount());
        assertEquals(new BigDecimal("4.50"), product.getRatingAverage());
        verify(reviews).flush();
    }

    @Test
    void deleteLastReviewResetsAggregateToZero() {
        givenCurrentUser("owner", review.getUser());
        givenReviewLock();
        when(reviews.countByProduct_ProductID(10L)).thenReturn(0L);
        when(reviews.sumRatingByProductID(10L)).thenReturn(0L);

        service.delete(30L, "owner");

        verify(reviews).delete(review);
        verify(reviews).flush();
        assertEquals(0, product.getReviewCount());
        assertEquals(new BigDecimal("0.00"), product.getRatingAverage());
    }

    @Test
    void anotherUserCannotEditReview() {
        User stranger = User.builder().userID(99L).username("stranger").isActive(true).build();
        givenCurrentUser("stranger", stranger);
        givenReviewLock();

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> service.update(30L, "stranger", new ReviewRequest(1, "Valid")));

        assertEquals(403, error.getStatusCode().value());
        verify(reviews, never()).flush();
    }

    private void givenCurrentUser(String username, User user) {
        when(users.findByUsername(username)).thenReturn(Optional.of(user));
    }

    private void givenReviewLock() {
        when(em.createQuery("select r.product.productID from Review r where r.reviewID = :id", Long.class))
                .thenReturn(productIdQuery);
        when(productIdQuery.setParameter("id", 30L)).thenReturn(productIdQuery);
        when(productIdQuery.getResultStream()).thenReturn(Stream.of(10L));
        when(em.find(eq(Product.class), eq(10L), eq(LockModeType.PESSIMISTIC_WRITE)))
                .thenReturn(product);
        when(reviews.findById(30L)).thenReturn(Optional.of(review));
    }
}
