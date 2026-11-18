package com.example.backend.ai;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {
        "app.ai.enabled=false", "app.ai.gemini-api-key=", "app.ai.vector-url=jdbc:postgresql://invalid.invalid/unused",
        "spring.datasource.url=jdbc:h2:mem:gemini-disabled;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false",
        "spring.mail.host=localhost", "spring.mail.username=test@example.test", "spring.mail.password=",
        "app.mail.from=test@example.test", "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "logging.level.root=WARN", "logging.level.org.hibernate.SQL=OFF"
})
@ActiveProfiles({"test", "ai"})
class GeminiDisabledTest {
    @Autowired ApplicationContext context;
    @Autowired CatalogAi ai;
    @Autowired ProductIndexJob indexing;

    @Test
    void fullApplicationStartsWithoutGeminiKeyOrVectorDatabaseEvenWithAiProfile() {
        assertThat(context.getBeansOfType(CatalogAi.class)).hasSize(1);
        assertThat(ai).isInstanceOf(GeminiCatalogAi.class);
        assertThatThrownBy(() -> ai.search("bút bi", 3))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.DISABLED));
        assertThatThrownBy(() -> ai.select("bút bi", java.util.List.of(GeminiCatalogAiTest.product(1, true))))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.DISABLED));
        assertThatThrownBy(() -> ai.synchronize(GeminiCatalogAiTest.product(1, true)))
                .isInstanceOfSatisfying(AiFailure.class, e -> assertThat(e.reason()).isEqualTo(AiFailure.Reason.DISABLED));
        assertThat(indexing.reindex().status()).isEqualTo("DISABLED");
    }
}
