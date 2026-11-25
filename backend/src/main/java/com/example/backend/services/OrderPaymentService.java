package com.example.backend.services;

import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.dto.order.OrderResponse;
import jakarta.persistence.EntityManager;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OrderPaymentService {
    private final OrderLockRepository orders;
    private final UserRepository users;
    private final OrderService service;
    private final EntityManager em;
    @Value("${app.payments.demo-enabled:false}")
    private boolean demoEnabled;

    public record Confirmation(@NotBlank @Size(max = 70) String reference) {
    }

    @Transactional
    public OrderResponse demo(String username, Long id) {
        if (!demoEnabled)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        var user = users.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!Boolean.TRUE.equals(user.getIsActive()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        Order order = lock(id);
        if (!order.getUser().getUserID().equals(user.getUserID()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        if (!"DEMO".equals(order.getPaymentMode()) || "COD".equals(order.getPaymentMethod()))
            throw conflict("Đơn hàng này không hỗ trợ phương thức thanh toán đã chọn");
        // Check the stored receipt while holding the order lock: retries return the same result.
        if (Boolean.TRUE.equals(order.getIsPaid()))
            return service.getOrder(username, id);
        if (order.getStatus() != OrderStatus.PENDING)
            throw conflict("Đơn hàng không còn chờ thanh toán");
        paid(order, "TXN-" + UUID.randomUUID(), username);
        return service.getOrder(username, id);
    }

    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public OrderResponse confirmCod(String username, Long id, Confirmation request) {
        Order order = lock(id);
        if (!"COD".equals(order.getPaymentMethod()) || !"LIVE".equals(order.getPaymentMode()))
            throw conflict("Chỉ xác nhận thu tiền cho đơn COD");
        String reference = "COD-" + id + "-" + request.reference().trim();
        if (Boolean.TRUE.equals(order.getIsPaid())) {
            if (!reference.equals(order.getPaymentReference()))
                throw conflict("Đơn hàng đã được xác nhận với mã thu tiền khác");
            return service.adminOrder(id).order();
        }
        if (order.getStatus() != OrderStatus.DELIVERED)
            throw conflict("Chỉ xác nhận thu tiền COD sau khi giao hàng thành công");
        paid(order, reference, username);
        return service.adminOrder(id).order();
    }

    private Order lock(Long id) {
        // Cancellation and payment take the same lock, so a cancelled order cannot become paid.
        Order order = orders.lockById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        em.refresh(order);
        return order;
    }

    private void paid(Order order, String reference, String actor) {
        order.setIsPaid(true);
        order.setPaidAt(LocalDateTime.now());
        order.setPaymentReference(reference);
        order.setPaymentConfirmedBy(actor);
        em.flush();
    }

    private ResponseStatusException conflict(String message) {
        return new ResponseStatusException(HttpStatus.CONFLICT, message);
    }
}
