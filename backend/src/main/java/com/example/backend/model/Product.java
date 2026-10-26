package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Entity
@Table(name = "products")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long productID;

    @Column(nullable = false, length = 200)
    private String title;

    @Column(length = 100, unique = true)
    private String handle;

    @Column(length = 100)
    private String url;

    @Builder.Default
    private Boolean available = true;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(precision = 12, scale = 2)
    private BigDecimal price;

    @Column(precision = 12, scale = 2)
    private BigDecimal priceMin;

    @Column(precision = 12, scale = 2)
    private BigDecimal priceMax;

    @Column(precision = 12, scale = 2)
    private BigDecimal compareAtPrice;

    // Điểm đánh giá trung bình
    @Builder.Default
    @Column(nullable = false, precision = 3, scale = 2)
    private BigDecimal ratingAverage = BigDecimal.ZERO;

    // Tổng số lượt đánh giá
    @Builder.Default
    @Column(nullable = false)
    private Integer reviewCount = 0;

    // Danh sách hình ảnh
    @ElementCollection
    @CollectionTable(
            name = "product_images",
            joinColumns = @JoinColumn(name = "product_id")
    )
    @Column(name = "image_url", length = 500)
    @OrderColumn(name = "image_position")
    @Builder.Default
    private List<String> images = new ArrayList<>();

    // Thương hiệu
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vendor_id")
    private Vendor vendor;

    // Danh mục sản phẩm
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_type_id")
    private ProductType productType;

    // Tags
    @ManyToMany
    @JoinTable(
            name = "product_tags",
            joinColumns = @JoinColumn(name = "product_id"),
            inverseJoinColumns = @JoinColumn(name = "tag_id")
    )
    @Builder.Default
    private Set<Tag> tags = new HashSet<>();

    // Biến thể sản phẩm
    @OneToMany(
            mappedBy = "product",
            cascade = CascadeType.ALL,
            orphanRemoval = true
    )
    @Builder.Default
    private List<ProductVariant> variants = new ArrayList<>();

    // Đánh giá
    @OneToMany(mappedBy = "product")
    @Builder.Default
    private List<Review> reviews = new ArrayList<>();

    // Xóa mềm
    @Builder.Default
    @Column(nullable = false)
    private Boolean isActive = true;
}