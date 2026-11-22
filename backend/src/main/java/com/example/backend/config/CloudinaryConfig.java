package com.example.backend.config;

import com.cloudinary.Cloudinary;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Configuration
public class CloudinaryConfig {
    @Bean
    Cloudinary cloudinary(@Value("${app.cloudinary.cloud-name:}") String cloudName,
                          @Value("${app.cloudinary.api-key:}") String apiKey,
                          @Value("${app.cloudinary.api-secret:}") String apiSecret) {
        // Explicit map: no CLOUDINARY_URL or credential-bearing configuration logs.
        return new Cloudinary(Map.of("cloud_name", cloudName, "api_key", apiKey,
                "api_secret", apiSecret, "secure", true,
                "timeout", 15)); // Cloudinary HTTP5 uses seconds for all request timeouts.
    }
}
