package com.example.backend.ai;

import com.example.backend.repositories.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDateTime;

@Service @RequiredArgsConstructor
public class TrackingHistory {
    private final UserRepository users;
    private final UserTrackingEventRepository events;
    private final AiProperties properties;
    @Transactional(readOnly = true)
    public PreferenceProfile profile(String username) {
        var user = users.findByUsername(username).filter(u -> Boolean.TRUE.equals(u.getIsActive()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        var now = LocalDateTime.now();
        return PreferenceProfile.aggregate(events.findTop300ByUser_UserIDAndCreatedAtAfterOrderByCreatedAtDesc(
                user.getUserID(), now.minusDays(properties.getHistoryDays())), properties, now);
    }
}
