package com.example.backend.ai;

import com.example.backend.dto.product.ProductResponse;
import com.example.backend.model.*;
import com.example.backend.services.RecommendationService;
import com.example.backend.services.impl.RecommendationServiceImpl;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;

@DataJpaTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:recent-recommendations;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TrackingHistory.class, AiProperties.class, ProductCatalog.class, RecommendationServiceImpl.class})
@ActiveProfiles("test")
class RecentRecommendationsTest {
    @Autowired EntityManager em;
    @Autowired RecommendationService recommendations;
    @MockitoBean CatalogAi ai;

    @Test
    void usesLatestInteractionPerProductInTimestampOrderForTheCurrentUser() {
        var user = user("alice");
        var other = user("bob");
        var first = product("first", 10);
        var second = product("second", 10);
        var third = product("third", 10);
        var fourth = product("fourth", 10);
        var privateProduct = product("other-user-product", 10);
        // Old timestamps also work: this is recent activity, not an AI history window.
        var time = LocalDateTime.of(2020, 1, 1, 12, 0);
        event(user, first, TrackingEventType.VIEW_PRODUCT, time);
        event(user, second, TrackingEventType.ADD_TO_CART, time.plusMinutes(1));
        event(user, third, TrackingEventType.PURCHASE, time.plusMinutes(2));
        event(user, fourth, TrackingEventType.VIEW_PRODUCT, time.plusMinutes(3));
        event(user, first, TrackingEventType.VIEW_PRODUCT, time.plusMinutes(4));
        event(other, privateProduct, TrackingEventType.VIEW_PRODUCT, time.plusDays(1));
        em.flush();
        em.clear();

        var result = recommendations.recent("alice", 3);

        assertThat(result.source()).isEqualTo("RECENT_ACTIVITY");
        assertThat(result.products()).extracting(ProductResponse::productID)
                .containsExactly(first.getProductID(), fourth.getProductID(), third.getProductID());
        verifyNoInteractions(ai);
    }

    @Test
    void skipsUnavailableProductsAndDoesNotPadHistoryWithUnrelatedProducts() {
        var user = user("alice");
        var available = product("available", 10);
        var unavailable = product("unavailable", 10);
        unavailable.setAvailable(false);
        var outOfStock = product("out-of-stock", 0);
        var inactive = product("inactive", 10);
        inactive.setIsActive(false);
        product("unrelated-new-product", 10);
        var time = LocalDateTime.now();
        event(user, available, TrackingEventType.VIEW_PRODUCT, time.minusMinutes(3));
        event(user, unavailable, TrackingEventType.VIEW_PRODUCT, time.minusMinutes(2));
        event(user, outOfStock, TrackingEventType.VIEW_PRODUCT, time.minusMinutes(1));
        event(user, inactive, TrackingEventType.VIEW_PRODUCT, time);
        em.flush();
        em.clear();

        var result = recommendations.recent("alice", 3);

        assertThat(result.source()).isEqualTo("RECENT_ACTIVITY");
        assertThat(result.products()).extracting(ProductResponse::productID)
                .containsExactly(available.getProductID());
        verifyNoInteractions(ai);
    }

    @Test
    void usesFallbackWhenThereIsNoHistoryOrNoSellableTrackedProduct() {
        var user = user("alice");
        var available = product("available", 10);
        var outOfStock = product("out-of-stock", 0);
        var empty = recommendations.recent("alice", 3);
        assertThat(empty.source()).isEqualTo("FALLBACK");
        assertThat(empty.products()).extracting(ProductResponse::productID)
                .containsExactly(available.getProductID());

        event(user, outOfStock, TrackingEventType.VIEW_PRODUCT, LocalDateTime.now());
        var unsellable = recommendations.recent("alice", 3);
        assertThat(unsellable.source()).isEqualTo("FALLBACK");
        assertThat(unsellable.products()).extracting(ProductResponse::productID)
                .containsExactly(available.getProductID());
        verifyNoInteractions(ai);
    }

    @Test
    void rejectsUnknownAndDisabledUsers() {
        var disabled = user("disabled");
        disabled.setIsActive(false);
        assertThatThrownBy(() -> recommendations.recent("missing", 3))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> recommendations.recent("disabled", 3))
                .isInstanceOf(ResponseStatusException.class);
        verifyNoInteractions(ai);
    }

    private User user(String username) {
        var user = User.builder().username(username).passwordHash("test")
                .email(username + "@example.test").build();
        em.persist(user);
        return user;
    }

    private Product product(String handle, int stock) {
        var product = Product.builder().title(handle).handle(handle).price(BigDecimal.TEN).build();
        product.getVariants().add(ProductVariant.builder().title("Default").product(product)
                .price(BigDecimal.TEN).stockQuantity(stock).build());
        em.persist(product);
        return product;
    }

    private void event(User user, Product product, TrackingEventType type, LocalDateTime time) {
        em.persist(UserTrackingEvent.builder().user(user).product(product)
                .eventType(type).createdAt(time).build());
    }
}
