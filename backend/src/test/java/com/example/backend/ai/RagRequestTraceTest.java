package com.example.backend.ai;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import java.util.List;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;

class RagRequestTraceTest {
    @Test
    void timingSurvivesFailureAndClearsCountersBeforeNextRequest() {
        var logger = (Logger) LoggerFactory.getLogger(RagRequestTrace.class);
        var level = logger.getLevel();
        var logs = new ListAppender<ILoggingEvent>(); logs.start(); logger.addAppender(logs); logger.setLevel(Level.INFO);
        try {
            var listener = new RagRequestTrace.SqlExecutionListener();
            var failure = new IllegalStateException("PRIVATE_ERROR_CONTENT");
            try (var trace = RagRequestTrace.open(true)) {
                assertThatThrownBy(() -> trace.measure(RagRequestTrace.Stage.CATALOG_VECTOR_IDS, () -> {
                    listener.jdbcExecuteStatementStart(); throw failure;
                })).isSameAs(failure);
            }
            listener.jdbcExecuteStatementStart(); // Outside request: must not pollute the next request.
            try (var trace = RagRequestTrace.open(true)) { trace.completed("PRIVATE_INPUT"); }
            assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                    .anySatisfy(line -> assertThat(line).contains("stage=CATALOG_VECTOR_IDS", "sqlStatements=1", "success=false"))
                    .anySatisfy(line -> assertThat(line).contains("stage=TOTAL", "sqlStatements=0", "outcome=COMPLETED"))
                    .allSatisfy(line -> assertThat(line).doesNotContain("PRIVATE_INPUT", "PRIVATE_ERROR_CONTENT"));
        } finally { logger.detachAppender(logs); logger.setLevel(level); logs.stop(); }
    }

    @Test
    void concurrentRequestsHaveIndependentSqlCounts() throws Exception {
        var logger = (Logger) LoggerFactory.getLogger(RagRequestTrace.class);
        var level = logger.getLevel();
        var logs = new ListAppender<ILoggingEvent>() {
            @Override protected synchronized void append(ILoggingEvent event) { super.append(event); }
        };
        logs.start(); logger.addAppender(logs); logger.setLevel(Level.INFO);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var ready = new CountDownLatch(2);
            List<Callable<Void>> work = List.of(() -> count(ready, 1), () -> count(ready, 3));
            for (var result : executor.invokeAll(work, 10, TimeUnit.SECONDS)) result.get();
            assertThat(logs.list).extracting(ILoggingEvent::getFormattedMessage)
                    .anySatisfy(line -> assertThat(line).contains("stage=TOTAL", "sqlStatements=1"))
                    .anySatisfy(line -> assertThat(line).contains("stage=TOTAL", "sqlStatements=3"));
        } finally { logger.detachAppender(logs); logger.setLevel(level); logs.stop(); }
    }

    private Void count(CountDownLatch ready, int count) throws InterruptedException {
        try (var trace = RagRequestTrace.open(true)) {
            ready.countDown();
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            var listener = new RagRequestTrace.SqlExecutionListener();
            for (int i = 0; i < count; i++) listener.jdbcExecuteStatementStart();
        }
        return null;
    }

    @Test
    void optionalCounterPreservesOtherSessionListeners() {
        var config = new RagSqlCounterConfiguration();
        var settings = new java.util.HashMap<String, Object>();
        settings.put(org.hibernate.cfg.SessionEventSettings.AUTO_SESSION_EVENTS_LISTENER, "existing-listener");
        config.customize(settings);
        assertThat(config.isInstalled()).isFalse();
        assertThat(settings).containsValue("existing-listener");
    }
}
