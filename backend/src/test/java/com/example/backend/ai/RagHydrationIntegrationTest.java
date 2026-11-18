package com.example.backend.ai;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.example.backend.model.*;
import com.example.backend.services.ShoppingChatService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** Exercises separate catalog transactions, with real Hibernate and a mocked Gemini (no network). */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:rag-hydration;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate", "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "app.ai.rag-sql-count-enabled=true",
        "spring.jpa.properties.hibernate.generate_statistics=false",
        "spring.jpa.properties.hibernate.query.fail_on_pagination_over_collection_fetch=true",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.example.backend.ai.RagHydrationIntegrationTest$Capture",
        "logging.level.root=WARN", "logging.level.org.hibernate.SQL=OFF", "logging.level.org.hibernate.orm.jdbc.bind=OFF"
})
class RagHydrationIntegrationTest {
    public static class Capture implements StatementInspector {
        static final ThreadLocal<List<String>> SQL = ThreadLocal.withInitial(ArrayList::new);
        @Override public String inspect(String sql) { SQL.get().add(sql); return sql; }
    }
    @Autowired EntityManager em;
    @Autowired EntityManagerFactory emf;
    @Autowired PlatformTransactionManager transactions;
    @Autowired ProductCatalog catalog;
    @Autowired ShoppingChatService chat;
    @Autowired RagSqlCounterConfiguration sqlCounter;
    @MockitoBean CatalogAi ai;

    @Test
    void boundedHydrationTimingsSafeLogsBudgetAndFreshStockRemainCorrect() {
        var tx = new TransactionTemplate(transactions);
        var ids = new ArrayList<Long>();
        tx.executeWithoutResult(status -> {
            var vendor = Vendor.builder().name("Fixture brand").build();
            var type = ProductType.builder().name("Bút bi").isActive(true).build();
            em.persist(vendor); em.persist(type);
            for (int i = 0; i < 105; i++) {
                var p = Product.builder().title("Bút bi fixture " + i).handle("rag-fixture-" + i)
                        .vendor(vendor).productType(type).price(new BigDecimal("999999")).build();
                p.getImages().addAll(List.of("https://example.test/b", "https://example.test/a"));
                var tag = Tag.builder().name("Tag " + i).build(); em.persist(tag); p.getTags().add(tag);
                em.persist(p); ids.add(p.getProductID());
                em.persist(ProductVariant.builder().product(p).title("Available pen").price(new BigDecimal("20000"))
                        .stockQuantity(5).build());
                em.persist(ProductVariant.builder().product(p).title("Over budget").price(new BigDecimal("40000"))
                        .stockQuantity(5).build());
            }
        });
        assertThat(emf.unwrap(SessionFactory.class).getStatistics().isStatisticsEnabled()).isFalse();
        assertThat(sqlCounter.isInstalled()).isTrue();
        Capture.SQL.get().clear();
        var keywords = catalog.keywordCandidates(ShoppingSearch.from("bút bi dưới 30k"));
        assertThat(keywords).hasSize(100);
        assertThat(keywords.getFirst().product().productID()).isEqualTo(ids.getLast());
        assertThat(Capture.SQL.get()).hasSize(13).noneMatch(sql -> sql.toLowerCase(Locale.ROOT).contains("count("));
        assertThat(Capture.SQL.get().getFirst().toLowerCase(Locale.ROOT)).contains("fetch first");

        var scores = new LinkedHashMap<Long, Double>(); ids.subList(0, 60).forEach(id -> scores.put(id, 0.9));
        when(ai.search(anyString(), eq(60))).thenReturn(scores);
        when(ai.select(anyString(), anyList())).thenAnswer(call -> {
            List<CatalogProduct> candidates = call.getArgument(1);
            assertThat(candidates).hasSize(12).allSatisfy(p -> assertThat(p.product().price()).isEqualByComparingTo("20000"));
            return List.of(candidates.getFirst().product().productID());
        });
        var logger = (Logger) LoggerFactory.getLogger(RagRequestTrace.class);
        var level = logger.getLevel(); var logs = new ListAppender<ILoggingEvent>();
        logs.start(); logger.addAppender(logs); logger.setLevel(Level.INFO);
        try {
            Capture.SQL.get().clear();
            var result = chat.chat("bút bi dưới 30k PRIVATE_EMAIL@example.test");
            assertThat(result.source()).isEqualTo("AI_RAG");
            assertThat(result.products()).hasSize(1).allSatisfy(p -> {
                assertThat(p.price()).isEqualByComparingTo("20000");
                assertThat(p.images()).containsExactly("https://example.test/b", "https://example.test/a");
            });
            assertThat(Capture.SQL.get()).hasSize(24);
            var lines = logs.list.stream().map(ILoggingEvent::getFormattedMessage).toList();
            assertThat(lines).hasSize(8).allSatisfy(line -> assertThat(line).doesNotContain("PRIVATE_EMAIL", "bút bi", "example.test", "disabled"));
            assertThat(lines).anySatisfy(line -> assertThat(line).contains("stage=CATALOG_VECTOR_IDS", "sqlStatements=7"))
                    .anySatisfy(line -> assertThat(line).contains("stage=KEYWORD_CANDIDATES", "sqlStatements=13"))
                    .anySatisfy(line -> assertThat(line).contains("stage=CATALOG_SELECTED_IDS", "sqlStatements=4"))
                    .anySatisfy(line -> assertThat(line).contains("stage=TOTAL", "sqlStatements=24", "outcome=AI_RAG"));

            // A separate transaction changes inventory during inference; final hydration must see it.
            doAnswer(call -> {
                List<CatalogProduct> candidates = call.getArgument(1);
                Long id = candidates.getFirst().product().productID();
                tx.executeWithoutResult(status -> em.createQuery("update ProductVariant v set v.stockQuantity=0 where v.product.productID=:id")
                        .setParameter("id", id).executeUpdate());
                return List.of(id);
            }).when(ai).select(anyString(), anyList());
            assertThat(chat.chat("bút bi dưới 30k").products()).isEmpty();

            doThrow(new AiFailure(AiFailure.Reason.TIMEOUT)).when(ai).select(anyString(), anyList());
            assertThat(chat.chat("bút bi dưới 30k").source()).isEqualTo("CATALOG_FALLBACK");
            clearInvocations(ai);
            int before = logs.list.size();
            assertThat(chat.chat("sổ tay dưới 30k").products()).isEmpty();
            verify(ai, never()).select(anyString(), anyList());
            assertThat(logs.list.subList(before, logs.list.size())).extracting(ILoggingEvent::getFormattedMessage)
                    .anySatisfy(line -> assertThat(line).contains("stage=TOTAL"));
        } finally {
            logger.detachAppender(logs); logger.setLevel(level); logs.stop(); Capture.SQL.remove();
        }
    }
}
