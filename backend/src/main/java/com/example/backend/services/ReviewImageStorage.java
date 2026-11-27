package com.example.backend.services;

import com.cloudinary.Cloudinary;
import com.example.backend.model.ReviewImage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ReviewImageStorage {
    public static final String FOLDER = "stationery-store/reviews";
    private final Cloudinary cloudinary;

    public String newPublicId() {
        return newPublicId(FOLDER);
    }

    public String newPublicId(String folder) {
        if (!List.of(FOLDER, "stationery-store/returns").contains(folder)) throw new IllegalArgumentException("Unmanaged image folder");
        return folder + "/" + UUID.randomUUID();
    }

    public ReviewImage upload(byte[] bytes, String publicId) {
        if (!publicId.matches("stationery-store/(reviews|returns)/[0-9a-f-]{36}")) throw new IllegalArgumentException("Unmanaged image ID");
        String folder = publicId.substring(0, publicId.lastIndexOf('/'));
        if (!configured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Chưa cấu hình dịch vụ tải ảnh. Vui lòng liên hệ cửa hàng.");
        }
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, Map.of(
                    "public_id", publicId, "asset_folder", folder, "overwrite", false,
                    "resource_type", "image", "type", "upload",
                    "allowed_formats", List.of("jpg", "jpeg", "png", "webp")));
            String url = result.get("secure_url") instanceof String value ? value : "";
            URI uri = URI.create(url);
            if (!publicId.equals(result.get("public_id")) || url.length() > 500
                    || !"https".equals(uri.getScheme()) || uri.getHost() == null
                    || uri.getRawUserInfo() != null) {
                throw new IllegalStateException("Invalid image upload response");
            }
            return new ReviewImage(url, publicId);
        } catch (Exception error) {
            // SDK messages/responses can contain signed URLs or credentials.
            log.warn("Review image upload failed: public_id={}, error_type={}", publicId,
                    error.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Không thể tải ảnh. Vui lòng thử lại.");
        }
    }

    /** Idempotent best effort; retry from this log using the exact server-generated ID. */
    public void deleteSafely(String publicId) {
        if (publicId == null) {
            log.warn("Review image has no public_id; manual Cloudinary reconciliation required");
            return;
        }
        if (!publicId.matches("stationery-store/(reviews|returns)/[0-9a-f-]{36}")) {
            log.warn("Review image cleanup refused an unmanaged public_id");
            return;
        }
        try {
            if (!configured()) throw new IllegalStateException("Cloudinary unavailable");
            Map<?, ?> result = cloudinary.uploader().destroy(publicId,
                    Map.of("resource_type", "image", "type", "upload", "invalidate", true));
            if (!List.of("ok", "not found").contains(result.get("result"))) {
                throw new IllegalStateException("Unexpected deletion result");
            }
        } catch (Exception error) {
            log.error("REVIEW_IMAGE_CLEANUP_RETRY public_id={} error_type={}", publicId,
                    error.getClass().getSimpleName());
        }
    }

    private boolean configured() {
        return present(cloudinary.config.cloudName) && present(cloudinary.config.apiKey)
                && present(cloudinary.config.apiSecret);
    }

    private boolean present(String value) { return value != null && !value.isBlank(); }
}
