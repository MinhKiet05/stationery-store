package com.example.backend.ai;

/** Stable diagnostic codes; never expose connection strings, credentials or model output. */
public class AiFailure extends RuntimeException {
    public enum Reason { DISABLED, BUSY, CONFIGURATION, EMBEDDING, VECTOR, CHAT, MODEL_OUTPUT, TIMEOUT }
    private final Reason reason;
    public AiFailure(Reason reason, Throwable cause) { super(reason.name(), cause); this.reason = reason; }
    public AiFailure(Reason reason) { this(reason, null); }
    public Reason reason() { return reason; }
    public static AiFailure at(Reason stage, RuntimeException cause) {
        if (cause instanceof AiFailure failure) return failure;
        for (Throwable current = cause; current != null; current = current.getCause()) {
            if (current instanceof java.net.SocketTimeoutException || current instanceof java.net.http.HttpTimeoutException)
                return new AiFailure(Reason.TIMEOUT, cause);
        }
        return new AiFailure(stage, cause);
    }
}
