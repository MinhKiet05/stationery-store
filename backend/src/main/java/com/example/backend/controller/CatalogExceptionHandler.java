package com.example.backend.controller;

import org.springframework.dao.DataAccessException;
import org.springframework.data.core.PropertyReferenceException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

/** Catalog failures have explicit statuses without exposing handles, SQL or parser diagnostics. */
@RestControllerAdvice(assignableTypes = {ProductController.class, ProductVariantController.class})
public class CatalogExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail business(ResponseStatusException error) {
        return ProblemDetail.forStatusAndDetail(error.getStatusCode(), error.getReason());
    }

    @ExceptionHandler({IllegalArgumentException.class, PropertyReferenceException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalid() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Dữ liệu sản phẩm hoặc bộ lọc không hợp lệ");
    }

    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail unavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Chưa thể tải dữ liệu sản phẩm. Vui lòng thử lại.");
    }
}
