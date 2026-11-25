package com.example.backend.services;

import com.example.backend.dto.user.UpdateProfileRequest;
import com.example.backend.dto.user.UserResponse;
import com.example.backend.model.User;
import com.example.backend.repositories.UserRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;

/** Opt-in only: real PostgreSQL on a disposable localhost database, never Supabase. */
@EnabledIfSystemProperty(named = "profile.postgres.url",
        matches = "jdbc:postgresql://(127\\.0\\.0\\.1|localhost):[0-9]+/postgres")
class UserProfilePostgreSqlTest extends UserProfileIntegrationTest {
    @Autowired UserRepository repository;
    @Autowired PlatformTransactionManager transactions;
    @Autowired JdbcTemplate jdbc;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> System.getProperty("profile.postgres.url"));
        registry.add("spring.datasource.username", () -> "postgres");
        registry.add("spring.datasource.password", () -> "");
        registry.add("spring.datasource.driver-class-name", () -> "org.postgresql.Driver");
        registry.add("spring.datasource.hikari.connection-init-sql", () -> "SET search_path TO store, extensions, public");
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void waitingProfileUpdatePreservesPasswordCommittedByPreviousWriter() throws Exception {
        verifyWaitingWriter(false);
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void waitingProfileUpdateRejectsAccountDisabledByPreviousWriter() throws Exception {
        verifyWaitingWriter(true);
    }

    private void verifyWaitingWriter(boolean disable) throws Exception {
        var tx = new TransactionTemplate(transactions);
        Long id = tx.execute(status -> repository.saveAndFlush(User.builder().username("concurrent-profile")
                .email("concurrent@example.test").passwordHash("before-hash").build()).getUserID());
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var secondStarted = new CountDownLatch(1);
        var waitingPid = new AtomicInteger();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<?> first = executor.submit(() -> tx.executeWithoutResult(status -> {
                User user = repository.findForUpdateById(id).orElseThrow();
                user.setPasswordHash("committed-new-hash");
                if (disable) user.setIsActive(false);
                locked.countDown();
                await(release);
            }));
            assertThat(locked.await(5, TimeUnit.SECONDS)).isTrue();
            Future<UserResponse> second = executor.submit(() -> tx.execute(status -> {
                waitingPid.set(jdbc.queryForObject("select pg_backend_pid()", Integer.class));
                secondStarted.countDown();
                return users.updateMe("concurrent-profile", new UpdateProfileRequest(
                        "concurrent@example.test", "Updated after waiting", null, null));
            }));
            assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            boolean waiting = false;
            while (System.nanoTime() < deadline) {
                waiting = Boolean.TRUE.equals(jdbc.queryForObject(
                        "select exists(select 1 from pg_stat_activity where pid=? and wait_event_type='Lock')",
                        Boolean.class, waitingPid.get()));
                if (waiting) break;
                Thread.sleep(20);
            }
            assertThat(waiting).as("second writer must wait for a real PostgreSQL row lock").isTrue();
            release.countDown();
            first.get(5, TimeUnit.SECONDS);
            if (disable) {
                assertThatThrownBy(() -> second.get(5, TimeUnit.SECONDS))
                        .isInstanceOf(ExecutionException.class)
                        .hasCauseInstanceOf(ResponseStatusException.class)
                        .satisfies(error -> assertThat(((ResponseStatusException) error.getCause()).getStatusCode().value()).isEqualTo(401));
            } else {
                assertThat(second.get(5, TimeUnit.SECONDS).fullName()).isEqualTo("Updated after waiting");
            }
            assertThat(jdbc.queryForObject("select password_hash from store.users where user_id=?", String.class, id))
                    .isEqualTo("committed-new-hash");
            assertThat(jdbc.queryForObject("select is_active from store.users where user_id=?", Boolean.class, id))
                    .isEqualTo(!disable);
        } finally {
            release.countDown();
            executor.shutdownNow();
            assertThat(executor.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
            // Only this test's own committed fixture, inside the isolated local database.
            jdbc.update("delete from store.users where user_id=?", id);
        }
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Timed out waiting for test writer");
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(interrupted);
        }
    }
}
