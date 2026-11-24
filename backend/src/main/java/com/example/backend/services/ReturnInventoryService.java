package com.example.backend.services;

import com.example.backend.dto.returns.*;
import com.example.backend.model.*;
import com.example.backend.repositories.OrderLockRepository;
import com.example.backend.repositories.UserRepository;
import jakarta.persistence.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional
@PreAuthorize("hasRole('ADMIN')")
public class ReturnInventoryService {
    private final EntityManager em;
    private final OrderLockRepository orderLocks;
    private final UserRepository users;
    private final AdminReturnService queries;

    public AdminReturnDetailResponse receive(Long id, ReceiveReturnRequest body) {
        ReturnRequest request = lockApproved(id);
        if (em.find(ReturnReceipt.class, id) != null) throw conflict("Yeu cau da duoc xac nhan nhan hang. Vui long tai lai");
        var originals = originalItems(id);
        if (body == null || body.items() == null || body.items().isEmpty()) throw bad("Thieu so luong thuc nhan");
        Map<Long, Integer> quantities = new HashMap<>(); long total = 0;
        for (var item : body.items()) {
            if (item == null || item.returnItemID() == null || quantities.containsKey(item.returnItemID())) throw bad("Muc tra hang khong hop le hoac bi trung");
            int quantity = integer(item.receivedQuantity()); quantities.put(item.returnItemID(), quantity); total += quantity;
        }
        requireSameItems(originals.keySet(), quantities.keySet());
        if (total == 0) throw bad("Phai co it nhat mot san pham thuc nhan");
        for (var original : originals.values()) if (quantities.get(original.getReturnItemID()) > original.getQuantity()) throw bad("Thuc nhan vuot so luong duoc tra");

        var receipt = new ReturnReceipt(); receipt.setReturnID(request.getReturnID()); receipt.setReceivedAt(LocalDateTime.now()); receipt.setReceivedBy(currentAdmin()); em.persist(receipt);
        for (var original : originals.values()) {
            var line = new ReturnReceiptItem(); line.setReturnItemID(original.getReturnItemID()); line.setReceipt(receipt);
            // Variant identity comes exclusively from the persisted order detail, never the payload.
            line.setVariant(original.getOrderDetail().getVariant()); line.setReceivedQuantity(quantities.get(original.getReturnItemID())); em.persist(line);
        }
        em.flush();
        return queries.detail(id);
    }

    public AdminReturnDetailResponse restock(Long id, RestockReturnRequest body) {
        lockApproved(id);
        ReturnReceipt receipt = em.find(ReturnReceipt.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (receipt == null) throw conflict("Chua xac nhan nhan hang tra ve");
        em.refresh(receipt, LockModeType.PESSIMISTIC_WRITE);
        if (receipt.getInspectedAt() != null) throw conflict("Yeu cau da kiem tra va nhap kho. Khong the nhap lai");
        if (body == null || body.items() == null || body.items().isEmpty() || (body.inspectionNote() != null && body.inspectionNote().length() > 1000)) throw bad("Du lieu kiem tra khong hop le");
        var originals = originalItems(id);
        List<ReturnReceiptItem> lines = em.createQuery("select i from ReturnReceiptItem i join fetch i.variant where i.receipt.returnID = :id order by i.returnItemID", ReturnReceiptItem.class)
                .setParameter("id", id).getResultList();
        Map<Long, RestockReturnRequest.Item> results = new HashMap<>();
        for (var item : body.items()) {
            if (item == null || item.returnItemID() == null || results.putIfAbsent(item.returnItemID(), item) != null) throw bad("Muc tra hang khong hop le hoac bi trung");
        }
        requireSameItems(originals.keySet(), results.keySet());
        if (lines.size() != originals.size()) throw conflict("Du lieu nhan hang khong day du");
        record Classification(ReturnReceiptItem line, int good, int damaged) {}
        var classified = new ArrayList<Classification>(); var deltas = new TreeMap<Long, Long>();
        for (var line : lines) {
            var original = originals.get(line.getReturnItemID()); var result = results.get(line.getReturnItemID());
            if (original == null || result == null || !Objects.equals(original.getOrderDetail().getVariant().getVariantID(), line.getVariant().getVariantID())
                    || line.getReceivedQuantity() > original.getQuantity() || line.getGoodQuantity() != null || line.getDamagedQuantity() != null) throw conflict("Du lieu nhan hang da thay doi");
            int good = integer(result.goodQuantity()), damaged = integer(result.damagedQuantity());
            if ((long) good + damaged != line.getReceivedQuantity()) throw bad("Phai phan loai du so luong thuc nhan thanh hang tot va hang hong");
            classified.add(new Classification(line, good, damaged));
            deltas.merge(line.getVariant().getVariantID(), (long) good, Long::sum);
        }
        // Same ascending variant-lock order as checkout/cancellation. Refresh prevents stale overwrites.
        Map<Long, ProductVariant> locked = new TreeMap<>(); Map<Long, Integer> cursor = new HashMap<>();
        for (var entry : deltas.entrySet()) {
            // Acquire the lock through refresh itself. Upgrading a cached @Version entity
            // via find(..., lock) can compare its old version before we can reload it.
            ProductVariant variant = em.find(ProductVariant.class, entry.getKey());
            if (variant == null) throw conflict("Bien the khong con ton tai");
            em.refresh(variant, LockModeType.PESSIMISTIC_WRITE);
            if (variant.getStockQuantity() == null || variant.getStockQuantity() < 0
                    || (long) variant.getStockQuantity() + entry.getValue() > Integer.MAX_VALUE) throw conflict("Ton kho vuot gioi han cho phep");
            locked.put(entry.getKey(), variant); cursor.put(entry.getKey(), variant.getStockQuantity());
        }
        for (var result : classified) {
            var line = result.line(); Long variantID = line.getVariant().getVariantID(); int before = cursor.get(variantID), after = before + result.good();
            line.setGoodQuantity(result.good()); line.setDamagedQuantity(result.damaged()); line.setStockBefore(before); line.setStockAfter(after); cursor.put(variantID, after);
        }
        locked.forEach((variantID, variant) -> { if (deltas.get(variantID) > 0) variant.setStockQuantity(cursor.get(variantID)); });
        receipt.setInspectedAt(LocalDateTime.now()); receipt.setInspectedBy(currentAdmin());
        receipt.setInspectionNote(body.inspectionNote() == null ? null : body.inspectionNote().strip());
        // Inventory + immutable per-item trace + completion marker commit in ONE transaction.
        em.flush();
        return queries.detail(id);
    }

    private ReturnRequest lockApproved(Long id) {
        Long orderID = em.createQuery("select r.order.orderID from ReturnRequest r where r.returnID = :id", Long.class).setParameter("id", id).getResultStream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Yeu cau tra hang khong ton tai"));
        orderLocks.lockById(orderID).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Don hang khong ton tai"));
        ReturnRequest request = em.find(ReturnRequest.class, id, LockModeType.PESSIMISTIC_WRITE);
        if (request == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Yeu cau tra hang khong ton tai");
        em.refresh(request, LockModeType.PESSIMISTIC_WRITE);
        if (request.getStatus() != ReturnStatus.APPROVED) throw conflict("Chi xu ly nhan hang va nhap kho cho yeu cau da duyet");
        return request;
    }
    private Map<Long, ReturnRequestItem> originalItems(Long id) {
        List<ReturnRequestItem> items = em.createQuery("select i from ReturnRequestItem i join fetch i.orderDetail d join fetch d.variant where i.returnRequest.returnID = :id order by i.returnItemID", ReturnRequestItem.class)
                .setParameter("id", id).getResultList();
        if (items.isEmpty()) throw conflict("Yeu cau khong co mat hang de xu ly");
        Map<Long, ReturnRequestItem> result = new LinkedHashMap<>(); items.forEach(i -> result.put(i.getReturnItemID(), i)); return result;
    }
    private User currentAdmin() {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        User actor = users.findByUsername(authentication.getName()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (actor.getRole() != UserRole.ADMIN || !Boolean.TRUE.equals(actor.getIsActive())) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return actor;
    }
    private int integer(BigDecimal value) {
        try { int quantity = value.intValueExact(); if (quantity < 0) throw bad("So luong phai la so nguyen khong am"); return quantity; }
        catch (ArithmeticException | NullPointerException invalid) { throw bad("So luong phai la so nguyen hop le"); }
    }
    private void requireSameItems(Set<Long> expected, Set<Long> actual) { if (!expected.equals(actual)) throw bad("Phai gui dung va du cac muc tra hang cua yeu cau"); }
    private ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
