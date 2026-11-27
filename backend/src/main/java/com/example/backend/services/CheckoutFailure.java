package com.example.backend.services;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Explicit public business codes; no internal exception diagnostics cross the API boundary. */
public class CheckoutFailure extends ResponseStatusException {
    private final String code;
    public CheckoutFailure(HttpStatus status, String code, String message) {
        super(status, message);
        this.code = code;
    }
    public String code() { return code; }
}
