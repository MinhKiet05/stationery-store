package com.example.backend.controller;

import com.example.backend.dto.returns.ReturnResponse;
import com.example.backend.dto.returns.UpdateReturnStatusRequest;
import com.example.backend.services.ReturnRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/admin/returns")
@RequiredArgsConstructor
@PreAuthorize("hasRole('ADMIN')")
public class AdminReturnRequestController {
    private final ReturnRequestService service;

    @GetMapping
    public List<ReturnResponse> all() { return service.all(); }

    @PatchMapping("/{id}/status")
    public ReturnResponse status(@PathVariable Long id, @Valid @RequestBody UpdateReturnStatusRequest request) {
        return service.changeStatus(id, request);
    }
}
