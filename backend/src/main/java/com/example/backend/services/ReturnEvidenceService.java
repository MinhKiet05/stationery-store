package com.example.backend.services;

import com.example.backend.dto.returns.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.*;

/** External uploads run between a read-only preflight and a short locked write transaction. */
@Service
@RequiredArgsConstructor
@Slf4j
public class ReturnEvidenceService {
    private final ReturnRequestService returns;
    private final ReviewImageValidator validator;
    private final ReviewImageStorage storage;
    private final com.example.backend.security.RequestRateLimiter limiter;

    public ReturnResponse create(String username, CreateReturnRequest request, List<MultipartFile> files) {
        String trace = Optional.ofNullable(org.slf4j.MDC.get("return_request_id")).orElseGet(() -> UUID.randomUUID().toString());
        long started = System.nanoTime(), phaseStarted = started;
        String phase = "validation";
        log.info("return_submit request_id={} phase=received image_count={} bytes={}", trace,
                files == null ? 0 : files.size(), files == null ? 0 : files.stream().mapToLong(MultipartFile::getSize).sum());
        try {
            returns.preview(username, new RefundPreviewRequest(request.orderID(), request.items()));
            if (files == null || files.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vui lòng tải lên ít nhất 1 ảnh minh chứng.");
            var bytes = validator.validate(files, 0); // Validate the entire batch before any network call.
            limiter.acquire("return-upload", username, 10, java.time.Duration.ofMinutes(15));
            phaseComplete(trace, phase, phaseStarted);
            phase = "upload"; phaseStarted = System.nanoTime();
            List<String> ids = new ArrayList<>(), urls = new ArrayList<>();
            try {
                for (var image : bytes) {
                    long uploadStarted = System.nanoTime();
                    String id = storage.newPublicId("stationery-store/returns");
                    ids.add(id); // Include timeouts/unknown upload outcomes in cleanup by exact server-owned ID.
                    urls.add(storage.upload(image, id).getImageUrl());
                    log.info("return_submit request_id={} phase=upload_image index={} elapsed_ms={}", trace, urls.size(), elapsed(uploadStarted));
                }
            } catch (RuntimeException error) { ids.forEach(storage::deleteSafely); throw error; }
            phaseComplete(trace, phase, phaseStarted);
            phase = "database"; phaseStarted = System.nanoTime();
            var body = new CreateReturnRequest(request.orderID(), request.reason(), urls, request.items());
            try {
                // Registers rollback cleanup before business validation/save, including commit failures.
                var response = returns.createUploaded(username, body, ids);
                phaseComplete(trace, phase, phaseStarted); // Proxy returned: transaction commit completed.
                log.info("return_submit request_id={} phase=response_ready elapsed_ms={}", trace, elapsed(started));
                return response;
            } catch (org.springframework.transaction.CannotCreateTransactionException error) {
                ids.forEach(storage::deleteSafely); throw error;
            }
        } catch (RuntimeException error) {
            // Never log exception messages, request bodies, credentials or contact details.
            log.warn("return_submit request_id={} phase={} outcome=failed phase_ms={} total_ms={} error_type={}",
                    trace, phase, elapsed(phaseStarted), elapsed(started), error.getClass().getSimpleName());
            throw error;
        }
    }

    private static long elapsed(long started) { return (System.nanoTime() - started) / 1_000_000; }
    private static void phaseComplete(String trace, String phase, long started) {
        log.info("return_submit request_id={} phase={} outcome=completed elapsed_ms={}", trace, phase, elapsed(started));
    }
}
