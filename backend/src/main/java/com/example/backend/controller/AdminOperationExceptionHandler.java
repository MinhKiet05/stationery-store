package com.example.backend.controller;

import org.springframework.dao.DataAccessException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = {AdminOrderController.class, AdminProductVariantController.class, AdminReviewController.class, AdminPromotionController.class, AdminReturnRequestController.class})
public class AdminOperationExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail business(ResponseStatusException error) {
        return ProblemDetail.forStatusAndDetail(error.getStatusCode(), error.getReason());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalid() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Du lieu khong hop le");
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    public ProblemDetail conflict() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Du lieu da thay doi. Vui long tai lai");
    }

    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail unavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Khong the xu ly yeu cau luc nay");
    }

    @ExceptionHandler({org.springframework.validation.BindException.class, java.io.IOException.class})
    public ProblemDetail exportOrBinding(Exception error) {
        return ProblemDetail.forStatusAndDetail(error instanceof org.springframework.validation.BindException
                ? HttpStatus.BAD_REQUEST : HttpStatus.SERVICE_UNAVAILABLE, "Khong the xu ly yeu cau luc nay");
    }
}
