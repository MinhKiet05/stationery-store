package com.example.backend.model;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "product_types")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ProductType {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long productTypeID;

    @Column(nullable = false, length = 100)
    private String name;
}
