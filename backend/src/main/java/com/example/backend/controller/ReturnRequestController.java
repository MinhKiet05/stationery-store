package com.example.backend.controller;

import com.example.backend.dto.returns.CreateReturnRequest;
import com.example.backend.dto.returns.ReturnResponse;
import com.example.backend.services.ReturnRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/returns")
@RequiredArgsConstructor
public class ReturnRequestController {
    private final ReturnRequestService service;

    @PostMapping
    public ResponseEntity<ReturnResponse> create(@Valid @RequestBody CreateReturnRequest request,
                                                 Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.create(authentication.getName(), request));
    }

    @GetMapping("/my-requests")
    public List<ReturnResponse> mine(Authentication authentication) {
        return service.myRequests(authentication.getName());
    }

    @GetMapping("/{id}")
    public ReturnResponse get(@PathVariable Long id, Authentication authentication) {
        return service.get(authentication.getName(), id);
    }
}
