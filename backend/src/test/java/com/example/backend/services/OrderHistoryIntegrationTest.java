package com.example.backend.services;

import com.example.backend.dto.order.OrderResponse;
import com.example.backend.model.*;
import com.example.backend.services.impl.OrderServiceImpl;
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
import java.util.List;

import static org.assertj.core.api.Assertions.*;

@DataJpaTest(showSql = false, properties = {
        "spring.datasource.url=jdbc:h2:mem:order-history;MODE=PostgreSQL;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.jpa.database-platform=org.hibernate.dialect.H2Dialect",
        "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.H2Dialect",
        "spring.jpa.hibernate.ddl-auto=create-drop", "spring.jpa.show-sql=false",
        "logging.level.root=WARN", "logging.level.org.hibernate.SQL=OFF"
})
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({OrderServiceImpl.class, CheckoutPolicy.class})
@ActiveProfiles("test")
class OrderHistoryIntegrationTest {
    @Autowired EntityManager em;
    @Autowired OrderService orders;
    @MockitoBean UserTrackingService tracking;

    @Test
    void readsOnlyCurrentUsersOrdersNewestFirstWithProductDataAndHistoricalPrices() {
        User alice = user("alice");
        User bob = user("bob");
        ProductVariant variant = variant();
        Order older = order(alice, variant, OrderStatus.DELIVERED, 3);
        Order latest = order(alice, variant, OrderStatus.PENDING, 1);
        order(bob, variant, OrderStatus.SHIPPED, 0);
        em.flush();
        em.clear();

        List<OrderResponse> result = orders.myOrders("alice");

        assertThat(result).extracting(OrderResponse::orderID).containsExactly(latest.getOrderID(), older.getOrderID());
        assertThat(result).allMatch(item -> item.userID().equals(alice.getUserID()));
        var detail = result.getFirst().items().getFirst();
        assertThat(detail.productTitle()).isEqualTo("Bút gel từ database");
        assertThat(detail.variantTitle()).isEqualTo("Mực xanh / 0.5mm");
        assertThat(detail.productHandle()).isEqualTo("but-gel");
        assertThat(detail.productImage()).isEqualTo("https://images.example.test/pen.jpg");
        assertThat(detail.vendorName()).isEqualTo("Deli");
        assertThat(detail.unitPrice()).isEqualByComparingTo("12000");
        assertThat(detail.subTotal()).isEqualByComparingTo("24000");
        assertThat(result.getFirst().totalAmount()).isEqualByComparingTo("22000");
    }

    @Test
    void missingImageAndVendorDoNotPreventReadingAnOrder() {
        User alice = user("alice");
        ProductVariant variant = variant();
        variant.getProduct().setVendor(null);
        variant.getProduct().getImages().clear();
        order(alice, variant, OrderStatus.CANCELLED, 1);
        em.flush();
        em.clear();

        var detail = orders.myOrders("alice").getFirst().items().getFirst();
        assertThat(detail.productImage()).isNull();
        assertThat(detail.vendorName()).isNull();
    }

    @Test
    void emptyHistoryAndOtherUsersOrdersAreHandledWithoutLeakingData() {
        User alice = user("alice");
        User bob = user("bob");
        Order other = order(bob, variant(), OrderStatus.PENDING, 1);
        em.flush();

        assertThat(orders.myOrders(alice.getUsername())).isEmpty();
        assertThatThrownBy(() -> orders.getOrder("alice", other.getOrderID()))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(404));
        assertThatThrownBy(() -> orders.cancelOrder("alice", other.getOrderID()))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(404));
    }

    @Test
    void cancellationPersistsAndRestoresStockButRejectsPaidOrders() {
        User alice = user("alice");
        ProductVariant variant = variant();
        Order pending = order(alice, variant, OrderStatus.PENDING, 1);
        Order paid = order(alice, variant, OrderStatus.PROCESSING, 2);
        paid.setIsPaid(true);
        em.flush();

        assertThat(orders.cancelOrder("alice", pending.getOrderID()).status()).isEqualTo(OrderStatus.CANCELLED);
        em.flush();
        em.clear();
        assertThat(em.find(ProductVariant.class, variant.getVariantID()).getStockQuantity()).isEqualTo(12);
        assertThat(em.find(Order.class, pending.getOrderID()).getStatus()).isEqualTo(OrderStatus.CANCELLED);
        assertThatThrownBy(() -> orders.cancelOrder("alice", paid.getOrderID()))
                .isInstanceOfSatisfying(ResponseStatusException.class, error -> assertThat(error.getStatusCode().value()).isEqualTo(409));
    }

    @Test
    void pagedHistoryFiltersInDatabaseAndKeepsCountsScopedToCurrentCustomer() {
        var alice=user("alice"); var bob=user("bob"); var variant=variant();
        for(int i=0;i<9;i++) order(alice,variant,i<3?OrderStatus.PENDING:OrderStatus.DELIVERED,i);
        order(bob,variant,OrderStatus.SHIPPED,0); em.flush(); em.clear();
        var result=orders.myOrderHistory("alice",1,4,"but gel",null,false);
        assertThat(result.content()).hasSize(4).allMatch(o -> o.userID().equals(alice.getUserID()));
        assertThat(result.totalElements()).isEqualTo(9); assertThat(result.totalPages()).isEqualTo(3);
        assertThat(result.statusCounts()).containsEntry(OrderStatus.PENDING,3L).containsEntry(OrderStatus.DELIVERED,6L).doesNotContainKey(OrderStatus.SHIPPED);
        var pending=orders.myOrderHistory("alice",0,4,"Deli",OrderStatus.PENDING,false);
        assertThat(pending.content()).hasSize(3).allMatch(o -> o.status()==OrderStatus.PENDING);
        assertThat(orders.myOrderHistory("alice",0,4,"%",null,false).totalElements()).isZero();
        var id=result.content().get(0).orderID();
        assertThat(orders.myOrderHistory("alice",0,4,"#ST-"+id,null,false).content()).extracting(OrderResponse::orderID).containsExactly(id);
        assertThat(orders.myOrderHistory("alice",0,4,"#"+id,null,false).content()).extracting(OrderResponse::orderID).containsExactly(id);
        var summary=orders.myOrderHistory("alice",0,4,"",null,true);
        assertThat(summary.content()).isEmpty(); assertThat(summary.totalElements()).isEqualTo(9);
        assertThatThrownBy(() -> orders.myOrderHistory("alice",0,51,"",null,false)).isInstanceOf(ResponseStatusException.class);
    }

    private User user(String username) {
        User user = User.builder().username(username).email(username + "@example.test").passwordHash("test-only").build();
        em.persist(user);
        return user;
    }

    private ProductVariant variant() {
        Vendor vendor = Vendor.builder().name("Deli").build();
        em.persist(vendor);
        Product product = Product.builder().title("Bút gel từ database").handle("but-gel").vendor(vendor).build();
        product.getImages().add("https://images.example.test/pen.jpg");
        em.persist(product);
        ProductVariant variant = ProductVariant.builder().title("Mực xanh / 0.5mm").sku("test-pen")
                .product(product).price(new BigDecimal("99000")).stockQuantity(10).build();
        em.persist(variant);
        return variant;
    }

    private Order order(User user, ProductVariant variant, OrderStatus status, int daysAgo) {
        Order order = Order.builder().user(user).status(status).orderDate(LocalDateTime.now().minusDays(daysAgo))
                .shippingAddress("Địa chỉ test").contactPhone("0900000000").paymentMethod("COD")
                .discountAmount(new BigDecimal("2000")).totalAmount(new BigDecimal("22000")).build();
        OrderDetail detail = OrderDetail.builder().order(order).variant(variant).quantity(2)
                .unitPrice(new BigDecimal("12000")).subTotal(new BigDecimal("24000")).build();
        order.getOrderDetails().add(detail);
        em.persist(order);
        return order;
    }
}
