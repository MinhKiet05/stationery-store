package com.example.backend.services.impl;

import com.example.backend.dto.returns.*;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.ReturnRequestService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class ReturnRequestServiceImpl implements ReturnRequestService {
    private static final int RETURN_DAYS = 7;
    private final ReturnRequestRepository returns;
    private final ReturnRequestItemRepository returnItems;
    private final OrderLockRepository orderLocks;
    private final OrderDetailRepository orderDetails;
    private final UserRepository users;
    private final EntityManager em;
    private final com.example.backend.services.RefundCalculator refunds;
    private final com.example.backend.services.ReviewImageCleanup imageCleanup;

    @Override
    @Transactional(readOnly = true)
    public RefundPreview preview(String username, RefundPreviewRequest request) {
        User user = currentUser(username);
        Order order = em.find(Order.class, request.orderID());
        eligible(order, user);
        return refunds.quote(order, request.items(), previous(order));
    }

    @Override
    @Transactional
    public ReturnResponse createUploaded(String username, CreateReturnRequest request, List<String> publicIds) {
        publicIds.forEach(imageCleanup::onRollback);
        ReturnResponse response = create(username, request);
        find(response.returnID()).setEvidencePublicIds(String.join("\n", publicIds));
        em.flush();
        return response;
    }

    private List<ReturnRequestItem> previous(Order order) {
        return order.getOrderDetails().stream().flatMap(d -> returnItems.findByOrderDetail_OrderDetailID(d.getOrderDetailID()).stream()).toList();
    }

    private void eligible(Order order, User user) {
        if (order == null || !Objects.equals(order.getUser().getUserID(), user.getUserID())) throw notFound("Don hang khong ton tai");
        if (order.getStatus() != OrderStatus.DELIVERED && order.getStatus() != OrderStatus.RETURN_PENDING) throw conflict("Don hang chua duoc giao");
        if (order.getDeliveredAt() == null || now().isAfter(order.getDeliveredAt().plusDays(RETURN_DAYS))) throw conflict("Don hang da qua thoi han tra hang");
    }

    @Override
    @Transactional
    public ReturnResponse create(String username, CreateReturnRequest request) {
        validateCreate(request);
        User user = currentUser(username);
        Order order = orderLocks.lockById(request.orderID())
                .orElseThrow(() -> notFound("Don hang khong ton tai"));
        em.refresh(order);
        eligible(order, user);
        RefundPreview pricing = refunds.quote(order, request.items(), previous(order));

        ReturnRequest result = new ReturnRequest();
        result.setOrder(order);
        result.setUser(user);
        result.setReason(request.reason().trim());
        result.setEvidenceImages(String.join("\n", validateEvidence(request.evidenceUrls())));
        result.setStatus(ReturnStatus.PENDING);
        result.setCreatedAt(now());
        Set<Long> seen = new HashSet<>();
        for (ReturnItemRequest item : request.items()) {
            if (item == null || item.orderDetailID() == null || item.quantity() == null || item.quantity() <= 0) {
                throw bad("Mat hang va so luong tra khong hop le");
            }
            if (!seen.add(item.orderDetailID())) throw bad("Mat hang trung trong yeu cau");
            OrderDetail detail = orderDetails.findById(item.orderDetailID())
                    .orElseThrow(() -> notFound("Mat hang khong ton tai"));
            if (!Objects.equals(detail.getOrder().getOrderID(), order.getOrderID())) {
                throw bad("Mat hang khong thuoc don hang");
            }
            int reserved = returnItems.findByOrderDetail_OrderDetailID(detail.getOrderDetailID()).stream()
                    .filter(existing -> existing.getReturnRequest().getStatus() != ReturnStatus.REJECTED)
                    .mapToInt(ReturnRequestItem::getQuantity).sum();
            if (detail.getQuantity() == null || item.quantity() > detail.getQuantity() - reserved) {
                throw conflict("So luong tra vuot qua so luong con lai");
            }
            ReturnRequestItem entity = new ReturnRequestItem();
            entity.setReturnRequest(result);
            entity.setOrderDetail(detail);
            entity.setQuantity(item.quantity());
            var price = pricing.items().stream().filter(p -> p.orderDetailID().equals(item.orderDetailID())).findFirst().orElseThrow();
            entity.setGrossAmount(price.grossAmount());
            entity.setDiscountAmount(price.discountAmount());
            entity.setNetAmount(price.netAmount());
            result.getItems().add(entity);
        }
        ReturnRequest saved = returns.saveAndFlush(result);
        order.setStatus(OrderStatus.RETURN_PENDING);
        return toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ReturnResponse> myRequests(String username) {
        User user = currentUser(username);
        return returns.findByUser_UserID(user.getUserID()).stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public ReturnResponse get(String username, Long id) {
        User user = currentUser(username);
        ReturnRequest request = find(id);
        if (user.getRole() != UserRole.ADMIN && !Objects.equals(request.getUser().getUserID(), user.getUserID())) {
            throw notFound("Yeu cau tra hang khong ton tai");
        }
        return toResponse(request);
    }

    @Override
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public List<ReturnResponse> all() {
        return returns.findAll().stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public ReturnResponse changeStatus(Long id, UpdateReturnStatusRequest request) {
        if (request == null || (request.status() != ReturnStatus.APPROVED && request.status() != ReturnStatus.REJECTED)) {
            throw bad("Chi co the duyet hoac tu choi yeu cau");
        }
        if (request.adminNote() != null && request.adminNote().length() > 1000) throw bad("Ghi chu qua dai");
        Long orderID = em.createQuery("select r.order.orderID from ReturnRequest r where r.returnID = :id", Long.class)
                .setParameter("id", id).getResultStream().findFirst()
                .orElseThrow(() -> notFound("Yeu cau tra hang khong ton tai"));
        Order order = orderLocks.lockById(orderID).orElseThrow(() -> notFound("Don hang khong ton tai"));
        ReturnRequest entity = em.find(ReturnRequest.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (entity == null) throw notFound("Yeu cau tra hang khong ton tai");
        // find() can return a cached PENDING entity after another transaction won the lock.
        em.refresh(entity, LockModeType.PESSIMISTIC_WRITE);
        if (entity.getStatus() != ReturnStatus.PENDING) throw conflict("Yeu cau da duoc xu ly");
        entity.setStatus(request.status());
        entity.setAdminNote(request.adminNote());
        entity.setProcessedAt(now());
        em.flush();
        if (returns.findByOrder_OrderIDAndStatus(orderID, ReturnStatus.PENDING).isEmpty()) {
            order.setStatus(OrderStatus.DELIVERED);
        }
        return toResponse(entity);
    }

    private void validateCreate(CreateReturnRequest request) {
        if (request == null || request.orderID() == null || request.reason() == null
                || request.reason().isBlank() || request.reason().length() > 1000
                || request.items() == null || request.items().isEmpty()
                || request.evidenceUrls() == null || request.evidenceUrls().isEmpty()
                || request.evidenceUrls().size() > 5) {
            throw bad("Thieu don hang, ly do hoac mat hang tra");
        }
    }

    private List<String> validateEvidence(List<String> urls) {
        if (urls == null || urls.isEmpty() || urls.size() > 5) throw bad("Can 1 den 5 URL bang chung");
        List<String> clean = new ArrayList<>();
        for (String value : urls) {
            if (value == null || value.isBlank() || value.length() > 500 || value.contains("\n")) {
                throw bad("URL bang chung khong hop le");
            }
            URI uri;
            try { uri = URI.create(value.trim()); }
            catch (IllegalArgumentException e) { throw bad("URL bang chung khong hop le"); }
            if (!("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getHost() == null) throw bad("URL bang chung khong hop le");
            clean.add(uri.toString());
        }
        return clean;
    }

    private ReturnRequest find(Long id) {
        return returns.findById(id).orElseThrow(() -> notFound("Yeu cau tra hang khong ton tai"));
    }

    private User currentUser(String username) {
        if (username == null || username.isBlank()) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        User user = users.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!Boolean.TRUE.equals(user.getIsActive())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }

    private ReturnResponse toResponse(ReturnRequest request) {
        return new ReturnResponse(request.getReturnID(), request.getOrder().getOrderID(),
                request.getUser().getUserID(), request.getReason(),
                request.getEvidenceImages() == null ? List.of() : List.of(request.getEvidenceImages().split("\n")),
                request.getStatus(), request.getCreatedAt(), request.getProcessedAt(), request.getAdminNote(),
                request.getItems().stream().map(item -> new ReturnItemResponse(item.getReturnItemID(),
                        item.getOrderDetail().getOrderDetailID(), item.getOrderDetail().getVariant().getVariantID(),
                        item.getQuantity())).toList(), refunds.stored(request));
    }

    LocalDateTime now() { return LocalDateTime.now(); }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
    private ResponseStatusException notFound(String message) { return new ResponseStatusException(HttpStatus.NOT_FOUND, message); }
}
