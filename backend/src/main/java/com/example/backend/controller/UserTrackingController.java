package com.example.backend.controller;

import com.example.backend.dto.tracking.TrackingEventRequest;
import com.example.backend.model.TrackingEventType;
import com.example.backend.services.UserTrackingService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestController @RequestMapping("/api/tracking/events") @RequiredArgsConstructor
public class UserTrackingController {
    private final UserTrackingService tracking;
    @PostMapping
    public Map<String, Boolean> track(Authentication authentication, @Valid @RequestBody TrackingEventRequest request) {
        if (request.eventType() != TrackingEventType.VIEW_PRODUCT)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Chỉ được ghi nhận VIEW_PRODUCT từ trình duyệt");
        return Map.of("recorded", tracking.recordView(authentication.getName(), request.productID()));
    }
}
