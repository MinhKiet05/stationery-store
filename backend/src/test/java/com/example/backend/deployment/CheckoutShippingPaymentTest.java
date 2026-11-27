package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.services.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:shipping-payment;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
    "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
    "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "app.mail.from=test@example.test",
    "app.ai.enabled=false", "app.ai.vector-url=", "app.redis.enabled=false", "logging.level.root=WARN",
    "app.shipping.standard-fee=25000", "app.shipping.express-fee=40000", "app.shipping.free-threshold=200000",
    "app.payments.demo-enabled=true"
})
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username="buyer", roles="CUSTOMER")
class CheckoutShippingPaymentTest {
    @Autowired MockMvc mvc;
    @Autowired org.springframework.web.context.WebApplicationContext context;
    @Autowired EntityManager em;
    @Autowired CheckoutPolicy policy;
    @MockitoBean ReviewImageStorage images;
    ProductVariant variant;
    Coupon coupon;
    Cart cart;

    @BeforeEach void fixture() {
        mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context)
            .apply(org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity()).build();
        var buyer=User.builder().username("buyer").email("buyer@test.local").passwordHash("hash").build(); em.persist(buyer);
        em.persist(User.builder().username("other").email("other@test.local").passwordHash("hash").build());
        var product=Product.builder().title("Pen").build(); em.persist(product);
        variant=ProductVariant.builder().product(product).title("Blue").price(new BigDecimal("85000")).stockQuantity(10).build(); em.persist(variant);
        cart=Cart.builder().user(buyer).build(); em.persist(cart);
        em.persist(CartItem.builder().cart(cart).variant(variant).quantity(2).build());
        coupon=Coupon.builder().code("SAVE20").discountType(DiscountType.FIXED_AMOUNT).discountValue(new BigDecimal("20000")).usageLimit(10).build(); em.persist(coupon); em.flush();
    }
    String body(String payment, String shipping) {
        return "{\"shippingAddress\":\"Test address\",\"contactPhone\":\"0901234567\",\"paymentMethod\":\""+payment+"\",\"shippingMethod\":\""+shipping+"\",\"couponCode\":\"SAVE20\"}";
    }
    long create(String payment, String shipping) throws Exception {
        String response=mvc.perform(post("/api/orders").contentType("application/json").content(body(payment,shipping)))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.shippingMethod").value(shipping)).andReturn().getResponse().getContentAsString();
        return Long.parseLong(response.replaceAll(".*\"orderID\":(\\d+).*", "$1"));
    }
    @Test void previewUsesDatabasePricesAndCouponWithoutConsumingAnything() throws Exception {
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content("{\"shippingMethod\":\"STANDARD\",\"couponCode\":\"save20\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.subTotal").value(170000))
            .andExpect(jsonPath("$.discountAmount").value(20000)).andExpect(jsonPath("$.shippingFee").value(25000)).andExpect(jsonPath("$.totalAmount").value(175000));
        em.refresh(coupon); em.refresh(variant);
        assertThat(coupon.getUsedCount()).isZero(); assertThat(variant.getStockQuantity()).isEqualTo(10);
        assertThat(policy.shippingFee(ShippingMethod.STANDARD,new BigDecimal("200000"))).isEqualByComparingTo("0");
        assertThat(policy.shippingFee(ShippingMethod.STANDARD,new BigDecimal("199999"))).isEqualByComparingTo("25000");
        assertThat(policy.shippingFee(ShippingMethod.EXPRESS,new BigDecimal("999999"))).isEqualByComparingTo("40000");
    }
    @Test void smallCartRejectsCouponWithSpecificSafeReason() throws Exception {
        variant.setPrice(new BigDecimal("7400"));
        coupon.setMinOrderValue(new BigDecimal("200000")); em.flush();
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content("{\"shippingMethod\":\"STANDARD\",\"couponCode\":\"SAVE20\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("COUPON_MINIMUM_NOT_MET"))
            .andExpect(jsonPath("$.detail").value("Đơn hàng chưa đạt giá trị tối thiểu để sử dụng mã này."));
        em.refresh(coupon); assertThat(coupon.getUsedCount()).isZero();
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content("{\"shippingMethod\":\"STANDARD\",\"couponCode\":null}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalAmount").value(39800));
    }
    @Test void couponExpiryStartActivationAndUsageHaveDistinctCodes() throws Exception {
        String request="{\"shippingMethod\":\"STANDARD\",\"couponCode\":\"SAVE20\"}";
        coupon.setEndDate(java.time.LocalDate.now().minusDays(1)); em.flush();
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content(request))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("COUPON_EXPIRED"));
        coupon.setEndDate(null); coupon.setStartDate(java.time.LocalDate.now().plusDays(1)); em.flush();
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content(request))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("COUPON_NOT_STARTED"));
        coupon.setStartDate(null); coupon.setIsActive(false); em.flush();
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content(request))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("COUPON_INACTIVE"));
        coupon.setIsActive(true); coupon.setUsedCount(10); em.flush();
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content(request))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("COUPON_EXHAUSTED"));
    }
    @Test void missingCouponAndMalformedShippingNeverExposeParserDiagnostics() throws Exception {
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content("{\"shippingMethod\":\"STANDARD\",\"couponCode\":\"MISSING\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("COUPON_NOT_FOUND"));
        mvc.perform(post("/api/checkout/preview").contentType("application/json").content("{\"shippingMethod\":\"SQL secret\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CHECKOUT_INVALID_INPUT"))
            .andExpect(content().string(org.hamcrest.Matchers.not(org.hamcrest.Matchers.containsString("SQL secret"))));
    }
    @Test void expressFeeIsPersistedAndOrderTotalIncludesDiscountAndShipping() throws Exception {
        long id=create("COD","EXPRESS");
        mvc.perform(get("/api/orders/"+id)).andExpect(status().isOk()).andExpect(jsonPath("$.shippingFee").value(40000))
            .andExpect(jsonPath("$.totalAmount").value(190000)).andExpect(jsonPath("$.isPaid").value(false)).andExpect(jsonPath("$.paymentMode").value("LIVE"));
        em.refresh(variant); em.refresh(coupon);
        assertThat(variant.getStockQuantity()).isEqualTo(8); assertThat(coupon.getUsedCount()).isEqualTo(1);
    }
    @Test void rejectsTotalThatChangedAfterPreview() throws Exception {
        String changed=body("COD","STANDARD").replace("}",",\"expectedTotalAmount\":1}");
        mvc.perform(post("/api/orders").contentType("application/json").content(changed)).andExpect(status().isConflict());
    }
    @Test void rejectsUnknownMethodBeforeCreatingOrder() throws Exception {
        mvc.perform(post("/api/orders").contentType("application/json").content(body("FAKE","STANDARD"))).andExpect(status().isBadRequest());
    }
    @Test void demoPaymentChecksOwnershipAndIsIdempotent() throws Exception {
        long id=create("MOMO","STANDARD");
        mvc.perform(post("/api/orders/"+id+"/payments/demo").with(user("other").roles("CUSTOMER"))).andExpect(status().isNotFound());
        String path="/api/orders/"+id+"/payments/demo";
        mvc.perform(post(path)).andExpect(status().isOk()).andExpect(jsonPath("$.isPaid").value(true)).andExpect(jsonPath("$.paymentMode").value("DEMO"));
        String reference=em.find(Order.class,id).getPaymentReference();
        mvc.perform(post(path)).andExpect(status().isOk()).andExpect(jsonPath("$.paymentReference").value(reference));
        mvc.perform(patch("/api/orders/"+id+"/cancel")).andExpect(status().isConflict());
    }
    @Test void cancelledOrderAndCodCannotBePaidThroughDemo() throws Exception {
        long id=create("VNPAY","STANDARD");
        mvc.perform(patch("/api/orders/"+id+"/cancel")).andExpect(status().isOk());
        mvc.perform(post("/api/orders/"+id+"/payments/demo")).andExpect(status().isConflict());
    }
    @Test void codConfirmationRequiresAdminAndDeliveryAndRecordsReceiptOnce() throws Exception {
        long id=create("COD","STANDARD");
        String path="/api/admin/orders/"+id+"/confirm-payment";
        mvc.perform(post(path).contentType("application/json").content("{\"reference\":\"R1\"}")).andExpect(status().isForbidden());
        mvc.perform(post(path).with(user("admin").roles("ADMIN")).contentType("application/json").content("{\"reference\":\"R1\"}")).andExpect(status().isConflict());
        em.find(Order.class,id).setStatus(OrderStatus.DELIVERED); em.flush();
        for(int i=0;i<2;i++) mvc.perform(post(path).with(user("admin").roles("ADMIN")).contentType("application/json").content("{\"reference\":\"R1\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.isPaid").value(true)).andExpect(jsonPath("$.paidAt").isNotEmpty());
        assertThat(em.find(Order.class,id).getPaymentConfirmedBy()).isEqualTo("admin");
    }
    @Test void disabledDemoIsNotSelectable() throws Exception {
        ReflectionTestUtils.setField(policy,"demoEnabled",false);
        try {
            assertThat(policy.options().payments().stream().filter(option->option.code()!=PaymentMethod.COD).allMatch(option->!option.enabled())).isTrue();
            mvc.perform(post("/api/orders").contentType("application/json").content(body("CARD","STANDARD"))).andExpect(status().isBadRequest());
        } finally { ReflectionTestUtils.setField(policy,"demoEnabled",true); }
    }
}
