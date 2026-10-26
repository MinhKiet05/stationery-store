package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(
        name = "product_types",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_product_type_name",
                        columnNames = "name"
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductType {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long productTypeID;

    @Column(nullable = false, length = 100)
    private String name;

    // Trạng thái hoạt động
    @Builder.Default
    @Column(nullable = false)
    private Boolean isActive = true;
}