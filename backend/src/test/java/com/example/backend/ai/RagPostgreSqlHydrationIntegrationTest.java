package com.example.backend.ai;

import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Same RAG pipeline and privacy/SQL checks, only on an explicitly opted-in disposable local database. */
@EnabledIfSystemProperty(named = "rag.postgres.url", matches = "jdbc:postgresql://(127\\.0\\.0\\.1|localhost):[0-9]+/.*")
class RagPostgreSqlHydrationIntegrationTest extends RagHydrationIntegrationTest {
    @DynamicPropertySource
    static void postgres(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("rag.postgres.url"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET search_path TO store, extensions, public");
    }
}
