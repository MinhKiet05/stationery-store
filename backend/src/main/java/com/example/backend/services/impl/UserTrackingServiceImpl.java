package com.example.backend.services.impl;

import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.UserTrackingService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.HashSet;

@Service @RequiredArgsConstructor
public class UserTrackingServiceImpl implements UserTrackingService {
    private final UserTrackingEventRepository events;
    private final UserRepository users;
    private final ProductRepository products;
    private final EntityManager em;
    @Value("${app.tracking.view-cooldown-seconds:300}") private long cooldown = 300;

    @Override @Transactional
    public boolean recordView(String username, Long productID) {
        User user = users.findByUsername(username)
                .filter(u -> Boolean.TRUE.equals(u.getIsActive()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        // Database lock also deduplicates concurrent requests across application instances.
        em.find(User.class, user.getUserID(), LockModeType.PESSIMISTIC_WRITE);
        Product product = products.findById(productID)
                .filter(p -> Boolean.TRUE.equals(p.getIsActive()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm"));
        if (events.existsByUser_UserIDAndProduct_ProductIDAndEventTypeAndCreatedAtAfter(
                user.getUserID(), productID, TrackingEventType.VIEW_PRODUCT,
                LocalDateTime.now().minusSeconds(Math.max(1, cooldown)))) return false;
        save(user, product, TrackingEventType.VIEW_PRODUCT);
        return true;
    }

    @Override @Transactional
    public void recordCartAddition(User user, Product product) {
        save(user, product, TrackingEventType.ADD_TO_CART);
    }

    @Override @Transactional
    public void recordPurchase(Order order) {
        if (order.getStatus() != OrderStatus.DELIVERED) return;
        // The caller holds the order lock and only calls on its first DELIVERED transition.
        var seen = new HashSet<Long>();
        for (OrderDetail detail : order.getOrderDetails()) {
            Product product = detail.getVariant().getProduct();
            if (seen.add(product.getProductID())) save(order.getUser(), product, TrackingEventType.PURCHASE);
        }
    }

    private void save(User user, Product product, TrackingEventType type) {
        events.save(UserTrackingEvent.builder().user(user).product(product)
                .eventType(type).createdAt(LocalDateTime.now()).build());
    }
}
