package com.example.backend.ai;

import lombok.extern.slf4j.Slf4j;
import org.hibernate.SessionEventListener;
import java.util.UUID;
import java.util.function.Supplier;

/** Monotonic stage timings and optional current-thread Hibernate execution counts. No SQL/text retained. */
@Slf4j
public final class RagRequestTrace implements AutoCloseable {
    public enum Stage {
        VECTOR_SEARCH, CATALOG_VECTOR_IDS, KEYWORD_CANDIDATES, FILTER_SORT,
        GEMINI_SELECT, CATALOG_SELECTED_IDS, FINAL_FILTER
    }
    private static final ThreadLocal<RagRequestTrace> CURRENT = new ThreadLocal<>();
    private final RagRequestTrace previous;
    private final boolean sqlCounting;
    private final String trace = UUID.randomUUID().toString();
    private final long started = System.nanoTime();
    private long statements;
    private String outcome = "FAILED";

    private RagRequestTrace(boolean sqlCounting) {
        this.sqlCounting = sqlCounting;
        previous = CURRENT.get();
        CURRENT.set(this);
    }

    public static RagRequestTrace open(boolean sqlCounting) { return new RagRequestTrace(sqlCounting); }

    public <T> T measure(Stage stage, Supplier<T> operation) {
        long start = System.nanoTime(), before = statements;
        boolean success = false;
        try {
            T result = operation.get();
            success = true;
            return result;
        } finally {
            log.info("RAG_PERF trace={} stage={} durationMs={} sqlStatements={} success={}",
                    trace, stage, elapsedMillis(start), sqlCount(statements - before), success);
        }
    }

    public void completed(String source) {
        // Restrict log values even if a future caller passes untrusted text.
        outcome = switch (source) {
            case "AI_RAG", "CATALOG_FALLBACK", "UNAVAILABLE" -> source;
            default -> "COMPLETED";
        };
    }

    private Object sqlCount(long count) { return sqlCounting ? count : "disabled"; }
    private static double elapsedMillis(long start) { return (System.nanoTime() - start) / 1_000_000.0; }

    @Override public void close() {
        try {
            log.info("RAG_PERF trace={} stage=TOTAL durationMs={} sqlStatements={} outcome={}",
                    trace, elapsedMillis(started), sqlCount(statements), outcome);
        } finally {
            if (previous == null) CURRENT.remove(); else CURRENT.set(previous);
        }
    }

    /** Per-session listener, also compatible with an existing StatementInspector and disabled global statistics. */
    public static class SqlExecutionListener implements SessionEventListener {
        @Override public void jdbcExecuteStatementStart() {
            var current = CURRENT.get();
            if (current != null && current.sqlCounting) current.statements++;
        }
    }
}
