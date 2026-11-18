package com.example.backend.deployment;

import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Only opt into a disposable loopback DB; no environment or production credentials required. */
@EnabledIfSystemProperty(named = "performance.postgres.url", matches = "jdbc:postgresql://(127\\.0\\.0\\.1|localhost):[0-9]+/.*")
class PostgreSqlReadQueryPerformanceTest extends ReadQueryPerformanceTest {
    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("performance.postgres.url"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET search_path TO store, extensions, public");
    }
}
