package com.example.backend.security;

import com.example.backend.model.User;
import com.example.backend.repositories.UserRepository;
import com.example.backend.services.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.hamcrest.Matchers.matchesPattern;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** A local disposable Redis/test double is opt-in. No production Redis or external AI/mail calls. */
@EnabledIfSystemProperty(named="test.redis.port",matches="[0-9]+")
@SpringBootTest(properties={
        "spring.datasource.url=jdbc:h2:mem:rate-limit;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
        "spring.datasource.username=sa", "spring.datasource.password=", "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.datasource.hikari.connection-init-sql=CREATE SCHEMA IF NOT EXISTS store; SET SCHEMA store",
        "spring.jpa.hibernate.ddl-auto=validate", "app.jwt.secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "spring.mail.username=test@example.test", "spring.mail.password=", "app.mail.from=test@example.test",
        "app.ai.enabled=false", "app.ai.vector-url=", "app.ai.chat-requests-per-minute=2",
        "app.rate-limit.login-ip-limit=6",
        "logging.level.root=WARN", "logging.level.org.hibernate.SQL=WARN",
        "app.redis.enabled=true", "app.redis.host=127.0.0.1", "app.redis.username=", "app.redis.password=", "app.redis.ssl-enabled=false",
        "app.cache.environment=rate-test", "app.password-reset.hmac-secret-base64=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
})
@AutoConfigureMockMvc
class RedisRateLimitingIntegrationTest {
    @DynamicPropertySource static void port(DynamicPropertyRegistry registry) {
        registry.add("app.redis.port",()->Integer.parseInt(System.getProperty("test.redis.port")));
    }
    @Autowired MockMvc mvc;
    @Autowired RedisConnectionFactory connections;
    @Autowired UserRepository users;
    @Autowired JwtTokenService jwt;
    @MockitoSpyBean RequestRateLimiter limiter;
    @MockitoBean AuthService auth;
    @MockitoBean PasswordResetService resets;
    @MockitoBean PasswordResetEmailSender mail;
    @MockitoBean ShoppingChatService chat;
    @MockitoBean ReviewImageStorage images;
    static final AtomicInteger ids = new AtomicInteger();
    String ip;
    @BeforeEach void uniquePeer() { ip="203.0.113."+ids.incrementAndGet(); }

    @Test void fiveFailedLoginsBlockTheSixthWithRetryAfterButSuccessDoesNotSpendBudget() throws Exception {
        when(auth.login(any())).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid credentials"));
        for(int i=0;i<5;i++) mvc.perform(request("/api/auth/login",login())).andExpect(status().isUnauthorized());
        mvc.perform(request("/api/auth/login",login())).andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After",matchesPattern("[1-9][0-9]*")));
        verify(auth,times(5)).login(any());
        // Changing account identifiers cannot bypass the broader per-IP failure budget.
        mvc.perform(request("/api/auth/login",login().replace("tester","other"))).andExpect(status().isUnauthorized());
        mvc.perform(request("/api/auth/login",login().replace("tester","third"))).andExpect(status().isTooManyRequests());
        reset(auth);
        ip="198.51.100."+ids.incrementAndGet();
        for(int i=0;i<7;i++) mvc.perform(request("/api/auth/login",login())).andExpect(status().isOk());
        verify(auth,times(7)).login(any());
    }

    @Test void registerAndForgotLimitsArePerPeerAndForgedForwardingCannotBypassThem() throws Exception {
        for(int i=0;i<5;i++) mvc.perform(request("/api/auth/register",register())).andExpect(status().isCreated());
        mvc.perform(request("/api/auth/register",register()).header("X-Forwarded-For","192.0.2.99"))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
        for(int i=0;i<3;i++) mvc.perform(request("/api/auth/forgot-password","{\"email\":\"unknown"+i+"@example.test\"}"))
                .andExpect(status().isOk());
        mvc.perform(request("/api/auth/forgot-password","{\"email\":\"other@example.test\"}"))
                .andExpect(status().isTooManyRequests());
        verify(resets,times(3)).requestReset(anyString());
    }

    @Test void resendLimitHasSameResponseForKnownAndUnknownAddressesAndDoesNotSpendForgotQuota() throws Exception {
        String response = null;
        for(String address:List.of("known@example.test","unknown@example.test")) {
            ip="198.51.100."+ids.incrementAndGet();
            String body="{\"email\":\""+address+"\"}";
            mvc.perform(request("/api/auth/forgot-password",body)).andExpect(status().isOk());
            for(int i=0;i<4;i++) {
                var result=mvc.perform(request("/api/auth/forgot-password",body)).andExpect(status().isTooManyRequests())
                        .andExpect(header().string("Retry-After",matchesPattern("[1-9][0-9]*"))).andReturn();
                if(response==null) response=result.getResponse().getContentAsString();
                assertThat(result.getResponse().getContentAsString()).isEqualTo(response);
            }
            mvc.perform(request("/api/auth/forgot-password","{\"email\":\"fresh@example.test\"}")).andExpect(status().isOk());
        }
    }

    @Test void aiUsesAuthenticatedIdentityAcrossAddressesAndKeepsAnonymousIpLimit() throws Exception {
        String name="chat-"+ids.incrementAndGet();
        User user=users.saveAndFlush(User.builder().username(name).email(name+"@example.test").passwordHash("test-hash").build());
        String token=jwt.issue(user);
        for(int i=0;i<2;i++) {
            ip="192.0.2."+ids.incrementAndGet();
            mvc.perform(request("/api/ai/chat","{\"message\":\"hello\"}").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        }
        ip="192.0.2."+ids.incrementAndGet();
        mvc.perform(request("/api/ai/chat","{\"message\":\"hello\"}").header("Authorization","Bearer "+token))
                .andExpect(status().isTooManyRequests());
        for(int i=0;i<2;i++) mvc.perform(request("/api/ai/chat","{\"message\":\"hello\"}")).andExpect(status().isOk());
        mvc.perform(request("/api/ai/chat","{\"message\":\"hello\"}")).andExpect(status().isTooManyRequests());
    }

    @Test void redisFailureReturns503BeforeBusinessCallsWhilePublicGetStillWorks() throws Exception {
        doThrow(RateLimitException.unavailable()).when(limiter).acquire(anyString(),anyString(),anyInt(),any(Duration.class));
        for(var call:List.of(request("/api/auth/login",login()),request("/api/auth/register",register()),
                request("/api/auth/forgot-password","{\"email\":\"unknown@example.test\"}"),
                request("/api/auth/reset-password","{\"token\":\"test\",\"newPassword\":\"new-password\"}"),
                request("/api/ai/chat","{\"message\":\"hello\"}"))) {
            mvc.perform(call).andExpect(status().isServiceUnavailable()).andExpect(header().string("Retry-After","5"));
        }
        verifyNoInteractions(auth,resets,chat,mail);
        mvc.perform(get("/api/products")).andExpect(status().isOk());
    }

    @Test void redisCountersHaveFixedTtlAndOldReservationsCannotReleaseANewWindow() {
        String identifier=UUID.randomUUID().toString();
        var old=limiter.acquire("login",identifier,1,Duration.ofSeconds(30));
        var redis=new StringRedisTemplate(connections);
        assertThat(old.key()).doesNotContain(identifier);
        assertThat(redis.getExpire(old.key())).isBetween(25L,30L);
        assertThatThrownBy(()->limiter.acquire("login",identifier,1,Duration.ofSeconds(30))).isInstanceOf(RateLimitException.class);
        redis.expire(old.key(),Duration.ZERO);
        limiter.acquire("login",identifier,1,Duration.ofSeconds(30));
        limiter.release(old);
        assertThatThrownBy(()->limiter.acquire("login",identifier,1,Duration.ofSeconds(30))).isInstanceOf(RateLimitException.class);
    }

    @Test void atomicRedisCounterAdmitsFiveOfEightConcurrentRequests() throws Exception {
        String identity=UUID.randomUUID().toString();
        var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(8)) {
            List<Future<Boolean>> results=new ArrayList<>();
            for(int i=0;i<8;i++) results.add(pool.submit(()->{
                start.await();
                try { limiter.acquire("register",identity,5,Duration.ofMinutes(15)); return true; }
                catch(RateLimitException error) { assertThat(error.getStatusCode().value()).isEqualTo(429); return false; }
            }));
            start.countDown(); int admitted=0;
            for(var result:results) if(result.get(5,TimeUnit.SECONDS)) admitted++;
            assertThat(admitted).isEqualTo(5);
        }
    }

    private MockHttpServletRequestBuilder request(String path,String body) {
        String peer=ip;
        return post(path).contentType("application/json").content(body).with(request->{request.setRemoteAddr(peer); return request;});
    }
    private String login() { return "{\"username\":\"tester\",\"password\":\"test-password\"}"; }
    private String register() { return "{\"username\":\"tester\",\"email\":\"test@example.test\",\"password\":\"test-password\"}"; }
}
