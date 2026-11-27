package com.example.backend.services;

import com.example.backend.dto.returns.*;
import com.example.backend.model.*;
import org.springframework.stereotype.Component;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

@Component
public class RefundCalculator {
    // Current checkout supports only whole-order merchandise coupons, never product/shipping coupons.
    // Use persisted prices/discount/fee exclusively; do not dereference Coupon or ProductVariant prices.
    public RefundPreview quote(Order order, List<ReturnItemRequest> selection, List<ReturnRequestItem> previous) {
        var details = order.getOrderDetails().stream().sorted(Comparator.comparing(OrderDetail::getOrderDetailID)).toList();
        if (details.isEmpty()) throw verify();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (var d : details) {
            if (d.getQuantity() == null || d.getQuantity() < 1 || d.getUnitPrice() == null || d.getSubTotal() == null
                    || d.getUnitPrice().signum() < 0 || d.getSubTotal().compareTo(d.getUnitPrice().multiply(BigDecimal.valueOf(d.getQuantity()))) != 0) throw verify();
            subtotal = subtotal.add(vnd(d.getSubTotal()));
            vnd(d.getUnitPrice());
        }
        BigDecimal discount = order.getDiscountAmount() == null ? BigDecimal.ZERO : vnd(order.getDiscountAmount());
        BigDecimal fee = order.getShippingFee() == null ? BigDecimal.ZERO : vnd(order.getShippingFee());
        if (discount.signum() < 0 || discount.compareTo(subtotal) > 0 || fee.signum() < 0 || order.getTotalAmount() == null
                || vnd(order.getTotalAmount()).compareTo(subtotal.subtract(discount).add(fee)) != 0) throw verify();
        Map<Long, BigDecimal> allocations = new HashMap<>();
        Map<Long, BigDecimal> remainders = new HashMap<>();
        BigDecimal allocated = BigDecimal.ZERO;
        for (var d : details) {
            BigDecimal numerator = discount.multiply(d.getSubTotal());
            BigDecimal part = subtotal.signum() == 0 ? BigDecimal.ZERO : numerator.divide(subtotal, 0, RoundingMode.DOWN);
            allocations.put(d.getOrderDetailID(), part);
            remainders.put(d.getOrderDetailID(), subtotal.signum() == 0 ? BigDecimal.ZERO : numerator.remainder(subtotal));
            allocated = allocated.add(part);
        }
        // Largest remainder, then orderDetailID: exact sum, deterministic even when collection order changes.
        var ranked = new ArrayList<>(details);
        ranked.sort(Comparator.<OrderDetail, BigDecimal>comparing(d -> remainders.get(d.getOrderDetailID())).reversed()
                .thenComparing(OrderDetail::getOrderDetailID));
        int residual = discount.subtract(allocated).intValueExact();
        for (int i = 0; i < residual; i++) allocations.compute(ranked.get(i).getOrderDetailID(), (id, value) -> value.add(BigDecimal.ONE));
        var selected = new HashSet<Long>();
        var lines = new ArrayList<RefundPreview.Item>();
        if (selection == null || selection.isEmpty()) throw bad("Vui lòng chọn sản phẩm cần trả.");
        for (var item : selection) {
            if (item == null || item.orderDetailID() == null || item.quantity() == null || item.quantity() < 1 || !selected.add(item.orderDetailID()))
                throw bad("Sản phẩm hoặc số lượng trả không hợp lệ.");
            var d = details.stream().filter(line -> line.getOrderDetailID().equals(item.orderDetailID())).findFirst()
                    .orElseThrow(() -> bad("Mat hang khong thuoc don hang"));
            int reserved = 0;
            BigDecimal reservedNet = BigDecimal.ZERO;
            for (var old : previous) {
                if (!Objects.equals(old.getOrderDetail().getOrderDetailID(), d.getOrderDetailID()) || old.getReturnRequest().getStatus() == ReturnStatus.REJECTED) continue;
                // Historical requests have no settlement ledger. Do not invent a previously paid refund.
                if (old.getNetAmount() == null) throw verify();
                reserved = Math.addExact(reserved, old.getQuantity());
                reservedNet = reservedNet.add(old.getNetAmount());
            }
            int remaining = d.getQuantity() - reserved;
            if (item.quantity() > remaining) throw new ResponseStatusException(HttpStatus.CONFLICT, "So luong tra vuot qua so luong con lai");
            BigDecimal pool = d.getSubTotal().subtract(allocations.get(d.getOrderDetailID())).subtract(reservedNet);
            if (pool.signum() < 0 || pool.compareTo(d.getUnitPrice().multiply(BigDecimal.valueOf(remaining))) > 0) throw verify();
            BigDecimal gross = d.getUnitPrice().multiply(BigDecimal.valueOf(item.quantity()));
            // Allocate from the remaining pool; last returned quantity receives the exact rounding residue.
            BigDecimal net = pool.multiply(BigDecimal.valueOf(item.quantity())).divide(BigDecimal.valueOf(remaining), 0, RoundingMode.DOWN);
            lines.add(new RefundPreview.Item(d.getOrderDetailID(), item.quantity(), d.getUnitPrice(), gross, gross.subtract(net), net));
        }
        return summarize(lines, Boolean.TRUE.equals(order.getIsPaid()));
    }

    public RefundPreview stored(ReturnRequest request) {
        if (request.getItems().isEmpty() || request.getItems().stream().anyMatch(i -> i.getNetAmount() == null)) return null;
        return summarize(request.getItems().stream().map(i -> new RefundPreview.Item(i.getOrderDetail().getOrderDetailID(),
                i.getQuantity(), i.getOrderDetail().getUnitPrice(), i.getGrossAmount(), i.getDiscountAmount(), i.getNetAmount())).toList(),
                Boolean.TRUE.equals(request.getOrder().getIsPaid()));
    }

    public RefundPreview stored(List<AdminReturnDetailResponse.Item> items, Boolean paid) {
        if (items.isEmpty() || items.stream().anyMatch(i -> i.netAmount() == null)) return null;
        return summarize(items.stream().map(i -> new RefundPreview.Item(i.orderDetailID(), i.quantity(), i.unitPrice(),
                i.grossAmount(), i.discountAmount(), i.netAmount())).toList(), Boolean.TRUE.equals(paid));
    }

    private RefundPreview summarize(List<RefundPreview.Item> lines, boolean paid) {
        return new RefundPreview(lines, lines.stream().map(RefundPreview.Item::grossAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                lines.stream().map(RefundPreview.Item::discountAmount).reduce(BigDecimal.ZERO, BigDecimal::add),
                lines.stream().map(RefundPreview.Item::netAmount).reduce(BigDecimal.ZERO, BigDecimal::add), paid, null, null, null);
    }
    private BigDecimal vnd(BigDecimal value) { try { return value.setScale(0, RoundingMode.UNNECESSARY); } catch (ArithmeticException e) { throw verify(); } }
    private ResponseStatusException verify() { return new ResponseStatusException(HttpStatus.CONFLICT, "Dữ liệu tiền hàng hoặc yêu cầu cũ cần CSKH đối soát trước khi tính hoàn tiền."); }
    private ResponseStatusException bad(String text) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, text); }
}
