package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

/** Persisted inspection is also the one-time inventory adjustment trace for this return item. */
@Entity
@Table(name = "return_receipt_items")
@Getter @Setter @NoArgsConstructor
public class ReturnReceiptItem {
    @Id @Column(name = "return_item_id") private Long returnItemID;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "return_id", nullable = false) private ReturnReceipt receipt;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "variant_id", nullable = false) private ProductVariant variant;
    @Column(name = "received_quantity", nullable = false) private Integer receivedQuantity;
    @Column(name = "good_quantity") private Integer goodQuantity;
    @Column(name = "damaged_quantity") private Integer damagedQuantity;
    @Column(name = "stock_before") private Integer stockBefore;
    @Column(name = "stock_after") private Integer stockAfter;
}
