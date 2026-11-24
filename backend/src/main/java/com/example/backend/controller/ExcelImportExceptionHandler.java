package com.example.backend.controller;

import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.support.MissingServletRequestPartException;

@RestControllerAdvice(assignableTypes=ExcelImportController.class) @Order(0)
public class ExcelImportExceptionHandler {
    @ExceptionHandler(DataIntegrityViolationException.class) public ProblemDetail conflict(){return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,"Du lieu da ton tai hoac da thay doi; toan bo import duoc rollback. Vui long preview lai");}
    @ExceptionHandler({IllegalArgumentException.class,MissingServletRequestPartException.class}) public ProblemDetail invalid(){return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"File hoac du lieu import khong hop le");}
    @ExceptionHandler(MaxUploadSizeExceededException.class) public ProblemDetail large(){return ProblemDetail.forStatusAndDetail(HttpStatus.PAYLOAD_TOO_LARGE,"File vuot gioi han cho phep");}
}
