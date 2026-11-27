package com.example.backend.services;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.util.Base64;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

class ReviewImageValidatorTest {
    private final ReviewImageValidator validator = new ReviewImageValidator();

    static MockMultipartFile image(String format) throws Exception {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), format, output);
        return new MockMultipartFile("images", "untrusted.txt", "image/" + format, output.toByteArray());
    }

    @Test void acceptsRealJpegAndPngWithMatchingMimeAndUntrustedNames() throws Exception {
        assertThat(validator.validate(List.of(image("png"), image("jpeg")), 0)).hasSize(2);
    }

    @Test void acceptsDecodedWebp() {
        byte[] webp = Base64.getDecoder().decode("UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=");
        assertThat(validator.validate(List.of(new MockMultipartFile("images", "x.webp", "image/webp", webp)), 0))
                .hasSize(1);
    }

    @Test void rejectsFakeImageWithImageMimeAndExtension() {
        var file = new MockMultipartFile("images", "x.png", "image/png", "<script>bad</script>".getBytes());
        assertStatus(() -> validator.validate(List.of(file), 0), 400);
    }

    @Test void rejectsRealImageWithFalseMime() throws Exception {
        var png = image("png");
        assertStatus(() -> validator.validate(List.of(new MockMultipartFile("images", "x.jpg", "image/jpeg", png.getBytes())), 0), 400);
    }

    @Test void rejectsGifAndTruncatedPng() throws Exception {
        assertStatus(() -> validator.validate(List.of(image("gif")), 0), 400);
        byte[] bytes = image("png").getBytes();
        var truncated = new MockMultipartFile("images", "x.png", "image/png", java.util.Arrays.copyOf(bytes, 30));
        assertStatus(() -> validator.validate(List.of(truncated), 0), 400);
    }

    @Test void rejectsEmptyAndOversizedFiles() {
        assertStatus(() -> validator.validate(List.of(new MockMultipartFile("images", new byte[0])), 0), 400);
        assertStatus(() -> validator.validate(List.of(new MockMultipartFile("images",
                new byte[ReviewImageValidator.MAX_BYTES + 1])), 0), 413);
    }

    @Test void enforcesTotalOfRetainedAndNewImages() throws Exception {
        var image = image("png");
        assertStatus(() -> validator.validate(Collections.nCopies(6, image), 0), 400);
        assertStatus(() -> validator.validate(List.of(image, image), 4), 400);
        assertThat(validator.validate(List.of(image), 4)).hasSize(1);
    }

    static void assertStatus(org.assertj.core.api.ThrowableAssert.ThrowingCallable action, int status) {
        assertThatThrownBy(action).isInstanceOfSatisfying(ResponseStatusException.class,
                error -> assertThat(error.getStatusCode().value()).isEqualTo(status));
    }
}
