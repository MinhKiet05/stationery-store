package com.example.backend.services;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Component
public class ReviewImageValidator {
    public static final int MAX_IMAGES = 5;
    public static final int MAX_BYTES = 5 * 1024 * 1024;
    // Bound decoded memory as well as compressed bytes (decompression bombs).
    private static final long MAX_PIXELS = 20_000_000;

    public List<byte[]> validate(List<MultipartFile> files, int retainedCount) {
        List<MultipartFile> uploads = files == null ? List.of() : files;
        if (retainedCount + uploads.size() > MAX_IMAGES) {
            throw badRequest("Moi danh gia chi duoc toi da 5 anh");
        }
        List<byte[]> validated = new ArrayList<>();
        for (MultipartFile file : uploads) {
            if (file == null || file.isEmpty()) throw badRequest("File anh khong duoc rong");
            if (file.getSize() > MAX_BYTES) throw tooLarge();
            try (var stream = file.getInputStream()) {
                byte[] bytes = stream.readNBytes(MAX_BYTES + 1);
                if (bytes.length > MAX_BYTES) throw tooLarge();
                validateContent(bytes);
                validated.add(bytes);
            } catch (IOException error) {
                throw badRequest("Khong the doc file anh");
            }
        }
        return validated;
    }

    private void validateContent(byte[] bytes) {
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw badRequest("Chi chap nhan anh JPEG, PNG, WebP hop le");
            ImageReader reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("jpeg", "jpg", "png", "webp").contains(format)) {
                    throw badRequest("Chi chap nhan anh JPEG, PNG, WebP hop le");
                }
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width <= 0 || height <= 0 || (long) width * height > MAX_PIXELS) {
                    throw badRequest("Anh vuot qua gioi han 20 megapixel");
                }
                if (reader.read(0) == null) throw badRequest("Noi dung anh khong hop le");
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException error) {
            if (error instanceof ResponseStatusException status) throw status;
            throw badRequest("Noi dung anh khong hop le hoac bi hong");
        }
    }

    private ResponseStatusException badRequest(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }

    private ResponseStatusException tooLarge() {
        return new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Moi anh khong duoc qua 5 MB");
    }
}
