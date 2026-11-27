package com.example.backend.services;

import com.example.backend.dto.returns.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.*;

/** External uploads run between a read-only preflight and a short locked write transaction. */
@Service
@RequiredArgsConstructor
public class ReturnEvidenceService {
    private final ReturnRequestService returns;
    private final ReviewImageValidator validator;
    private final ReviewImageStorage storage;
    private final com.example.backend.security.RequestRateLimiter limiter;

    public ReturnResponse create(String username, CreateReturnRequest request, List<MultipartFile> files) {
        returns.preview(username, new RefundPreviewRequest(request.orderID(), request.items()));
        if (files == null || files.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vui lòng tải lên ít nhất 1 ảnh minh chứng.");
        var bytes = validator.validate(files, 0); // Validate the entire batch before any network call.
        limiter.acquire("return-upload", username, 10, java.time.Duration.ofMinutes(15));
        List<String> ids = new ArrayList<>(), urls = new ArrayList<>();
        try {
            for (var image : bytes) {
                String id = storage.newPublicId("stationery-store/returns");
                ids.add(id); // Include timeouts/unknown upload outcomes in cleanup by exact server-owned ID.
                urls.add(storage.upload(image, id).getImageUrl());
            }
        } catch (RuntimeException error) { ids.forEach(storage::deleteSafely); throw error; }
        var body = new CreateReturnRequest(request.orderID(), request.reason(), urls, request.items());
        try {
            // Registers rollback cleanup before business validation/save, including commit failures.
            return returns.createUploaded(username, body, ids);
        } catch (org.springframework.transaction.CannotCreateTransactionException error) {
            ids.forEach(storage::deleteSafely); throw error;
        }
    }
}
