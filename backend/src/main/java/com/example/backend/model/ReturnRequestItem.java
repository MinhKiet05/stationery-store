package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "return_request_items")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReturnRequestItem {

    @Column(name = "gross_amount", precision = 12, scale = 2)
    private java.math.BigDecimal grossAmount;
    @Column(name = "discount_amount", precision = 12, scale = 2)
    private java.math.BigDecimal discountAmount;
    @Column(name = "net_amount", precision = 12, scale = 2)
    private java.math.BigDecimal netAmount;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "return_item_id")
    private Long returnItemID;

    // Yêu cầu trả hàng
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "return_id", nullable = false)
    private ReturnRequest returnRequest;

    // Sản phẩm thuộc đơn hàng gốc
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_detail_id", nullable = false)
    private OrderDetail orderDetail;

    // Số lượng yêu cầu trả
    @Column(nullable = false)
    private Integer quantity;
}
