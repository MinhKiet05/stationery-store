package com.example.backend.dto.tracking;

import com.example.backend.model.TrackingEventType;
import jakarta.validation.constraints.*;

public record TrackingEventRequest(@NotNull @Positive Long productID, @NotNull TrackingEventType eventType) {}
