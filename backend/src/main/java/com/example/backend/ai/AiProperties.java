package com.example.backend.ai;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import java.time.Duration;

@Data @Component @ConfigurationProperties(prefix = "app.ai")
public class AiProperties {
    private boolean enabled = false;
    private String ollamaUrl = "http://localhost:11434";
    private String embeddingModel = "qwen3-embedding:0.6b";
    private String chatModel = "qwen3:1.7b";
    private String vectorUrl = "jdbc:postgresql://localhost:5433/stationery_ai";
    private String vectorUsername = "stationery_ai";
    private String vectorPassword = "";
    private String vectorTable = "stationery_vectors";
    private Duration timeout = Duration.ofSeconds(30);
    private Duration vectorTimeout = Duration.ofSeconds(5);
    private double viewWeight = 1;
    private double cartWeight = 3;
    private double purchaseWeight = 5;
    private int halfLifeDays = 30;
    private int historyDays = 180;
    private int chatRequestsPerMinute = 10;
}
