package com.example.backend.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

/** Do not expose submitted credentials, reset tokens, or SMTP diagnostics. */
@RestControllerAdvice(assignableTypes = PasswordResetController.class)
public class PasswordResetExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class)
    public ProblemDetail businessError(ResponseStatusException exception) {
        return ProblemDetail.forStatusAndDetail(exception.getStatusCode(), exception.getReason());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
    public ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Du lieu khong hop le");
    }

    @ExceptionHandler(Exception.class)
    public ProblemDetail unexpectedError() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Khong the xu ly yeu cau luc nay. Vui long thu lai sau.");
    }
}
