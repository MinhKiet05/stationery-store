package com.example.backend.services;

import com.cloudinary.Cloudinary;
import com.cloudinary.Uploader;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.example.backend.services.ReviewImageValidatorTest.assertStatus;

class ReviewImageStorageTest {
    private Uploader uploader;
    private ReviewImageStorage storage;
    private String id;

    @BeforeEach void setup() {
        var cloudinary = spy(new Cloudinary(Map.of("cloud_name", "test", "api_key", "test", "api_secret", "test")));
        uploader = mock(Uploader.class);
        doReturn(uploader).when(cloudinary).uploader();
        storage = new ReviewImageStorage(cloudinary);
        id = storage.newPublicId();
    }

    @Test void storesOnlySecureUrlAndServerPublicId() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of(
                "public_id", id, "secure_url", "https://res.cloudinary.com/test/image/upload/example.png"));
        var result = storage.upload(new byte[]{1}, id);
        assertThat(result.getPublicId()).isEqualTo(id);
        assertThat(result.getImageUrl()).startsWith("https://");
        verify(uploader).upload(any(byte[].class), argThat(options ->
                id.equals(options.get("public_id")) && Boolean.FALSE.equals(options.get("overwrite"))
                        && ReviewImageStorage.FOLDER.equals(options.get("asset_folder"))));
    }

    @Test void hidesCloudinaryFailureDetails() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenThrow(new IOException("api_secret=sensitive"));
        assertStatus(() -> storage.upload(new byte[]{1}, id), 502);
        assertThatThrownBy(() -> storage.upload(new byte[]{1}, id)).hasMessageNotContaining("sensitive");
    }

    @Test void rejectsInsecureUrlAndMismatchedPublicId() throws Exception {
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("public_id", id,
                "secure_url", "http://res.cloudinary.com/test/image/upload/x.png"));
        assertStatus(() -> storage.upload(new byte[]{1}, id), 502);
        when(uploader.upload(any(byte[].class), anyMap())).thenReturn(Map.of("public_id", "someone-elses-id",
                "secure_url", "https://res.cloudinary.com/test/image/upload/x.png"));
        assertStatus(() -> storage.upload(new byte[]{1}, id), 502);
    }

    @Test void missingConfigurationDisablesOnlyUpload() {
        var unavailable = new ReviewImageStorage(new Cloudinary(Map.of("cloud_name", "", "api_key", "", "api_secret", "")));
        assertStatus(() -> unavailable.upload(new byte[]{1}, id), 503);
    }

    @Test void deletionIsIdempotentAndFailureDoesNotEscape() throws Exception {
        when(uploader.destroy(eq(id), anyMap())).thenReturn(Map.of("result", "not found"));
        assertThatCode(() -> storage.deleteSafely(id)).doesNotThrowAnyException();
        when(uploader.destroy(eq(id), anyMap())).thenThrow(new IOException("api_secret=sensitive"));
        assertThatCode(() -> storage.deleteSafely(id)).doesNotThrowAnyException();
        storage.deleteSafely("catalog/someone-elses-image");
        storage.deleteSafely(null);
        verify(uploader, times(2)).destroy(eq(id), anyMap());
        verifyNoMoreInteractions(uploader);
    }
}
