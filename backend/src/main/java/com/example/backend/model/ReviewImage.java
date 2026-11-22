package com.example.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Embeddable
@Getter
@NoArgsConstructor
public class ReviewImage {
    @Column(name = "image_url", nullable = false, length = 500)
    private String imageUrl;

    // Nullable for pre-existing images. Never infer a deletion target from a URL.
    @Column(name = "cloudinary_public_id", length = 255)
    private String publicId;

    public ReviewImage(String imageUrl, String publicId) {
        this.imageUrl = imageUrl;
        this.publicId = publicId;
    }
}
