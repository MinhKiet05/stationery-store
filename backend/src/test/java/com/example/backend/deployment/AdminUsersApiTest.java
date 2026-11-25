package com.example.backend.deployment;

import com.example.backend.model.*;
import com.example.backend.dto.user.*;
import com.example.backend.repositories.AdminUserRepository;
import com.example.backend.services.ReviewImageStorage;
import jakarta.persistence.EntityManager;
import org.apache.poi.ss.usermodel.CellType;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.annotation.*;
import org.springframework.transaction.support.TransactionTemplate;
import java.io.ByteArrayInputStream;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:admin-users;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1;LOCK_TIMEOUT=10000",
    "spring.datasource.username=sa","spring.datasource.password=","spring.datasource.driver-class-name=org.h2.Driver",
    "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
    "spring.flyway.enabled=true","spring.jpa.hibernate.ddl-auto=validate","spring.jpa.properties.hibernate.default_schema=store",
    "spring.jpa.properties.hibernate.generate_statistics=true","app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "spring.mail.username=test@example.test","spring.mail.password=","app.mail.from=test@example.test",
    "app.ai.enabled=false","app.ai.vector-url=","logging.level.root=WARN","app.admin.users.max-export-rows=20"
})
@AutoConfigureMockMvc @Transactional
class AdminUsersApiTest {
    @Autowired MockMvc mvc;
    @Autowired EntityManager em;
    @Autowired JwtEncoder encoder;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder passwords;
    @Autowired AdminUserRepository repository;
    @Autowired org.springframework.transaction.PlatformTransactionManager manager;
    @MockitoBean ReviewImageStorage images;
    String prefix;
    User admin,customer;
    @BeforeEach void setup(){
        prefix="users-"+UUID.randomUUID().toString().substring(0,8);
        // A separate transaction is needed only for the concurrent test.
        var tx=new TransactionTemplate(manager);
        tx.executeWithoutResult(ignored->{admin=user("admin",UserRole.ADMIN,true);customer=user("customer",UserRole.CUSTOMER,true);em.flush();});
    }
    User user(String suffix,UserRole role,boolean active){
        var u=User.builder().username(prefix+"-"+suffix).email(prefix+"-"+suffix+"@example.test").fullName(suffix).passwordHash("secret-hash-never-returned").phoneNumber("0901234567").role(role).isActive(active).build();em.persist(u);return u;
    }
    String token(User u){
        var claims=JwtClaimsSet.builder().issuer("stationery-store").subject(u.getUsername()).issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(3600)).claim("role","ADMIN").build();
        return "Bearer "+encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
    }
    String body(UserRole expected,boolean active,String change){return "{\"expectedRole\":\""+expected+"\",\"expectedActive\":"+active+","+change+"}";}
    ResultActions change(User actor,Long id,String body)throws Exception{return mvc.perform(patch("/api/admin/users/"+id).header("Authorization",token(actor)).contentType("application/json").content(body));}
    @Test void accessChecksApplyToAllEndpointsAndNeverTrustClaimRole()throws Exception {
        for(String path:List.of("","/statistics","/export")){
            mvc.perform(get("/api/admin/users"+path)).andExpect(status().isUnauthorized());
            mvc.perform(get("/api/admin/users"+path).header("Authorization",token(customer))).andExpect(status().isForbidden());
        }
        mvc.perform(get("/api/users/"+customer.getUserID())).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/users/"+customer.getUserID()).header("Authorization",token(customer))).andExpect(status().isForbidden());
        change(customer,customer.getUserID(),body(UserRole.CUSTOMER,true,"\"role\":\"ADMIN\"")).andExpect(status().isForbidden());
        mvc.perform(patch("/api/users/"+admin.getUserID()+"/status").header("Authorization",token(customer)).contentType("application/json").content("{\"isActive\":false}")).andExpect(status().isForbidden());
    }
    @Test void listFilteringPaginationStatisticsAndProjectionAreRealAndBounded()throws Exception {
        user("blocked",UserRole.CUSTOMER,false);user("percent%_",UserRole.CUSTOMER,true);em.flush();
        mvc.perform(get("/api/admin/users").param("search",prefix).param("size","2").param("page","1").header("Authorization",token(admin)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(4)).andExpect(jsonPath("$.content.length()").value(2));
        mvc.perform(get("/api/admin/users/statistics").param("search",prefix).header("Authorization",token(admin)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.totalUsers").value(4)).andExpect(jsonPath("$.customers").value(3)).andExpect(jsonPath("$.admins").value(1)).andExpect(jsonPath("$.lockedUsers").value(1));
        mvc.perform(get("/api/admin/users").param("search",prefix).param("role","CUSTOMER").param("active","false").header("Authorization",token(admin)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.content[0].fullName").value("blocked")).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/admin/users").param("search","%_").header("Authorization",token(admin))).andExpect(jsonPath("$.totalElements").value(1));
        var result=mvc.perform(get("/api/users/"+customer.getUserID()).header("Authorization",token(admin))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(result).doesNotContain("password","Hash","token","cart","orders");
        var stats=em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();stats.clear();
        var filter=new AdminUserFilter(prefix,null,null,AdminUserFilter.Sort.NEWEST);repository.find(filter,0,50);repository.count(filter);
        assertThat(stats.getPrepareStatementCount()).isEqualTo(2);
    }
    @Test void sortingValidationNotFoundAndNullLegacyStatus()throws Exception {
        customer.setCreatedAt(LocalDateTime.of(2020,1,1,0,0));customer.setFullName("AAA");em.flush();
        for(String sort:List.of("OLDEST","NAME_ASC"))mvc.perform(get("/api/admin/users").param("search",prefix).param("sort",sort).header("Authorization",token(admin))).andExpect(jsonPath("$.content[0].userID").value(customer.getUserID()));
        for(String query:List.of("size=51","page=-1","role=STAFF","sort=BAD","active=unknown"))mvc.perform(get("/api/admin/users?"+query).header("Authorization",token(admin))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/users/99999999").header("Authorization",token(admin))).andExpect(status().isNotFound());
        change(admin,customer.getUserID(),"{\"role\":\"STAFF\"}").andExpect(status().isBadRequest());
        change(admin,customer.getUserID(),body(UserRole.CUSTOMER,true,"\"role\":\"ADMIN\",\"isActive\":false")).andExpect(status().isBadRequest());
        customer.setIsActive(null);em.flush();
        change(admin,customer.getUserID(),"{\"expectedRole\":\"CUSTOMER\",\"expectedActive\":null,\"isActive\":true}").andExpect(status().isOk()).andExpect(jsonPath("$.isActive").value(true));
    }
    @Test void roleChangeRevokesOldJwtAndRejectsStaleState()throws Exception {
        change(admin,customer.getUserID(),body(UserRole.CUSTOMER,true,"\"role\":\"ADMIN\"")).andExpect(status().isOk()).andExpect(jsonPath("$.role").value("ADMIN"));
        change(admin,customer.getUserID(),body(UserRole.CUSTOMER,true,"\"isActive\":false")).andExpect(status().isConflict());
        change(admin,customer.getUserID(),body(UserRole.ADMIN,true,"\"role\":\"CUSTOMER\"")).andExpect(status().isOk());
        mvc.perform(get("/api/admin/users").header("Authorization",token(customer))).andExpect(status().isForbidden());
    }
    @Test void lockUnlockBlocksLoginAndExistingJwtWithoutDeletingHistory()throws Exception {
        String hash=passwords.encode("test-password");customer.setPasswordHash(hash);em.flush();
        String login="{\"username\":\""+customer.getUsername()+"\",\"password\":\"test-password\"}";
        mvc.perform(post("/api/auth/login").contentType("application/json").content(login)).andExpect(status().isOk());
        var cart=Cart.builder().user(customer).build();em.persist(cart);em.flush();
        String jwt=token(customer);
        change(admin,customer.getUserID(),body(UserRole.CUSTOMER,true,"\"isActive\":false")).andExpect(status().isOk());
        em.clear();
        mvc.perform(get("/api/users/me").header("Authorization",jwt)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType("application/json").content(login)).andExpect(status().isUnauthorized());
        change(admin,customer.getUserID(),body(UserRole.CUSTOMER,false,"\"isActive\":true")).andExpect(status().isOk());
        em.clear(); // Each real HTTP request has a new persistence context.
        mvc.perform(get("/api/users/me").header("Authorization",jwt)).andExpect(status().isOk());
        assertThat(em.find(Cart.class,cart.getCartID())).isNotNull();
        assertThat(em.find(User.class,customer.getUserID()).getPasswordHash()).isEqualTo(hash);
        mvc.perform(post("/api/auth/login").contentType("application/json").content(login)).andExpect(status().isOk());
    }
    @Test void protectsSelfAndLastAdminIncludingLegacyEndpoint()throws Exception {
        change(admin,admin.getUserID(),body(UserRole.ADMIN,true,"\"role\":\"CUSTOMER\"")).andExpect(status().isConflict());
        change(admin,admin.getUserID(),body(UserRole.ADMIN,true,"\"isActive\":false")).andExpect(status().isConflict());
        mvc.perform(patch("/api/users/"+admin.getUserID()+"/status").header("Authorization",token(admin)).contentType("application/json").content("{\"isActive\":false}")).andExpect(status().isConflict());
        mvc.perform(patch("/api/users/"+customer.getUserID()+"/status").header("Authorization",token(admin)).contentType("application/json").content("{\"isActive\":false}")).andExpect(status().isOk()).andExpect(jsonPath("$.isActive").value(false));
    }
    @Test void profileCannotMassAssignRoleOrAccountStatus()throws Exception {
        mvc.perform(put("/api/users/me").header("Authorization",token(customer)).contentType("application/json").content("{\"email\":\""+customer.getEmail()+"\",\"fullName\":\"Changed\",\"role\":\"ADMIN\",\"isActive\":false}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.role").value("CUSTOMER")).andExpect(jsonPath("$.isActive").value(true));
        mvc.perform(get("/api/users/"+admin.getUserID()).header("Authorization",token(customer))).andExpect(status().isForbidden());
    }
    @Test void excelExportsAllFilteredRowsAsStringsAndNoSecrets()throws Exception {
        customer.setFullName("=HYPERLINK(\"bad\")");em.flush();
        for(int i=0;i<11;i++)user("export"+i,UserRole.CUSTOMER,true);em.flush();
        var response=mvc.perform(get("/api/admin/users/export").param("search",prefix).param("role","CUSTOMER").header("Authorization",token(admin))).andExpect(status().isOk()).andExpect(header().string("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).andReturn().getResponse();
        try(var book=new XSSFWorkbook(new ByteArrayInputStream(response.getContentAsByteArray()))){
            var sheet=book.getSheetAt(0);assertThat(sheet.getLastRowNum()).isEqualTo(12);
            boolean formulaSeen=false;
            for(var row:sheet)for(var cell:row){assertThat(cell.getCellType()).isEqualTo(CellType.STRING);assertThat(cell.getStringCellValue()).doesNotContain("secret-hash","password","token");if(cell.getStringCellValue().startsWith("=HYPERLINK"))formulaSeen=true;}
            assertThat(formulaSeen).isTrue();assertThat(sheet.getRow(0).getLastCellNum()).isEqualTo((short)8);
        }
        mvc.perform(get("/api/admin/users/export").param("search","no-such-user-123").header("Authorization",token(admin))).andExpect(status().isNotFound());
        for(int i=11;i<21;i++)user("export"+i,UserRole.CUSTOMER,true);em.flush();
        mvc.perform(get("/api/admin/users/export").param("search",prefix).header("Authorization",token(admin))).andExpect(status().isPayloadTooLarge());
    }
    @Test @Transactional(propagation=Propagation.NOT_SUPPORTED)
    void concurrentCrossDemotionAndCrossLockAlwaysKeepAnActiveAdmin()throws Exception {
        var tx=new TransactionTemplate(manager);
        User other=tx.execute(ignored->user("other-admin",UserRole.ADMIN,true));
        try {
            for(boolean lock:List.of(false,true)){
                tx.executeWithoutResult(ignored->{em.createQuery("update User u set u.role=ADMIN,u.isActive=true where u.userID in :ids").setParameter("ids",List.of(admin.getUserID(),other.getUserID())).executeUpdate();});
                var barrier=new CyclicBarrier(2);
                try(var pool=Executors.newFixedThreadPool(2)){
                    var futures=new ArrayList<Future<Integer>>();
                    for(var pair:List.of(List.of(admin,other),List.of(other,admin)))futures.add(pool.submit(()->{barrier.await(5,TimeUnit.SECONDS);return change(pair.get(0),pair.get(1).getUserID(),body(UserRole.ADMIN,true,lock?"\"isActive\":false":"\"role\":\"CUSTOMER\"")).andReturn().getResponse().getStatus();}));
                    var codes=List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS));
                    assertThat(codes).contains(200);assertThat(codes.stream().filter(code->code==200).count()).isEqualTo(1);
                    assertThat(codes).allMatch(code->code==200 || code==401 || code==403 || code==409);
                }
                Long count=tx.execute(ignored->em.createQuery("select count(u) from User u where u.username like :prefix and u.role=ADMIN and u.isActive=true",Long.class).setParameter("prefix",prefix+"%").getSingleResult());
                assertThat(count).isEqualTo(1);
            }
        }finally{tx.executeWithoutResult(ignored->em.createQuery("delete from User u where u.username like :prefix").setParameter("prefix",prefix+"%").executeUpdate());}
    }
}
