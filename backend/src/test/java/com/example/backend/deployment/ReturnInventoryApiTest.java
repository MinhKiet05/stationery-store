package com.example.backend.deployment;

import com.example.backend.model.*;
import java.math.BigDecimal;
import com.example.backend.services.ReturnInventoryService;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import com.example.backend.services.ReviewImageStorage;
import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;
import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:return-inventory;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.returns.max-export-rows=20"
})
@AutoConfigureMockMvc
@Transactional
@WithMockUser(username="admin", roles="ADMIN")
class ReturnInventoryApiTest {
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @MockitoBean ReviewImageStorage storage;
    ReturnRequest request;
    ProductVariant first, second;
    ReturnRequestItem a, b;
    Order order;

    @BeforeEach void setup() {
        mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        var admin=User.builder().username("admin").email("inventory-admin@example.test").role(UserRole.ADMIN).passwordHash("hash").build(); em.persist(admin);
        var buyer=User.builder().username("buyer").email("inventory-buyer@example.test").passwordHash("hash").build(); em.persist(buyer);
        var product=Product.builder().title("Inventory test").build(); em.persist(product);
        first=ProductVariant.builder().product(product).title("First").sku("RETURN-FIRST").stockQuantity(8).price(BigDecimal.TEN).build(); em.persist(first);
        second=ProductVariant.builder().product(product).title("Second").sku("RETURN-SECOND").stockQuantity(5).price(BigDecimal.TEN).build(); em.persist(second);
        order=Order.builder().user(buyer).status(OrderStatus.DELIVERED).isPaid(true).totalAmount(BigDecimal.valueOf(60)).discountAmount(BigDecimal.ZERO).build(); em.persist(order);
        var x=OrderDetail.builder().order(order).variant(first).quantity(3).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.valueOf(30)).build(); em.persist(x);
        var y=OrderDetail.builder().order(order).variant(second).quantity(3).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.valueOf(30)).build(); em.persist(y);
        request=ReturnRequest.builder().order(order).user(buyer).reason("Test inspection").status(ReturnStatus.APPROVED).build();
        a=ReturnRequestItem.builder().returnRequest(request).orderDetail(x).quantity(3).build(); b=ReturnRequestItem.builder().returnRequest(request).orderDetail(y).quantity(3).build();
        request.getItems().addAll(List.of(a,b)); em.persist(request); em.flush();
    }
    @Test void approvalAndRejectionDoNotReceiveOrRestock() throws Exception {
        request.setStatus(ReturnStatus.PENDING); em.flush();
        mvc.perform(patch(base()+"/status").contentType("application/json").content("{\"status\":\"APPROVED\"}")).andExpect(status().isOk());
        assertThat(em.find(ReturnReceipt.class,request.getReturnID())).isNull(); assertStock(8,5);
        request.setStatus(ReturnStatus.PENDING); em.flush();
        mvc.perform(patch(base()+"/status").contentType("application/json").content("{\"status\":\"REJECTED\"}")).andExpect(status().isOk());
        assertThat(em.find(ReturnReceipt.class,request.getReturnID())).isNull(); assertStock(8,5);
    }
    @Test void receiveStoresActualQuantitiesAndActorWithoutChangingStockOrOrder() throws Exception {
        receive(3,1,200);
        assertStock(8,5); em.refresh(order);
        assertThat(order.getStatus()).isEqualTo(OrderStatus.DELIVERED); assertThat(order.getIsPaid()).isTrue(); assertThat(order.getTotalAmount()).isEqualByComparingTo("60");
        mvc.perform(get(base())).andExpect(status().isOk()).andExpect(jsonPath("$.receipt.receivedBy").value("admin"))
            .andExpect(jsonPath("$.receipt.receivedAt").isNotEmpty()).andExpect(jsonPath("$.receipt.inspectedAt").isEmpty())
            .andExpect(jsonPath("$.receipt.items[0].receivedQuantity").value(3)).andExpect(jsonPath("$.receipt.items[0].goodQuantity").isEmpty());
    }
    @Test void inspectionAddsOnlyGoodGoodsAndPublicInventoryAndLowStockReflectNewValues() throws Exception {
        long version=first.getVersion(); receive(3,1,200); restock(2,1,0,1,200);
        assertStock(10,5); em.refresh(order); assertThat(order.getIsPaid()).isTrue(); assertThat(order.getTotalAmount()).isEqualByComparingTo("60"); assertThat(order.getStatus()).isEqualTo(OrderStatus.DELIVERED);
        mvc.perform(get("/api/product-variants/"+first.getVariantID())).andExpect(status().isOk()).andExpect(jsonPath("$.stockQuantity").value(10)).andExpect(jsonPath("$.version").value(version+1));
        mvc.perform(get("/api/admin/dashboard/low-stock")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get(base())).andExpect(status().isOk()).andExpect(jsonPath("$.receipt.inspectedAt").isNotEmpty()).andExpect(jsonPath("$.receipt.inspectedBy").value("admin"))
            .andExpect(jsonPath("$.receipt.items[0].stockBefore").value(8)).andExpect(jsonPath("$.receipt.items[0].stockAfter").value(10))
            .andExpect(jsonPath("$.receipt.items[0].goodQuantity").value(2)).andExpect(jsonPath("$.receipt.items[0].damagedQuantity").value(1))
            .andExpect(jsonPath("$.refundStatus").doesNotExist());
        mvc.perform(patch("/api/admin/product-variants/"+first.getVariantID()+"/stock").contentType("application/json").content("{\"stockQuantity\":8,\"version\":"+version+"}"))
            .andExpect(status().isConflict()); assertStock(10,5);
    }
    @Test void repeatedReceiveAndRestockCannotAdjustInventoryTwiceOrEditFinishedResults() throws Exception {
        receive(3,1,200); receive(3,1,409); restock(2,1,0,1,200); restock(2,1,0,1,409); restock(3,0,1,0,409); receive(2,1,409);
        assertStock(10,5);
        assertThat(em.createQuery("select count(i) from ReturnReceiptItem i where i.receipt.returnID=:id",Long.class).setParameter("id",request.getReturnID()).getSingleResult()).isEqualTo(2);
    }
    @Test void allDamagedOrZeroReceivedItemNeverIncreasesSellableStock() throws Exception {
        long version=first.getVersion(); receive(3,0,200); restock(0,3,0,0,200); assertStock(8,5);
        assertThat(first.getVersion()).isEqualTo(version);
    }
    @Test void multipleItemsOfSameVariantAreAggregatedWithoutLosingIncrements() throws Exception {
        b.getOrderDetail().setVariant(first); em.flush(); long version=first.getVersion();
        receive(3,1,200); restock(2,1,1,0,200); assertStock(11,5); assertThat(first.getVersion()).isEqualTo(version+1);
        mvc.perform(get(base())).andExpect(status().isOk()).andExpect(jsonPath("$.receipt.items[0].stockBefore").value(8))
            .andExpect(jsonPath("$.receipt.items[1].stockBefore").value(10)).andExpect(jsonPath("$.receipt.items[1].stockAfter").value(11));
    }
    @Test void inventoryOverflowRejectsTheWholeInspectionWithoutPartialStockOrTrace() throws Exception {
        second.setStockQuantity(Integer.MAX_VALUE); em.flush(); receive(3,1,200); restock(2,1,1,0,409); assertStock(8,Integer.MAX_VALUE);
        assertThat(em.find(ReturnReceipt.class,request.getReturnID()).getInspectedAt()).isNull();
        assertThat(em.find(ReturnReceiptItem.class,a.getReturnItemID()).getGoodQuantity()).isNull();
    }
    @Test void receiveRejectsNegativeFractionalOverLimitMissingForeignDuplicateAndZeroQuantities() throws Exception {
        String valid=receiveBody(3,1);
        for(String body:List.of(valid.replace("\"receivedQuantity\":3","\"receivedQuantity\":-1"),valid.replace("\"receivedQuantity\":3","\"receivedQuantity\":1.5"),
            receiveBody(4,1),receiveBody(0,0),"{\"items\":[]}","{\"items\":[null]}",valid.replace("\"returnItemID\":"+a.getReturnItemID(),"\"returnItemID\":999999"),
            valid.replace("\"returnItemID\":"+b.getReturnItemID(),"\"returnItemID\":"+a.getReturnItemID())))
            mvc.perform(post(base()+"/receive").contentType("application/json").content(body)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
        assertThat(em.find(ReturnReceipt.class,request.getReturnID())).isNull(); assertStock(8,5);
    }
    @Test void restockRequiresApprovedAndReceivedRequest() throws Exception {
        restock(2,1,0,1,409);
        for(ReturnStatus state:List.of(ReturnStatus.PENDING,ReturnStatus.REJECTED,ReturnStatus.COMPLETED)) {
            request.setStatus(state); em.flush(); receive(3,1,409); restock(2,1,0,1,409);
        }
        assertStock(8,5);
    }
    @Test void restockRequiresExactCompleteClassificationAndCorrectReturnItemIdentity() throws Exception {
        receive(3,1,200); String valid=restockBody(2,1,0,1);
        for(String body:List.of(restockBody(1,1,0,1),restockBody(3,1,0,1),valid.replace("\"goodQuantity\":2","\"goodQuantity\":-1"),
            valid.replace("\"goodQuantity\":2","\"goodQuantity\":1.5"),valid.replace("\"returnItemID\":"+a.getReturnItemID(),"\"returnItemID\":999999"),
            "{\"items\":[]}",valid.replace("\"inspectionNote\":\"Checked\"","\"inspectionNote\":\""+"x".repeat(1001)+"\"")))
            mvc.perform(post(base()+"/restock").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        assertStock(8,5); assertThat(em.find(ReturnReceipt.class,request.getReturnID()).getInspectedAt()).isNull();
    }
    @Test @WithMockUser(username="buyer",roles="CUSTOMER") void customerCannotReceiveOrRestock() throws Exception {
        receive(3,1,403); restock(2,1,0,1,403); assertStock(8,5);
    }
    @Test @org.springframework.security.test.context.support.WithAnonymousUser void anonymousCannotReceiveOrRestock() throws Exception {
        SecurityContextHolder.clearContext(); receive(3,1,401); restock(2,1,0,1,401); assertStock(8,5);
    }
    @Test void inactiveOrNonAdminDatabaseAccountCannotBeUsedAsAuditActor() throws Exception {
        var auth=UsernamePasswordAuthenticationToken.authenticated("buyer",null,List.of(new SimpleGrantedAuthority("ROLE_ADMIN")));
        SecurityContextHolder.getContext().setAuthentication(auth); receive(3,1,403); assertStock(8,5);
    }
    private String base() { return "/api/admin/returns/"+request.getReturnID(); }
    private String receiveBody(int x,int y) { return "{\"items\":[{\"returnItemID\":"+a.getReturnItemID()+",\"receivedQuantity\":"+x+"},{\"returnItemID\":"+b.getReturnItemID()+",\"receivedQuantity\":"+y+"}]}"; }
    private String restockBody(int good,int damaged,int secondGood,int secondDamaged) { return "{\"items\":[{\"returnItemID\":"+a.getReturnItemID()+",\"goodQuantity\":"+good+",\"damagedQuantity\":"+damaged+"},{\"returnItemID\":"+b.getReturnItemID()+",\"goodQuantity\":"+secondGood+",\"damagedQuantity\":"+secondDamaged+"}],\"inspectionNote\":\"Checked\"}"; }
    private void receive(int x,int y,int result) throws Exception { mvc.perform(post(base()+"/receive").contentType("application/json").content(receiveBody(x,y))).andExpect(status().is(result)); }
    private void restock(int x,int y,int z,int w,int result) throws Exception { mvc.perform(post(base()+"/restock").contentType("application/json").content(restockBody(x,y,z,w))).andExpect(status().is(result)); }
    private void assertStock(int x,int y) { em.flush(); em.refresh(first); em.refresh(second); assertThat(first.getStockQuantity()).isEqualTo(x); assertThat(second.getStockQuantity()).isEqualTo(y); }
}
