package com.example.backend.services.impl;

import com.example.backend.dto.order.*;
import com.example.backend.model.*;
import com.example.backend.repositories.*;
import com.example.backend.services.OrderService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {
    private final UserRepository users;
    private final CartRepository carts;
    private final CartItemRepository cartItems;
    private final ProductVariantRepository variants;
    private final CouponRepository coupons;
    private final OrderRepository orders;
    private final OrderLockRepository orderLocks;
    private final EntityManager em;
    private final com.example.backend.services.UserTrackingService tracking;

    @Override
    @Transactional
    public OrderResponse placeOrder(String username, PlaceOrderRequest request) {
        User user = currentUser(username);
        Cart cart = carts.findByUser_UserID(user.getUserID())
                .orElseThrow(() -> bad("Gio hang trong"));
        // Order creation is serialized for one cart to prevent double checkout.
        Cart lockedCart = em.find(Cart.class, cart.getCartID(), LockModeType.PESSIMISTIC_WRITE);
        List<CartItem> currentItems = cartItems.findByCart_CartID(lockedCart.getCartID());
        if (currentItems.isEmpty())
            throw bad("Gio hang trong");

        // Merge duplicate variant IDs, then lock rows in deterministic ascending order.
        Map<Long, Integer> quantities = new TreeMap<>();
        for (CartItem item : currentItems) {
            if (item.getQuantity() == null || item.getQuantity() <= 0)
                throw bad("So luong khong hop le");
            quantities.merge(item.getVariant().getVariantID(), item.getQuantity(), (a, b) -> Math.addExact(a, b));
        }
        Order order = new Order();
        order.setUser(user);
        order.setStatus(OrderStatus.PENDING);
        order.setIsPaid(false);
        order.setShippingAddress(request.shippingAddress().trim());
        order.setContactPhone(request.contactPhone().trim());
        order.setPaymentMethod(request.paymentMethod().trim());
        order.setOrderDate(LocalDateTime.now());

        BigDecimal subTotal = BigDecimal.ZERO;
        for (var entry : quantities.entrySet()) {
            ProductVariant variant = variants.findWithLockByVariantID(entry.getKey())
                    .orElseThrow(() -> notFound("Bien the khong ton tai"));
            if (!Boolean.TRUE.equals(variant.getAvailable()) ||
                    !Boolean.TRUE.equals(variant.getProduct().getAvailable()) ||
                    !Boolean.TRUE.equals(variant.getProduct().getIsActive())) {
                throw bad("San pham khong con duoc ban: " + variant.getVariantID());
            }
            int quantity = entry.getValue();
            if (variant.getStockQuantity() == null || variant.getStockQuantity() < quantity)
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Khong du ton kho cho bien the " + variant.getVariantID());
            BigDecimal unitPrice = variant.getPrice();
            if (unitPrice == null || unitPrice.signum() < 0)
                throw bad("Gia ban khong hop le");
            BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(quantity));
            subTotal = subTotal.add(lineTotal);
            variant.setStockQuantity(variant.getStockQuantity() - quantity);
            OrderDetail detail = new OrderDetail();
            detail.setOrder(order);
            detail.setVariant(variant);
            detail.setQuantity(quantity);
            detail.setUnitPrice(unitPrice);
            detail.setSubTotal(lineTotal);
            order.getOrderDetails().add(detail);
        }

        BigDecimal discount = BigDecimal.ZERO;
        if (request.couponCode() != null && !request.couponCode().isBlank()) {
            String code = request.couponCode().trim().toUpperCase(Locale.ROOT);
            Coupon existing = coupons.findByCode(code)
                    .orElseThrow(() -> bad("Ma giam gia khong hop le"));
            Coupon coupon = em.find(Coupon.class, existing.getCouponID(), LockModeType.PESSIMISTIC_WRITE);
            // Reload after acquiring the lock; find() may have returned a cached usage
            // count.
            em.refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
            LocalDate today = LocalDate.now();
            if (!Boolean.TRUE.equals(coupon.getIsActive())
                    || (coupon.getStartDate() != null && today.isBefore(coupon.getStartDate()))
                    || (coupon.getEndDate() != null && today.isAfter(coupon.getEndDate()))
                    || (coupon.getMinOrderValue() != null && subTotal.compareTo(coupon.getMinOrderValue()) < 0)) {
                throw bad("Ma giam gia khong ap dung duoc");
            }
            int used = coupon.getUsedCount() == null ? 0 : coupon.getUsedCount();
            if (coupon.getUsageLimit() != null && used >= coupon.getUsageLimit())
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ma giam gia da het luot");
            BigDecimal value = coupon.getDiscountValue();
            if (value == null || value.signum() < 0)
                throw bad("Gia tri giam gia khong hop le");
            if (coupon.getDiscountType() == DiscountType.PERCENTAGE) {
                if (value.compareTo(BigDecimal.valueOf(100)) > 0)
                    throw bad("Phan tram giam gia > 100");
                discount = subTotal.multiply(value).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
            } else if (coupon.getDiscountType() == DiscountType.FIXED_AMOUNT) {
                discount = value;
            } else {
                throw bad("Loai ma giam gia khong hop le");
            }
            discount = discount.min(subTotal);
            coupon.setUsedCount(used + 1);
            order.setCoupon(coupon);
        }
        order.setDiscountAmount(discount);
        order.setTotalAmount(subTotal.subtract(discount).setScale(2, RoundingMode.HALF_UP));
        Order saved = orders.saveAndFlush(order);
        cartItems.deleteAllInBatch(currentItems);
        em.flush();
        return toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderResponse> myOrders(String username) {
        User user = currentUser(username);
        return orders.findByUser_UserIDOrderByOrderDateDesc(user.getUserID())
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    public MyOrderHistoryResponse myOrderHistory(String username, int page, int size, String search, OrderStatus status, boolean summary) {
        if (page < 0 || page > 10000 || size < 1 || size > 50 || search.length() > 150) throw bad("Bộ lọc không hợp lệ");
        var user = currentUser(username);
        String where = " where o.user.userID=:user";
        var params = new LinkedHashMap<String,Object>(); params.put("user", user.getUserID());
        if (!search.isBlank()) {
            int index=0;
            for (String word : search.trim().split("\\s+")) {
                String name="word"+index++;
                String text = "concat(coalesce(p.title,''),' ',coalesce(v.title,''),' ',coalesce(b.name,''))";
                where += " and (concat('#st-',cast(o.orderID as string)) like :"+name+" escape '!' or concat('#',cast(o.orderID as string)) like :"+name+" escape '!' or " +
                    "exists(select d.orderDetailID from OrderDetail d join d.variant v join v.product p left join p.vendor b where d.order=o and " +
                    com.example.backend.services.NormalizedSearch.hql(text)+" like :"+name+" escape '!'))";
                params.put(name,com.example.backend.services.NormalizedSearch.pattern(word));
            }
        }
        var countQuery=em.createQuery("select o.status,count(o) from Order o"+where+" group by o.status",Object[].class);
        params.forEach(countQuery::setParameter);
        var counts=new EnumMap<OrderStatus,Long>(OrderStatus.class);
        for (Object[] row:countQuery.getResultList()) counts.put((OrderStatus)row[0],((Number)row[1]).longValue());
        long total=status==null ? counts.values().stream().mapToLong(Long::longValue).sum() : counts.getOrDefault(status,0L);
        if (summary) return new MyOrderHistoryResponse(List.of(),total,0,counts);
        if (status!=null) { where+=" and o.status=:status";params.put("status",status); }
        var query=em.createQuery("select o from Order o"+where+" order by o.orderDate desc,o.orderID desc",Order.class);
        params.forEach(query::setParameter);
        var content=query.setFirstResult(page*size).setMaxResults(size).getResultList().stream().map(this::toResponse).toList();
        return new MyOrderHistoryResponse(content,total,(int)((total+size-1)/size),counts);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrder(String username, Long orderID) {
        User user = currentUser(username);
        return toResponse(orders.findByOrderIDAndUser_UserID(orderID, user.getUserID())
                .orElseThrow(() -> notFound("Khong tim thay don hang")));
    }

    @Override
    @Transactional
    public OrderResponse cancelOrder(String username, Long orderID) {
        User user = currentUser(username);
        Order order = orderLocks.lockById(orderID)
                .orElseThrow(() -> notFound("Khong tim thay don hang"));
        if (!Objects.equals(order.getUser().getUserID(), user.getUserID()))
            throw notFound("Khong tim thay don hang");
        cancel(order);
        return toResponse(order);
    }

    @Override
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public List<OrderResponse> adminOrders() {
        return orders.findAll(org.springframework.data.domain.Sort.by(
                org.springframework.data.domain.Sort.Direction.DESC, "orderDate"))
                .stream().map(this::toResponse).toList();
    }

    @Override
    @Transactional(readOnly = true)
    @PreAuthorize("hasRole('ADMIN')")
    public AdminOrderDetailResponse adminOrder(Long orderID) {
        Order order = orders.findById(orderID).orElseThrow(() -> notFound("Khong tim thay don hang"));
        Map<Long, String> skus = new LinkedHashMap<>();
        order.getOrderDetails().forEach(item -> {
            if (item.getVariant().getSku() != null) skus.put(item.getVariant().getVariantID(), item.getVariant().getSku());
        });
        User customer = order.getUser();
        var returns = order.getReturnRequests().stream()
                .sorted(Comparator.comparing(ReturnRequest::getCreatedAt).reversed())
                .map(item -> new AdminOrderDetailResponse.ReturnSummary(item.getReturnID(), item.getReason(),
                        item.getStatus(), item.getCreatedAt(), item.getProcessedAt(), item.getAdminNote())).toList();
        return new AdminOrderDetailResponse(toResponse(order), customer.getFullName(), customer.getUsername(),
                customer.getEmail(), skus, returns);
    }

    @Override
    @Transactional
    @PreAuthorize("hasRole('ADMIN')")
    public OrderResponse adminChangeStatus(Long orderID, UpdateOrderStatusRequest request) {
        Order order = orderLocks.lockById(orderID)
                .orElseThrow(() -> notFound("Khong tim thay don hang"));
        // Reload after waiting for another writer; the persistence context may already contain this order.
        em.refresh(order);
        OrderStatus target = request.status();
        OrderStatus current = order.getStatus();
        if ((request.expectedStatus() != null && request.expectedStatus() != current)
                || (request.expectedPaid() != null && !Objects.equals(request.expectedPaid(), order.getIsPaid()))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Don hang da thay doi. Vui long tai lai");
        }
        if (target == null)
            throw bad("status khong duoc null");
        if (target == current)
            return toResponse(order);
        if (target == OrderStatus.CANCELLED) {
            cancel(order);
        } else if ((current == OrderStatus.PENDING && target == OrderStatus.PROCESSING)
                || (current == OrderStatus.PROCESSING && target == OrderStatus.SHIPPED)
                || (current == OrderStatus.SHIPPED && target == OrderStatus.DELIVERED)) {
            order.setStatus(target);
            if (target == OrderStatus.DELIVERED) {
                order.setDeliveredAt(LocalDateTime.now());
                tracking.recordPurchase(order);
            }
        } else {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Chuyen trang thai don hang khong hop le");
        }
        return toResponse(order);
    }

    private void cancel(Order order) {
        if (order.getStatus() != OrderStatus.PENDING && order.getStatus() != OrderStatus.PROCESSING)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Don hang khong the huy o trang thai nay");
        if (Boolean.TRUE.equals(order.getIsPaid()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Don da thanh toan: can quy trinh hoan tien rieng");
        // All order operations lock the order first; inventory locks use ascending
        // variant IDs.
        Map<Long, Integer> quantities = new TreeMap<>();
        for (OrderDetail item : order.getOrderDetails())
            quantities.merge(item.getVariant().getVariantID(), item.getQuantity(), Integer::sum);
        for (var entry : quantities.entrySet()) {
            ProductVariant variant = em.find(ProductVariant.class, entry.getKey());
            if (variant == null) throw notFound("Bien the khong ton tai");
            // Read the current version while acquiring the inventory lock, including when
            // another cancellation changed a variant already loaded by this transaction.
            em.refresh(variant, LockModeType.PESSIMISTIC_WRITE);
            variant.setStockQuantity(Math.addExact(variant.getStockQuantity(), entry.getValue()));
        }
        if (order.getCoupon() != null) {
            Coupon coupon = em.find(Coupon.class, order.getCoupon().getCouponID(), LockModeType.PESSIMISTIC_WRITE);
            em.refresh(coupon, LockModeType.PESSIMISTIC_WRITE);
            int used = coupon.getUsedCount() == null ? 0 : coupon.getUsedCount();
            coupon.setUsedCount(Math.max(0, used - 1));
        }
        order.setStatus(OrderStatus.CANCELLED);
    }

    private User currentUser(String username) {
        if (username == null || username.isBlank())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        User user = users.findByUsername(username)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        if (!Boolean.TRUE.equals(user.getIsActive()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        return user;
    }

    private OrderResponse toResponse(Order order) {
        List<OrderDetailResponse> details = order.getOrderDetails().stream()
                .map(this::toDetailResponse)
                .toList();
        BigDecimal subTotal = details.stream().map(OrderDetailResponse::subTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return new OrderResponse(order.getOrderID(), order.getUser().getUserID(), order.getOrderDate(),
                order.getStatus(), order.getShippingAddress(), order.getContactPhone(),
                order.getPaymentMethod(), order.getIsPaid(),
                order.getCoupon() == null ? null : order.getCoupon().getCode(),
                subTotal, order.getDiscountAmount(), order.getTotalAmount(), order.getDeliveredAt(), details);
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private OrderDetailResponse toDetailResponse(OrderDetail detail) {
        ProductVariant variant = detail.getVariant();
        Product product = variant.getProduct();
        String image = product.getImages().stream()
                .filter(url -> url != null && !url.isBlank()).findFirst().orElse(null);
        return new OrderDetailResponse(detail.getOrderDetailID(), variant.getVariantID(),
                variant.getTitle(), detail.getQuantity(), detail.getUnitPrice(), detail.getSubTotal(),
                product.getProductID(), product.getTitle(), product.getHandle(), image,
                product.getVendor() == null ? null : product.getVendor().getName());
    }

    private ResponseStatusException notFound(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
