package com.example.backend.ai;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.time.Duration;

@Data @Component @ConfigurationProperties(prefix = "app.ai")
public class AiProperties {
    private boolean enabled = false;
    @lombok.ToString.Exclude
    private String geminiApiKey = "";
    private String embeddingModel = "gemini-embedding-001";
    private String chatModel = "gemini-3.1-flash-lite";
    private int embeddingDimensions = 3072;
    private String vectorUrl = "";
    private String vectorUsername = "";
    @lombok.ToString.Exclude
    private String vectorPassword = "";
    private String vectorTable = "stationery_vectors_gemini";
    private Duration timeout = Duration.ofSeconds(30);
    private Duration vectorTimeout = Duration.ofSeconds(5);
    private double viewWeight = 1;
    private double cartWeight = 3;
    private double purchaseWeight = 5;
    private int halfLifeDays = 30;
    private int historyDays = 180;
    private int chatRequestsPerMinute = 10;
}
