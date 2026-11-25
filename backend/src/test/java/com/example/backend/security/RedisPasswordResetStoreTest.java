package com.example.backend.security;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class RedisPasswordResetStoreTest {
    private static final String SECRET = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    private static final String RAW = "A".repeat(22) + "." + "B".repeat(43);

    @Test void missingOrWeakHmacSecretFailsBeforeAnyNetworkOperation() {
        var factory = mock(RedisConnectionFactory.class);
        for (String secret : new String[]{"", "not base64", "YWJj"}) {
            assertThatThrownBy(() -> new RedisPasswordResetStore(factory, secret, "test"))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        verifyNoInteractions(factory);
    }

    @Test void redisUnavailableFailsClosedForIssuanceLookupAndConsumptionWithoutSensitiveDiagnostics() {
        var factory = mock(RedisConnectionFactory.class);
        when(factory.getConnection()).thenThrow(new RedisConnectionFailureException("sensitive connection diagnostic"));
        var store = new RedisPasswordResetStore(factory, SECRET, "test");
        for (Runnable operation : new Runnable[]{store::checkAvailable, () -> store.canIssue(1L),
                () -> store.findUser(RAW), () -> store.consume(1L, RAW)}) {
            assertThatThrownBy(operation::run).isInstanceOfSatisfying(ResponseStatusException.class, error -> {
                assertThat(error.getStatusCode().value()).isEqualTo(503);
                assertThat(error.getReason()).doesNotContain("sensitive", RAW, SECRET);
            });
        }
    }

    @Test void malformedAndLegacySqlTokensAreNeverAcceptedOrLookedUpInAnotherStore() {
        var factory = mock(RedisConnectionFactory.class);
        var store = new RedisPasswordResetStore(factory, SECRET, "test");
        for (String raw : new String[]{"", "legacy-token", "A".repeat(43), "a.b", "A".repeat(300)}) {
            assertThat(store.findUser(raw)).isNull();
            assertThat(store.consume(1L, raw)).isFalse();
        }
        verifyNoInteractions(factory);
    }

    @Test void resetRequestToStringRedactsTokenAndPassword() {
        String text = new com.example.backend.dto.passwordreset.ResetPasswordRequest(RAW, "private-new-password").toString();
        assertThat(text).doesNotContain(RAW, "private-new-password").contains("<redacted>");
    }
}
