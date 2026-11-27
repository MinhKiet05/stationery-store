package com.example.backend.deployment;

import com.example.backend.dto.cart.*;
import com.example.backend.model.*;
import com.example.backend.repositories.CartItemRepository;
import com.example.backend.services.CartMergeService;
import jakarta.persistence.EntityManager;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:cart-merge-audit;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
    "spring.jpa.properties.hibernate.generate_statistics=true",
    "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN"
})
@Transactional
class CartMergePerformanceTest {
    @Autowired EntityManager em;
    @Autowired CartMergeService merge;
    @MockitoSpyBean CartItemRepository items;
    List<Long> variantIDs = new ArrayList<>();

    @BeforeEach void seed() {
        em.persist(User.builder().username("merge-audit").email("merge@example.test").passwordHash("fixture").build());
        var product = Product.builder().title("Merge test").handle("merge-test").price(BigDecimal.TEN).build();
        em.persist(product);
        for (int i = 0; i < 3; i++) {
            var variant = ProductVariant.builder().product(product).title("Variant " + i).price(BigDecimal.TEN).stockQuantity(10).build();
            em.persist(variant); variantIDs.add(variant.getVariantID());
        }
        em.flush(); em.clear(); clearInvocations(items);
    }

    @Test void mergeBuildsTheFullCartOnlyOnceAndPreservesEveryItem() {
        var stats = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics(); stats.clear();
        var result = merge.mergeCart("merge-audit", new MergeCartRequest(variantIDs.stream().map(id -> new AddCartItemRequest(id, 2)).toList()));
        System.out.println("AUDIT_CART_MERGE_SQL three-items=" + stats.getPrepareStatementCount());
        assertThat(result.items()).hasSize(3);
        assertThat(result.totalQuantity()).isEqualTo(6);
        assertThat(result.subtotal()).isEqualByComparingTo("60");
        verify(items, times(1)).findForResponseByCartID(anyLong());
    }

    @Test void repeatedVariantIdsStillAccumulateAndExcessStockIsRejected() {
        var id = variantIDs.getFirst();
        var result = merge.mergeCart("merge-audit", new MergeCartRequest(List.of(new AddCartItemRequest(id, 2), new AddCartItemRequest(id, 3))));
        assertThat(result.items()).hasSize(1); assertThat(result.totalQuantity()).isEqualTo(5);
        assertThatThrownBy(() -> merge.mergeCart("merge-audit", new MergeCartRequest(List.of(new AddCartItemRequest(id, 6)))))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
