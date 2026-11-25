package com.example.backend.deployment;

import com.example.backend.excel.*;
import com.example.backend.model.*;
import com.example.backend.model.Tag;
import com.example.backend.services.*;
import com.example.backend.ai.*;
import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.io.*;
import java.nio.file.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;
import static com.example.backend.excel.ImportModels.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:excel-import;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
    "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true","spring.jpa.hibernate.ddl-auto=validate","spring.jpa.properties.hibernate.default_schema=store",
    "spring.jpa.properties.hibernate.generate_statistics=true","app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "spring.mail.username=test@example.test","spring.mail.password=","app.mail.from=test@example.test",
    "app.ai.enabled=false","app.ai.vector-url=","logging.level.root=WARN","app.admin.import.max-rows=1000"
})

@AutoConfigureMockMvc @Transactional @WithMockUser(username="import-admin",roles="ADMIN")
class ExcelImportApiTest {
    @Autowired MockMvc mvc;
    @Autowired org.springframework.web.context.WebApplicationContext context;
    @Autowired EntityManager em;
    @Autowired ExcelImportService imports;
    @Autowired ExcelCellReader reader;
    @Autowired ProductCatalog catalog;
    @Autowired ProductIndexJob job;
    @Autowired AiProperties properties;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @MockitoBean ReviewImageStorage storage;
    @MockitoBean CatalogAi ai;
    @MockitoSpyBean com.example.backend.services.impl.ProductVariantServiceImpl variants;
    @MockitoSpyBean Clock statisticsClock;
    final tools.jackson.databind.json.JsonMapper json=new tools.jackson.databind.json.JsonMapper();
    static final Path SAMPLES=Path.of("../docs/import-samples");
    @BeforeAll static void samples()throws Exception {
        if(Boolean.getBoolean("generate.import.samples")){
            Files.createDirectories(SAMPLES);var templates=new ExcelTemplateService();
            Files.write(SAMPLES.resolve("vouchers-import-test.xlsx"),templates.create(Kind.promotions,true,null));
            Files.write(SAMPLES.resolve("products-import-test.xlsx"),templates.create(Kind.products,true,null));
        }
    }
    @BeforeEach void actor(){mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup(context).apply(org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity()).build();new TransactionTemplate(manager).executeWithoutResult(ignored->{
        if(em.createQuery("select count(u) from User u where u.username='import-admin'",Long.class).getSingleResult()==0)em.persist(User.builder().username("import-admin").email("import-admin@example.test").passwordHash("test-only").role(UserRole.ADMIN).build());
    });}
    byte[] sample(Kind kind)throws Exception{return Files.readAllBytes(SAMPLES.resolve(kind==Kind.products?"products-import-test.xlsx":"vouchers-import-test.xlsx"));}
    byte[] edit(Kind kind,Consumer<XSSFWorkbook> change)throws Exception {try(var book=new XSSFWorkbook(new ByteArrayInputStream(sample(kind)));var output=new ByteArrayOutputStream()){change.accept(book);book.write(output);return output.toByteArray();}}
    MockMultipartFile file(byte[] bytes){return new MockMultipartFile("file","test.xlsx","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",bytes);}
    ResultActions preview(Kind kind,byte[] bytes)throws Exception{return mvc.perform(multipart("/api/admin/"+kind+"/import/preview").file(file(bytes)));}
    String token(Kind kind,byte[] bytes)throws Exception{return json.readTree(preview(kind,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.canImport").value(true)).andReturn().getResponse().getContentAsString()).get("importToken").asText();}
    ResultActions confirm(Kind kind,byte[] bytes,String token)throws Exception{return mvc.perform(multipart("/api/admin/"+kind+"/import/confirm").file(file(bytes)).param("importToken",token));}
    long count(String entity){return em.createQuery("select count(e) from "+entity+" e",Long.class).getSingleResult();}
    @Test void templatesAreRealWorkbooksWithReferenceAndOnlyAdminsCanUseEveryEndpoint()throws Exception {
        em.persist(Vendor.builder().name("Thương hiệu thật").build());em.flush();
        for(Kind kind:Kind.values()){
            mvc.perform(get("/api/admin/"+kind+"/import/template").with(org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous())).andExpect(status().isUnauthorized());
            var response=mvc.perform(get("/api/admin/"+kind+"/import/template")).andExpect(status().isOk()).andReturn().getResponse();
            try(var book=new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))){assertThat(book.getSheet("Guide")).isNotNull();if(kind==Kind.products){assertThat(book.getSheet("Products").getLastRowNum()).isZero();assertThat(book.getSheet("Reference").getRow(1).getCell(2).getStringCellValue()).isEqualTo("Thương hiệu thật");}}
            mvc.perform(get("/api/admin/"+kind+"/import/template").with(user("customer").roles("CUSTOMER"))).andExpect(status().isForbidden());
            for(String op:List.of("preview","confirm"))mvc.perform(multipart("/api/admin/"+kind+"/import/"+op).file(file(sample(kind))).param("importToken","fake").with(user("customer").roles("CUSTOMER"))).andExpect(status().isForbidden());
        }
    }
    @Test void bothOfficialFilesPreviewEveryRowWithoutAnyDatabaseWrites()throws Exception {
        long p=count("Product"),v=count("ProductVariant"),c=count("Coupon");
        preview(Kind.promotions,sample(Kind.promotions)).andExpect(status().isOk()).andExpect(jsonPath("$.totalRows").value(10)).andExpect(jsonPath("$.validRows").value(10)).andExpect(jsonPath("$.canImport").value(true));
        preview(Kind.products,sample(Kind.products)).andExpect(status().isOk()).andExpect(jsonPath("$.totalRows").value(25)).andExpect(jsonPath("$.validRows").value(25)).andExpect(jsonPath("$.canImport").value(true));
        assertThat(count("Product")).isEqualTo(p);assertThat(count("ProductVariant")).isEqualTo(v);assertThat(count("Coupon")).isEqualTo(c);verifyNoInteractions(ai,storage);
    }
    @Test void uniquenessAndReferenceChecksUseBoundedQueriesInsteadOfPerRowQueries()throws Exception {
        var stats=em.getEntityManagerFactory().unwrap(org.hibernate.SessionFactory.class).getStatistics();
        stats.clear();preview(Kind.products,sample(Kind.products)).andExpect(status().isOk());assertThat(stats.getPrepareStatementCount()).isEqualTo(6);
        stats.clear();preview(Kind.promotions,sample(Kind.promotions)).andExpect(status().isOk());assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
    }
    @Test void importsCouponsWithZeroUsageAndCheckoutActuallyConsumesTheImportedVoucher()throws Exception {
        byte[] bytes=sample(Kind.promotions);confirm(Kind.promotions,bytes,token(Kind.promotions,bytes)).andExpect(status().isOk()).andExpect(jsonPath("$.createdVouchers").value(10));
        assertThat(em.createQuery("select sum(c.usedCount) from Coupon c",Long.class).getSingleResult()).isZero();
        var u=User.builder().username("import-shopper").email("shopper@example.test").passwordHash("test-only").build();em.persist(u);
        var p=Product.builder().title("Checkout imported voucher").build();em.persist(p);var v=ProductVariant.builder().product(p).title("Variant").sku("TEST-CHECKOUT").stockQuantity(5).price(new BigDecimal("100000")).build();em.persist(v);
        var cart=Cart.builder().user(u).build();em.persist(cart);em.persist(CartItem.builder().cart(cart).variant(v).quantity(1).build());em.flush();
        mvc.perform(post("/api/orders").with(user("import-shopper").roles("CUSTOMER")).contentType("application/json").content("{\"shippingAddress\":\"Test address\",\"contactPhone\":\"0901234567\",\"paymentMethod\":\"COD\",\"couponCode\":\"TEST-EXCEL-02\"}"))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.discountAmount").value(10000))
            .andExpect(jsonPath("$.shippingFee").value(25000)).andExpect(jsonPath("$.totalAmount").value(115000));
        assertThat(em.createQuery("select c.usedCount from Coupon c where c.code='TEST-EXCEL-02'",Integer.class).getSingleResult()).isEqualTo(1);
    }
    @Test void importsProductsVariantsUnicodeLeadingZeroTextStockAndNeverFetchesImages()throws Exception {
        var vendor=Vendor.builder().name("Thương hiệu Việt").build();em.persist(vendor);var category=ProductType.builder().name("Bút nhập Excel").build();em.persist(category);var tag=Tag.builder().name("Học tập").build();em.persist(tag);em.flush();
        byte[] bytes=edit(Kind.products,b->{var r=b.getSheet("Products").getRow(1);r.getCell(6).setCellValue("Thương hiệu Việt");r.getCell(7).setCellValue("id:"+category.getProductTypeID());r.getCell(8).setCellValue("Học tập");b.getSheet("Variants").getRow(1).getCell(1).setCellValue("0000123");var image=b.getSheet("Images").createRow(1);image.createCell(0).setCellValue("TEST-P1");image.createCell(1).setCellValue("https://example.test/image.png");image.createCell(2).setCellValue("0");});
        confirm(Kind.products,bytes,token(Kind.products,bytes)).andExpect(status().isOk()).andExpect(jsonPath("$.createdProducts").value(10)).andExpect(jsonPath("$.createdVariants").value(15)).andExpect(jsonPath("$.aiStatus").value("DISABLED"));
        assertThat(count("Product")).isEqualTo(10);assertThat(count("ProductVariant")).isEqualTo(15);
        var product=em.createQuery("select p from Product p where p.handle='test-excel-product-1'",Product.class).getSingleResult();assertThat(product.getTitle()).contains("tiếng Việt");assertThat(product.getImages()).containsExactly("https://example.test/image.png");assertThat(product.getVendor().getVendorID()).isEqualTo(vendor.getVendorID());
        var variant=em.createQuery("select v from ProductVariant v where v.sku='0000123'",ProductVariant.class).getSingleResult();assertThat(variant.getStockQuantity()).isZero();verifyNoInteractions(ai,storage);
    }
    @Test void duplicatesInWorkbookAndDatabaseAreReportedWithLocationsAndNeverOverwriteStock()throws Exception {
        var p=Product.builder().title("Existing").build();em.persist(p);em.persist(ProductVariant.builder().product(p).title("Variant").sku("TEST-0001-1").price(BigDecimal.TEN).stockQuantity(99).build());
        em.persist(Coupon.builder().code("TEST-EXCEL-01").discountType(DiscountType.FIXED_AMOUNT).discountValue(BigDecimal.TEN).usedCount(7).build());em.flush();
        for(Kind kind:Kind.values()){
            byte[] bytes=edit(kind,b->{var sheet=b.getSheet(kind==Kind.products?"Variants":"Vouchers");sheet.getRow(2).getCell(kind==Kind.products?1:0).setCellValue(sheet.getRow(1).getCell(kind==Kind.products?1:0).getStringCellValue());});
            preview(kind,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.canImport").value(false)).andExpect(jsonPath("$.duplicateRows").value(2));
        }
        assertThat(em.createQuery("select v.stockQuantity from ProductVariant v where v.sku='TEST-0001-1'",Integer.class).getSingleResult()).isEqualTo(99);
    }
    @Test void allCouponFieldErrorsAreValidatedNotJustTheFirstPreviewPage()throws Exception {
        byte[] bytes=edit(Kind.promotions,b->{var s=b.getSheet("Vouchers");s.getRow(1).getCell(0).setCellValue("");s.getRow(2).getCell(1).setCellValue("FREESHIP");s.getRow(3).getCell(2).setCellValue("-1");s.getRow(4).getCell(2).setCellValue("101");s.getRow(5).getCell(3).setCellValue("-1");s.getRow(6).getCell(4).setCellValue("0");s.getRow(7).getCell(5).setCellValue("2100-01-01");s.getRow(8).getCell(7).setCellValue("yes");s.getRow(9).getCell(6).setCellValue("24/11/2026");s.getRow(10).getCell(2).setCellValue("1.111");});
        preview(Kind.promotions,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.invalidRows").value(10)).andExpect(jsonPath("$.canImport").value(false)).andExpect(jsonPath("$.rows[0].sheet").value("Vouchers")).andExpect(jsonPath("$.rows[0].rowNumber").value(2));assertThat(count("Coupon")).isZero();
    }
    @Test void invalidProductReferencesOrphanVariantsNegativePriceFractionalStockAndIdentifiersAreRejected()throws Exception {
        byte[] bytes=edit(Kind.products,b->{var p=b.getSheet("Products");p.getRow(1).getCell(6).setCellValue("missing vendor");p.getRow(2).getCell(7).setCellValue("missing category");p.getRow(3).getCell(8).setCellValue("missing tag");p.getRow(4).getCell(0).setCellValue(p.getRow(5).getCell(0).getStringCellValue());var v=b.getSheet("Variants");v.getRow(1).getCell(3).setCellValue("-1");v.getRow(2).getCell(5).setCellValue("1.5");v.getRow(3).getCell(5).setCellValue("-1");v.getRow(4).getCell(0).setCellValue("missing parent");v.getRow(5).getCell(1).setCellValue(123d);v.getRow(6).getCell(2).setCellValue("");});
        var response=preview(Kind.products,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.canImport").value(false)).andReturn().getResponse().getContentAsString();
        for(String code:List.of("REFERENCE","ORPHAN","DUPLICATE","MONEY","INTEGER","TEXT_REQUIRED","REQUIRED"))assertThat(response).contains(code);assertThat(count("Product")).isZero();
    }
    @Test void absentVariantsAndInvalidOrDuplicateImagesAreRejected()throws Exception {
        byte[] bytes=edit(Kind.products,b->{b.getSheet("Variants").removeRow(b.getSheet("Variants").getRow(1));for(int i=1;i<=2;i++){var r=b.getSheet("Images").createRow(i);r.createCell(0).setCellValue("TEST-P2");r.createCell(1).setCellValue("file:///secret.txt");r.createCell(2).setCellValue("0");}});
        var response=preview(Kind.products,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.canImport").value(false)).andReturn().getResponse().getContentAsString();assertThat(response).contains("VARIANT_REQUIRED","URL","DUPLICATE");
    }
    @Test void formulaCellsProduceRowErrorsAndAreNeverEvaluated()throws Exception {
        byte[] bytes=edit(Kind.promotions,b->b.getSheet("Vouchers").getRow(1).getCell(2).setCellFormula("1+2"));
        preview(Kind.promotions,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.canImport").value(false)).andExpect(jsonPath("$.rows[0].errors[0].field").value("discountValue")).andExpect(jsonPath("$.rows[0].errors[0].code").value("FORMULA_FORBIDDEN"));
    }
    @Test void rejectsWrongFormatCorruptXlsxMissingSheetsHeadersAndMacro()throws Exception {
        preview(Kind.products,"not excel".getBytes()).andExpect(status().isBadRequest());preview(Kind.products,new byte[]{80,75,3,4}).andExpect(status().isBadRequest());
        preview(Kind.products,edit(Kind.products,b->b.removeSheetAt(b.getSheetIndex("Variants")))).andExpect(status().isBadRequest());
        preview(Kind.products,edit(Kind.products,b->b.getSheet("Products").getRow(0).getCell(0).setCellValue("wrong"))).andExpect(status().isBadRequest());
        preview(Kind.products,edit(Kind.products,b->b.setWorkbookType(XSSFWorkbookType.XLSM))).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/admin/products/import/preview").file(new MockMultipartFile("file","legacy.xls","application/vnd.ms-excel",sample(Kind.products)))).andExpect(status().isBadRequest());
    }
    @Test void rejectsOversizedFilesRowsZipBombsAndExternalLinks()throws Exception {
        preview(Kind.promotions,new byte[5*1024*1024+1]).andExpect(status().isPayloadTooLarge());
        byte[] rows=edit(Kind.promotions,b->{var s=b.getSheet("Vouchers");for(int i=11;i<=1001;i++){var r=s.createRow(i);for(int c=0;c<8;c++)r.createCell(c).setCellValue(s.getRow(1).getCell(c).getStringCellValue());}});preview(Kind.promotions,rows).andExpect(status().isPayloadTooLarge());
        var output=new ByteArrayOutputStream();try(var zip=new java.util.zip.ZipOutputStream(output)){zip.putNextEntry(new java.util.zip.ZipEntry("xl/worksheets/sheet1.xml"));for(int i=0;i<17;i++)zip.write(new byte[1024*1024]);zip.closeEntry();}preview(Kind.products,output.toByteArray()).andExpect(status().isBadRequest());
        output=new ByteArrayOutputStream();try(var zip=new java.util.zip.ZipOutputStream(output)){zip.putNextEntry(new java.util.zip.ZipEntry("xl/externalLinks/externalLink1.xml"));zip.write("external".getBytes());zip.closeEntry();}preview(Kind.products,output.toByteArray()).andExpect(status().isBadRequest());
    }
    @Test void confirmIsBoundToBytesActorTypeAndExpiryAndRevalidatesCurrentDatabase()throws Exception {
        byte[] bytes=sample(Kind.promotions);String token=token(Kind.promotions,bytes);
        confirm(Kind.promotions,bytes,"x".repeat(181)).andExpect(status().isConflict());
        confirm(Kind.promotions,edit(Kind.promotions,b->b.getSheet("Vouchers").getRow(1).getCell(2).setCellValue("5000")),token).andExpect(status().isConflict());
        mvc.perform(multipart("/api/admin/promotions/import/confirm").file(file(bytes)).param("importToken",token).with(user("another-admin").roles("ADMIN"))).andExpect(status().isConflict());
        confirm(Kind.products,sample(Kind.products),token).andExpect(status().isConflict());
        doReturn(Instant.now().plusSeconds(1000)).when(statisticsClock).instant();confirm(Kind.promotions,bytes,token).andExpect(status().isConflict());reset(statisticsClock);
        em.persist(Coupon.builder().code("TEST-EXCEL-10").discountType(DiscountType.PERCENTAGE).discountValue(BigDecimal.TEN).build());em.flush();
        confirm(Kind.promotions,bytes,token).andExpect(status().isConflict());assertThat(count("Coupon")).isEqualTo(1);
    }
    @Test void importingSameFileTwiceNeverAddsStockOrCreatesAnotherRecord()throws Exception {
        for(Kind kind:Kind.values()){
            var bytes=sample(kind);String token=token(kind,bytes);confirm(kind,bytes,token).andExpect(status().isOk());confirm(kind,bytes,token).andExpect(status().isConflict());preview(kind,bytes).andExpect(status().isOk()).andExpect(jsonPath("$.canImport").value(false));
        }
        assertThat(count("Product")).isEqualTo(10);assertThat(count("ProductVariant")).isEqualTo(15);assertThat(count("Coupon")).isEqualTo(10);
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void lateFailureRollsBackAllProductsBeforeAnyVariantIsSaved()throws Exception {
        byte[] bytes=sample(Kind.products);String token=token(Kind.products,bytes);
        com.example.backend.services.impl.ProductVariantServiceImpl target=org.springframework.test.util.AopTestUtils.getUltimateTargetObject(variants);
        doThrow(new ResponseStatusException(HttpStatus.CONFLICT,"Test-only simulated failure")).when(target).createBatch(anyList());
        confirm(Kind.products,bytes,token).andExpect(status().isConflict());
        new TransactionTemplate(manager).executeWithoutResult(ignored->{assertThat(count("Product")).isZero();assertThat(count("ProductVariant")).isZero();});verifyNoInteractions(ai);
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void concurrentImportsHaveExactlyOneWinnerForBothCodesAndSkus()throws Exception {
        for(Kind kind:Kind.values()){
            byte[] bytes=sample(kind);String token=token(kind,bytes);var start=new CyclicBarrier(2);
            try(var pool=Executors.newFixedThreadPool(2)){
                var calls=new ArrayList<Future<Integer>>();for(int i=0;i<2;i++)calls.add(pool.submit(()->{start.await(5,TimeUnit.SECONDS);return mvc.perform(multipart("/api/admin/"+kind+"/import/confirm").file(file(bytes)).param("importToken",token).with(user("import-admin").roles("ADMIN"))).andReturn().getResponse().getStatus();}));
                assertThat(List.of(calls.get(0).get(30,TimeUnit.SECONDS),calls.get(1).get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
            }finally{new TransactionTemplate(manager).executeWithoutResult(ignored->{em.createQuery("delete from ProductVariant").executeUpdate();em.createNativeQuery("delete from store.product_images").executeUpdate();em.createNativeQuery("delete from store.product_tags").executeUpdate();em.createQuery("delete from Product").executeUpdate();em.createQuery("delete from Coupon").executeUpdate();});}
        }
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void indexingOnlySeesCommittedImportsAndGeminiFailureCanRetryWithoutLosingProducts()throws Exception {
        var bytes=sample(Kind.products);var token=token(Kind.products,bytes);var tx=new TransactionTemplate(manager);
        org.springframework.security.core.context.SecurityContextHolder.setContext(org.springframework.security.test.context.TestSecurityContextHolder.getContext());
        try {
            tx.executeWithoutResult(ignored->{imports.confirm(bytes,Kind.products,"import-admin",token);try(var pool=Executors.newSingleThreadExecutor()){assertThat(pool.submit(()->catalog.indexPage(0).size()).get(5,TimeUnit.SECONDS)).isZero();}catch(Exception error){throw new IllegalStateException(error);}verifyNoInteractions(ai);});
            properties.setEnabled(true);when(ai.synchronize(any())).thenThrow(new IllegalStateException("Test Gemini unavailable"));job.scheduled();
            tx.executeWithoutResult(ignored->assertThat(count("Product")).isEqualTo(10));
            doReturn(true).when(ai).synchronize(any());assertThat(job.reindex().scanned()).isEqualTo(10);
        }finally{properties.setEnabled(false);tx.executeWithoutResult(ignored->{em.createQuery("delete from ProductVariant").executeUpdate();em.createNativeQuery("delete from store.product_images").executeUpdate();em.createNativeQuery("delete from store.product_tags").executeUpdate();em.createQuery("delete from Product").executeUpdate();});}
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void concurrentDifferentFilesCannotBypassTheExistingProductTitleRule()throws Exception {
        byte[] first=sample(Kind.products),second=edit(Kind.products,b->{for(var r:b.getSheet("Products"))if(r.getRowNum()>0)r.getCell(2).setCellValue(r.getCell(2).getStringCellValue()+"-second");for(var r:b.getSheet("Variants"))if(r.getRowNum()>0)r.getCell(1).setCellValue(r.getCell(1).getStringCellValue()+"-second");});
        var payloads=List.of(first,second);var tokens=List.of(token(Kind.products,first),token(Kind.products,second));var start=new CyclicBarrier(2);
        try(var pool=Executors.newFixedThreadPool(2)){
            var results=new ArrayList<Future<Integer>>();for(int i=0;i<2;i++){int index=i;results.add(pool.submit(()->{start.await(5,TimeUnit.SECONDS);return mvc.perform(multipart("/api/admin/products/import/confirm").file(file(payloads.get(index))).param("importToken",tokens.get(index)).with(user("import-admin").roles("ADMIN"))).andReturn().getResponse().getStatus();}));}
            assertThat(List.of(results.get(0).get(30,TimeUnit.SECONDS),results.get(1).get(30,TimeUnit.SECONDS))).containsExactlyInAnyOrder(200,409);
            new TransactionTemplate(manager).executeWithoutResult(ignored->{assertThat(count("Product")).isEqualTo(10);assertThat(count("ProductVariant")).isEqualTo(15);});
        }finally{new TransactionTemplate(manager).executeWithoutResult(ignored->{em.createQuery("delete from ProductVariant").executeUpdate();em.createNativeQuery("delete from store.product_images").executeUpdate();em.createNativeQuery("delete from store.product_tags").executeUpdate();em.createQuery("delete from Product").executeUpdate();});}
    }
}
