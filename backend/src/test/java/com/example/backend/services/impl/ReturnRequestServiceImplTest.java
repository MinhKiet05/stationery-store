package com.example.backend.services.impl;

import com.example.backend.dto.returns.*;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.TypedQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReturnRequestServiceImplTest {
    @Mock ReturnRequestRepository returns;
    @Mock ReturnRequestItemRepository returnItems;
    @Mock OrderLockRepository orderLocks;
    @Mock OrderDetailRepository orderDetails;
    @Mock UserRepository users;
    @Mock EntityManager em;
    @Mock TypedQuery<Long> orderIdQuery;
    ReturnRequestServiceImpl service;
    User user;
    Order order;
    OrderDetail detail;
    LocalDateTime now;

    @BeforeEach
    void setUp() {
        now = LocalDateTime.of(2026, 11, 1, 12, 0);
        service = spy(new ReturnRequestServiceImpl(returns, returnItems, orderLocks, orderDetails, users, em));
        lenient().doReturn(now).when(service).now();
        user = User.builder().userID(2L).username("buyer").isActive(true).role(UserRole.CUSTOMER).build();
        order = Order.builder().orderID(3L).user(user).status(OrderStatus.DELIVERED)
                .deliveredAt(now.minusDays(2)).build();
        detail = OrderDetail.builder().orderDetailID(4L).order(order).quantity(3)
                .variant(ProductVariant.builder().variantID(5L).build()).build();
    }

    @Test
    void createsPendingRequestAndMarksOrder() {
        givenUserAndOrder();
        when(orderDetails.findById(4L)).thenReturn(Optional.of(detail));
        when(returns.saveAndFlush(any(ReturnRequest.class))).thenAnswer(invocation -> {
            ReturnRequest saved = invocation.getArgument(0);
            saved.setReturnID(6L);
            return saved;
        });

        ReturnResponse response = service.create("buyer", request(List.of(new ReturnItemRequest(4L, 2))));

        assertEquals(6L, response.returnID());
        assertEquals(ReturnStatus.PENDING, response.status());
        assertEquals(2, response.items().get(0).quantity());
        assertEquals(OrderStatus.RETURN_PENDING, order.getStatus());
    }

    @Test
    void rejectsOtherUsersOrder() {
        givenUserAndOrder();
        order.setUser(User.builder().userID(99L).build());

        assertStatus(404, () -> service.create("buyer", request(List.of(new ReturnItemRequest(4L, 1)))));
        verify(returns, never()).saveAndFlush(any());
    }

    @Test
    void rejectsDuplicateLine() {
        givenUserAndOrder();
        when(orderDetails.findById(4L)).thenReturn(Optional.of(detail));

        assertStatus(400, () -> service.create("buyer", request(List.of(
                new ReturnItemRequest(4L, 1), new ReturnItemRequest(4L, 1)))));
        verify(returns, never()).saveAndFlush(any());
    }

    @Test
    void reservesPendingAndApprovedQuantities() {
        givenUserAndOrder();
        when(orderDetails.findById(4L)).thenReturn(Optional.of(detail));
        ReturnRequest pending = ReturnRequest.builder().status(ReturnStatus.PENDING).build();
        ReturnRequest rejected = ReturnRequest.builder().status(ReturnStatus.REJECTED).build();
        when(returnItems.findByOrderDetail_OrderDetailID(4L)).thenReturn(List.of(
                ReturnRequestItem.builder().returnRequest(pending).quantity(2).build(),
                ReturnRequestItem.builder().returnRequest(rejected).quantity(1).build()));

        assertStatus(409, () -> service.create("buyer", request(List.of(new ReturnItemRequest(4L, 2)))));
        verify(returns, never()).saveAndFlush(any());
    }

    @Test
    void rejectsExpiredOrder() {
        givenUserAndOrder();
        order.setDeliveredAt(now.minusDays(7).minusNanos(1));

        assertStatus(409, () -> service.create("buyer", request(List.of(new ReturnItemRequest(4L, 1)))));
    }

    @Test
    void acceptsExactDeadline() {
        givenUserAndOrder();
        order.setDeliveredAt(now.minusDays(7));
        when(orderDetails.findById(4L)).thenReturn(Optional.of(detail));
        when(returns.saveAndFlush(any(ReturnRequest.class))).thenAnswer(invocation -> invocation.getArgument(0));

        assertEquals(ReturnStatus.PENDING,
                service.create("buyer", request(List.of(new ReturnItemRequest(4L, 1)))).status());
    }

    @Test
    void rejectsItemFromAnotherOrder() {
        givenUserAndOrder();
        detail.setOrder(Order.builder().orderID(99L).build());
        when(orderDetails.findById(4L)).thenReturn(Optional.of(detail));

        assertStatus(400, () -> service.create("buyer", request(List.of(new ReturnItemRequest(4L, 1)))));
        verify(returns, never()).saveAndFlush(any());
    }

    @Test
    void rejectsMissingEvidence() {
        assertStatus(400, () -> service.create("buyer",
                new CreateReturnRequest(3L, "Damaged", List.of(), List.of(new ReturnItemRequest(4L, 1)))));
    }

    @Test
    void customerCannotReadAnotherCustomersRequest() {
        when(users.findByUsername("buyer")).thenReturn(Optional.of(user));
        ReturnRequest other = ReturnRequest.builder().returnID(6L)
                .user(User.builder().userID(99L).build()).build();
        when(returns.findById(6L)).thenReturn(Optional.of(other));

        assertStatus(404, () -> service.get("buyer", 6L));
    }

    @Test
    void adminDecisionCannotBeRepeated() {
        when(em.createQuery("select r.order.orderID from ReturnRequest r where r.returnID = :id", Long.class))
                .thenReturn(orderIdQuery);
        when(orderIdQuery.setParameter("id", 6L)).thenReturn(orderIdQuery);
        when(orderIdQuery.getResultStream()).thenReturn(Stream.of(3L));
        when(orderLocks.lockById(3L)).thenReturn(Optional.of(order));
        ReturnRequest processed = ReturnRequest.builder().returnID(6L).order(order)
                .status(ReturnStatus.APPROVED).build();
        when(em.find(ReturnRequest.class, 6L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(processed);

        assertStatus(409, () -> service.changeStatus(6L,
                new UpdateReturnStatusRequest(ReturnStatus.REJECTED, "No")));
        verify(em, never()).flush();
    }

    @Test
    void adminApprovalClosesPendingLabelWithoutRefunding() {
        when(em.createQuery("select r.order.orderID from ReturnRequest r where r.returnID = :id", Long.class))
                .thenReturn(orderIdQuery);
        when(orderIdQuery.setParameter("id", 6L)).thenReturn(orderIdQuery);
        when(orderIdQuery.getResultStream()).thenReturn(Stream.of(3L));
        order.setStatus(OrderStatus.RETURN_PENDING);
        when(orderLocks.lockById(3L)).thenReturn(Optional.of(order));
        ReturnRequest pending = ReturnRequest.builder().returnID(6L).order(order).user(user)
                .reason("Damaged").evidenceImages("https://example.com/proof.jpg")
                .status(ReturnStatus.PENDING).build();
        when(em.find(ReturnRequest.class, 6L, LockModeType.PESSIMISTIC_WRITE)).thenReturn(pending);

        ReturnResponse response = service.changeStatus(6L,
                new UpdateReturnStatusRequest(ReturnStatus.APPROVED, "Accepted"));

        assertEquals(ReturnStatus.APPROVED, response.status());
        assertEquals(OrderStatus.DELIVERED, order.getStatus());
        assertEquals(now, response.processedAt());
        verify(em).flush();
    }

    private CreateReturnRequest request(List<ReturnItemRequest> items) {
        return new CreateReturnRequest(3L, "Damaged", List.of("https://example.com/proof.jpg"), items);
    }

    private void givenUserAndOrder() {
        when(users.findByUsername("buyer")).thenReturn(Optional.of(user));
        when(orderLocks.lockById(3L)).thenReturn(Optional.of(order));
    }

    private void assertStatus(int expected, Runnable call) {
        ResponseStatusException error = assertThrows(ResponseStatusException.class, call::run);
        assertEquals(expected, error.getStatusCode().value());
    }
}
