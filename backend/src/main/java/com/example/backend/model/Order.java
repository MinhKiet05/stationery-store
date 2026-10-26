package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "order_id")
    private Long orderID;

    // Khách hàng
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    // Mã giảm giá
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "coupon_id")
    private Coupon coupon;

    // Ngày đặt hàng
    @Column(name = "order_date")
    private LocalDateTime orderDate;

    // Tổng tiền
    @Column(name = "total_amount", precision = 12, scale = 2)
    private BigDecimal totalAmount;

    // Địa chỉ giao hàng
    @Column(name = "shipping_address", length = 500)
    private String shippingAddress;

    // Số điện thoại
    @Column(name = "contact_phone", length = 30)
    private String contactPhone;

    // Trạng thái đơn hàng
    @Enumerated(EnumType.STRING)
    @Column(length = 30)
    @Builder.Default
    private OrderStatus status = OrderStatus.PENDING;

    // Phương thức thanh toán
    @Column(name = "payment_method", length = 50)
    private String paymentMethod;

    // Trạng thái thanh toán
    @Builder.Default
    @Column(name = "is_paid")
    private Boolean isPaid = false;

    // Số tiền giảm giá
    @Column(name = "discount_amount", precision = 12, scale = 2)
    private BigDecimal discountAmount;

    // Ngày giao hàng thành công
    @Column(name = "delivered_at")
    private LocalDateTime deliveredAt;

    // Chi tiết đơn hàng
    @OneToMany(
            mappedBy = "order",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    @Builder.Default
    private List<OrderDetail> orderDetails = new ArrayList<>();

    // Danh sách yêu cầu trả hàng
    @OneToMany(mappedBy = "order")
    @Builder.Default
    private List<ReturnRequest> returnRequests = new ArrayList<>();

    @PrePersist
    protected void onCreate() {
        if (orderDate == null) {
            orderDate = LocalDateTime.now();
        }
    }
}