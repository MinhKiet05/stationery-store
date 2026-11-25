package com.example.backend.controller;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
@RestControllerAdvice(assignableTypes=AdminProductController.class) @Order(0)
public class AdminProductExceptionHandler {
    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail invalid(){return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"Du lieu san pham khong hop le");}
    @ExceptionHandler(org.springframework.dao.DataIntegrityViolationException.class)
    public ProblemDetail duplicate(){return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,"Du lieu trung lap hoac da duoc su dung");}
}
