package com.example.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;
import java.time.ZoneId;

@Configuration
public class StatisticsConfig {
    @Bean
    public Clock statisticsClock() {
        return Clock.system(ZoneId.of("Asia/Ho_Chi_Minh"));
    }
}
