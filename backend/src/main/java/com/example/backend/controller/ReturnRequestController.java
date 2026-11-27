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
    private final com.example.backend.services.ReturnEvidenceService evidence;

    @PostMapping(consumes = org.springframework.http.MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ReturnResponse> create(@Valid @RequestPart("returnRequest") CreateReturnRequest request,
            @RequestPart(value = "images", required = false) List<org.springframework.web.multipart.MultipartFile> images,
            Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED).body(evidence.create(authentication.getName(), request, images));
    }

    @PostMapping("/preview")
    public com.example.backend.dto.returns.RefundPreview preview(@Valid @RequestBody com.example.backend.dto.returns.RefundPreviewRequest request,
            Authentication authentication) { return service.preview(authentication.getName(), request); }

    @GetMapping("/my-requests")
    public List<ReturnResponse> mine(Authentication authentication) {
        return service.myRequests(authentication.getName());
    }

    @GetMapping("/{id}")
    public ReturnResponse get(@PathVariable Long id, Authentication authentication) {
        return service.get(authentication.getName(), id);
    }
}
