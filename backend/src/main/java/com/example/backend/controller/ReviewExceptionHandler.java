package com.example.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

@RestControllerAdvice(assignableTypes = {ReviewController.class, ProductReviewController.class, ReturnRequestController.class})
public class ReviewExceptionHandler {
    @ExceptionHandler({org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.web.multipart.support.MissingServletRequestPartException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<Map<String, String>> invalid() { return ResponseEntity.badRequest().body(Map.of("message", "Thông tin hoặc ảnh chưa hợp lệ.")); }

    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    ResponseEntity<Map<String, String>> unavailable() { return ResponseEntity.status(503).body(Map.of("message", "Không thể lưu yêu cầu. Vui lòng thử lại.")); }
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> handle(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(Map.of("message",
                error.getReason() == null ? "Yeu cau khong hop le" : error.getReason()));
    }

    @ExceptionHandler(MaxUploadSizeExceededException.class)
    ResponseEntity<Map<String, String>> oversized() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("message", "Moi anh toi da 5 MB; tong request toi da 26 MB"));
    }
}
