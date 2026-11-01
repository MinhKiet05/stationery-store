package com.example.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.dao.DataAccessException;
import org.springframework.validation.BindException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = StatisticsController.class)
public class StatisticsExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail businessError(ResponseStatusException exception) {
        return ProblemDetail.forStatusAndDetail(exception.getStatusCode(),
                exception.getReason() == null ? "Invalid statistics request" : exception.getReason());
    }

    @ExceptionHandler({BindException.class, MethodArgumentTypeMismatchException.class})
    public ProblemDetail invalidParameters() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Tham số không hợp lệ: ngày phải có dạng yyyy-MM-dd, tiêu chí sắp xếp và giới hạn phải hợp lệ");
    }

    @ExceptionHandler(DataAccessException.class)
    public ProblemDetail databaseError() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Không thể lấy dữ liệu thống kê");
    }
}
