package com.example.backend.controller;

import com.example.backend.services.CheckoutFailure;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = CheckoutController.class)
public class CheckoutExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    ProblemDetail business(ResponseStatusException error) {
        var problem = ProblemDetail.forStatusAndDetail(error.getStatusCode(),
                error instanceof CheckoutFailure ? error.getReason() : "Không thể tính tổng đơn. Vui lòng kiểm tra giỏ hàng.");
        problem.setProperty("code", error instanceof CheckoutFailure failure ? failure.code() : "CHECKOUT_UNAVAILABLE");
        return problem;
    }
    @ExceptionHandler({org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class})
    ProblemDetail invalid() {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Thông tin tính đơn không hợp lệ. Vui lòng kiểm tra phương thức vận chuyển và mã giảm giá.");
        problem.setProperty("code", "CHECKOUT_INVALID_INPUT");
        return problem;
    }
    @ExceptionHandler(org.springframework.dao.DataAccessException.class)
    ProblemDetail unavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Dịch vụ tạm thời gián đoạn. Vui lòng thử lại sau.");
    }
}
