package com.example.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice(assignableTypes = ProductTypeController.class)
public class ProductTypeExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail businessError(ResponseStatusException exception) {
        return ProblemDetail.forStatusAndDetail(exception.getStatusCode(),
                exception.getReason() == null ? "Invalid request" : exception.getReason());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ProblemDetail malformedBody() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Invalid JSON or data type");
    }
}
