package com.example.backend.deployment;

import com.example.backend.model.*;
import java.math.BigDecimal;
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
        "spring.datasource.url=jdbc:h2:mem:admin-products;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.flyway.enabled=true", "spring.jpa.hibernate.ddl-auto=validate", "spring.jpa.properties.hibernate.default_schema=store",
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "logging.level.root=WARN", "app.admin.products.max-export-rows=20", "app.inventory.low-stock-threshold=5"
})
@AutoConfigureMockMvc
@Transactional
class AdminProductsApiTest {
    @Autowired MockMvc mvc;
    @Autowired WebApplicationContext context;
    @Autowired EntityManager em;
    @MockitoBean ReviewImageStorage storage;
    @Autowired com.example.backend.ai.ProductCatalog catalog;
    @MockitoBean com.example.backend.ai.CatalogAi ai;
    final tools.jackson.databind.json.JsonMapper json=new tools.jackson.databind.json.JsonMapper();
    Product product; ProductVariant first,second; ProductType category; Vendor vendor; Tag tag;
    @BeforeEach void setup() {
        mvc=MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
        category=ProductType.builder().name("Bút").build();em.persist(category);vendor=Vendor.builder().name("Test brand").build();em.persist(vendor);tag=Tag.builder().name("Học tập").build();em.persist(tag);
        product=Product.builder().title("Product test").handle("product-test").price(BigDecimal.valueOf(40)).vendor(vendor).productType(category).build();product.getImages().add("https://example.test/pen.png");product.getTags().add(tag);em.persist(product);
        first=variant(product,"FIRST",12,30);second=variant(product,"SECOND",3,50);em.flush();
    }
    @Test void anonymousCannotReadOrMutateAdminCatalog() throws Exception {
        for(String path:List.of("","/statistics","/options","/export","/1"))mvc.perform(get("/api/admin/products"+path)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/products").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/products")).andExpect(status().isOk());mvc.perform(get("/api/products/"+product.getProductID())).andExpect(status().isOk());
    }
    @Test @WithMockUser(roles="CUSTOMER") void customerCannotForgeAdminReadOrWrite() throws Exception {
        for(String path:List.of("","/statistics","/options","/export","/1"))mvc.perform(get("/api/admin/products"+path)).andExpect(status().isForbidden());
        mvc.perform(put("/api/admin/products/1").contentType("application/json").content("{}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/products/1").contentType("application/json").content("{}")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/product-variants/1/stock").contentType("application/json").content("{}")).andExpect(status().isForbidden());
    }
    @Test @WithMockUser(roles="ADMIN") void paginationAggregatesActualVariantPricesAndStockWithoutNPlusOne() throws Exception {
        for(int i=0;i<12;i++)create("Another "+i,true,true);em.flush();em.clear();
        var stats=em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();stats.clear();
        mvc.perform(get("/api/admin/products?page=0&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(13)).andExpect(jsonPath("$.content.length()").value(10));
        assertThat(stats.getPrepareStatementCount()).isEqualTo(2);
        mvc.perform(get("/api/admin/products?page=1&size=10")).andExpect(status().isOk()).andExpect(jsonPath("$.content.length()").value(3));
        mvc.perform(get("/api/admin/products?search=FIRST")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].priceMin").value(30)).andExpect(jsonPath("$.content[0].priceMax").value(50))
            .andExpect(jsonPath("$.content[0].totalStock").value(15)).andExpect(jsonPath("$.content[0].variantCount").value(2)).andExpect(jsonPath("$.content[0].lowStockVariants").value(1));
        mvc.perform(get("/api/admin/products/statistics")).andExpect(status().isOk()).andExpect(jsonPath("$.totalProducts").value(13)).andExpect(jsonPath("$.lowStockProducts").value(1)).andExpect(jsonPath("$.lowStockThreshold").value(5));
    }
    @Test @WithMockUser(roles="ADMIN") void categoriesBrandsStatusesLiteralSkuSearchAndIdSortAreRealServerFilters() throws Exception {
        var hidden=create("Hidden",false,true);create("Deleted",false,false);em.flush();
        mvc.perform(get("/api/admin/products?status=HIDDEN")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].productID").value(hidden.getProductID()));
        mvc.perform(get("/api/admin/products?status=DELETED")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/products?sort=ID_ASC&productTypeID="+category.getProductTypeID()+"&vendorID="+vendor.getVendorID())).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/products?lowStock=true")).andExpect(status().isOk()).andExpect(jsonPath("$.content[0].productID").value(product.getProductID()));
        for(String q:List.of("%","_","' or 1=1 --"))mvc.perform(get("/api/admin/products").param("search",q)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(get("/api/admin/products/options")).andExpect(status().isOk()).andExpect(jsonPath("$.categories[0].name").value("Bút")).andExpect(jsonPath("$.vendors[0].id").value(vendor.getVendorID())).andExpect(jsonPath("$.tags[0].id").value(tag.getTagID()));
    }
    @Test @WithMockUser(roles="ADMIN") void detailIncludesImagesTagsRealOptionsAndAllVariants() throws Exception {
        mvc.perform(get("/api/admin/products/"+product.getProductID())).andExpect(status().isOk()).andExpect(jsonPath("$.product.images[0]").value("https://example.test/pen.png"))
            .andExpect(jsonPath("$.tags[0].id").value(tag.getTagID())).andExpect(jsonPath("$.variants.length()").value(2)).andExpect(jsonPath("$.variants[0].sku").value("FIRST"))
            .andExpect(jsonPath("$.stateToken").isNotEmpty()).andExpect(jsonPath("$.product.createdAt").doesNotExist());
        mvc.perform(get("/api/admin/products/9999999")).andExpect(status().isNotFound());
    }
    @Test @WithMockUser(roles="ADMIN") void createAndEditValidateReferencesMoneyUrlsAndSnapshotConflicts() throws Exception {
        var body=payload("Created");String created=mvc.perform(post("/api/admin/products").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("product",body))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.product.title").value("Created")).andReturn().getResponse().getContentAsString();
        long id=json.readTree(created).get("product").get("productID").asLong();String token=json.readTree(created).get("stateToken").asText(); em.clear();
        mvc.perform(put("/api/admin/products/"+id).contentType("application/json").content(write(payload("Updated"),token))).andExpect(status().isOk()).andExpect(jsonPath("$.product.title").value("Updated"));
        mvc.perform(put("/api/admin/products/"+id).contentType("application/json").content(write(payload("Stale overwrite"),token))).andExpect(status().isConflict());
        for(var invalid:List.of(java.util.Map.of("title","","price",10),java.util.Map.of("title","Bad","price",-1),java.util.Map.of("title","Bad","price",10,"vendorID",99999),java.util.Map.of("title","Bad","price",10,"productTypeID",99999),java.util.Map.of("title","Bad","price",10,"tagIDs",List.of(99999)),java.util.Map.of("title","Bad","price",10.123),java.util.Map.of("title","Bad","price",10,"images",List.of("javascript:alert(1)")))) {
            var q=new java.util.HashMap<String,Object>(payload("Bad"));q.putAll(invalid);
            mvc.perform(post("/api/admin/products").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("product",q)))).andExpect(status().isBadRequest()).andExpect(jsonPath("$.trace").doesNotExist());
        }
        org.mockito.Mockito.verifyNoInteractions(ai);
    }
    @Test @WithMockUser(roles="ADMIN") void variantMetadataIsVersionCheckedPreservesStockAndNeverChangesHistoricalOrderPrices() throws Exception {
        var user=User.builder().username("history").email("history@example.test").passwordHash("test").build();em.persist(user);
        var order=Order.builder().user(user).totalAmount(BigDecimal.TEN).build();em.persist(order);
        var line=OrderDetail.builder().order(order).variant(first).quantity(1).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.TEN).build();em.persist(line);
        var request=new java.util.HashMap<String,Object>();request.put("productID",product.getProductID());request.put("title","Updated variant");request.put("sku","FIRST");request.put("available",false);request.put("price",99);request.put("stockQuantity",9999);
        var body=java.util.Map.of("variant",request,"expectedVersion",first.getVersion());
        String url="/api/admin/products/"+product.getProductID()+"/variants/"+first.getVariantID();
        mvc.perform(put(url).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isOk()).andExpect(jsonPath("$.stockQuantity").value(12)).andExpect(jsonPath("$.price").value(99));
        mvc.perform(put(url).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isConflict());
        em.flush();em.refresh(line);assertThat(line.getUnitPrice()).isEqualByComparingTo("10");assertThat(line.getSubTotal()).isEqualByComparingTo("10");
        mvc.perform(patch("/api/admin/product-variants/"+first.getVariantID()+"/stock").contentType("application/json").content("{\"stockQuantity\":-1,\"version\":1}")).andExpect(status().isBadRequest());
    }
    @Test @WithMockUser(roles="ADMIN") void newVariantsValidateUniqueSkuAndExactInitialQuantity() throws Exception {
        String url="/api/admin/products/"+product.getProductID()+"/variants";
        var v=java.util.Map.of("productID",product.getProductID(),"title","New variant","sku","NEW","price",20,"stockQuantity",0);
        mvc.perform(post(url).contentType("application/json").content(json.writeValueAsString(java.util.Map.of("variant",v,"initialStock",4)))).andExpect(status().isCreated()).andExpect(jsonPath("$.stockQuantity").value(4));
        mvc.perform(post(url).contentType("application/json").content(json.writeValueAsString(java.util.Map.of("variant",v,"initialStock",4)))).andExpect(status().isConflict());
        for(Number quantity:List.of(-1,1.5,2147483648L))mvc.perform(post(url).contentType("application/json").content(json.writeValueAsString(java.util.Map.of("variant",v,"initialStock",quantity)))).andExpect(status().isBadRequest());
    }
    @Test @WithMockUser(roles="ADMIN") void hideAndSoftDeletePreserveOrderCartReviewAndRagReadsCurrentValues() throws Exception {
        var user=User.builder().username("retained").email("retain@example.test").passwordHash("test").build();em.persist(user);
        var order=Order.builder().user(user).totalAmount(BigDecimal.TEN).build();em.persist(order);
        var line=OrderDetail.builder().order(order).variant(first).quantity(1).unitPrice(BigDecimal.TEN).subTotal(BigDecimal.TEN).build();em.persist(line);
        var cart=Cart.builder().user(user).build();em.persist(cart);var item=CartItem.builder().cart(cart).variant(first).quantity(1).build();em.persist(item);
        var review=Review.builder().user(user).product(product).rating(5).comment("Retain").build();em.persist(review);em.flush();
        String token=token();mvc.perform(patch("/api/admin/products/"+product.getProductID()+"/status").contentType("application/json").content(json.writeValueAsString(java.util.Map.of("available",false,"expectedState",token)))).andExpect(status().isOk());
        assertThat(catalog.byIds(List.of(product.getProductID())).getFirst().sellable()).isFalse();
        mvc.perform(delete("/api/admin/products/"+product.getProductID()).contentType("application/json").content(json.writeValueAsString(java.util.Map.of("expectedState",token())))).andExpect(status().isNoContent());em.flush();em.clear();
        assertThat(em.find(OrderDetail.class,line.getOrderDetailID())).isNotNull();assertThat(em.find(CartItem.class,item.getCartItemID())).isNotNull();assertThat(em.find(Review.class,review.getReviewID())).isNotNull();assertThat(em.find(ProductVariant.class,first.getVariantID())).isNotNull();
        mvc.perform(get("/api/products")).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));org.mockito.Mockito.verifyNoInteractions(ai);
    }
    @Test @WithMockUser(roles="ADMIN") void excelExportsAllFilteredProductsAndVariantRowsWithSafeStringsAndVndStyles() throws Exception {
        for(int i=0;i<12;i++){var p=create("=HYPERLINK test "+i,true,true);p.setVendor(vendor);variant(p,"EXPORT-"+i,10,20);}em.flush();em.clear();
        var response=mvc.perform(get("/api/admin/products/export?search=HYPERLINK&vendorID="+vendor.getVendorID()+"&status=SELLING&sort=ID_ASC")).andExpect(status().isOk()).andExpect(header().string("Content-Disposition",org.hamcrest.Matchers.containsString("stationery-products-"))).andReturn().getResponse();
        try(var book=new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))) {
            assertThat(book.getNumberOfSheets()).isEqualTo(2);var sheet=book.getSheetAt(0);assertThat(sheet.getLastRowNum()).isEqualTo(12);assertThat(sheet.getPaneInformation().isFreezePane()).isTrue();assertThat(sheet.getCTWorksheet().isSetAutoFilter()).isTrue();
            assertThat(sheet.getRow(1).getCell(1).getCellType()).isEqualTo(CellType.STRING);assertThat(sheet.getRow(1).getCell(1).getStringCellValue()).startsWith("=HYPERLINK");
            var variants=book.getSheetAt(1);assertThat(variants.getLastRowNum()).isEqualTo(12);assertThat(variants.getRow(1).getCell(5).getNumericCellValue()).isEqualTo(20);assertThat(variants.getRow(1).getCell(5).getCellStyle().getDataFormatString()).contains("₫");
        }
        verifyNoInteractions(storage);org.mockito.Mockito.verifyNoInteractions(ai);
    }
    @Test @WithMockUser(roles="ADMIN") void invalidFiltersAndEmptyOrOversizeExportsHaveSafeHttpStatuses() throws Exception {
        for(String f:List.of("page=-1","size=51","sort=NEWEST","status=ACTIVE","vendorID=-1","lowStock=maybe"))mvc.perform(get("/api/admin/products?"+f)).andExpect(status().isBadRequest());
        mvc.perform(get("/api/admin/products/export?search=missing")).andExpect(status().isNotFound());
        for(int i=0;i<20;i++)create("Big "+i,true,true);em.flush();mvc.perform(get("/api/admin/products/export")).andExpect(status().isPayloadTooLarge());
    }
    @Test @WithMockUser(roles="ADMIN") void stockAndPriceHydrateCurrentOffersWithoutChangingSemanticContentOrCallingGemini() throws Exception {
        String before=catalog.byIds(List.of(product.getProductID())).getFirst().semanticText();
        mvc.perform(patch("/api/admin/product-variants/"+first.getVariantID()+"/stock").contentType("application/json").content("{\"stockQuantity\":15,\"version\":0}"))
            .andExpect(status().isOk());
        var q=java.util.Map.of("productID",product.getProductID(),"title","FIRST","sku","FIRST","available",true,"price",99,"stockQuantity",999);
        mvc.perform(put("/api/admin/products/"+product.getProductID()+"/variants/"+first.getVariantID()).contentType("application/json")
            .content(json.writeValueAsString(java.util.Map.of("variant",q,"expectedVersion",1)))).andExpect(status().isOk()).andExpect(jsonPath("$.stockQuantity").value(15));
        em.flush();em.clear();
        var current=catalog.byIds(List.of(product.getProductID())).getFirst();
        assertThat(current.semanticText()).isEqualTo(before);assertThat(current.product().price()).isEqualByComparingTo("50");
        assertThat(current.offers()).extracting(com.example.backend.ai.CatalogProduct.Offer::price).anySatisfy(price->assertThat(price).isEqualByComparingTo("99"));
        org.mockito.Mockito.verifyNoInteractions(ai);
    }
    private String token() throws Exception {return json.readTree(mvc.perform(get("/api/admin/products/"+product.getProductID())).andReturn().getResponse().getContentAsString()).get("stateToken").asText();}
    private String write(Object body,String token){return json.writeValueAsString(java.util.Map.of("product",body,"expectedState",token));}
    private java.util.Map<String,Object> payload(String title){var q=new java.util.HashMap<String,Object>();q.put("title",title);q.put("price",40);q.put("available",true);q.put("images",List.of("https://example.test/image.png"));q.put("tagIDs",List.of(tag.getTagID()));q.put("vendorID",vendor.getVendorID());q.put("productTypeID",category.getProductTypeID());return q;}
    private Product create(String title,boolean available,boolean active){var p=Product.builder().title(title).price(BigDecimal.TEN).available(available).isActive(active).build();em.persist(p);return p;}
    private ProductVariant variant(Product p,String sku,int stock,int price){var v=ProductVariant.builder().product(p).title(sku).sku(sku).stockQuantity(stock).price(BigDecimal.valueOf(price)).build();em.persist(v);p.getVariants().add(v);return v;}
}
