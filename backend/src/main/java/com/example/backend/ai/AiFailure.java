package com.example.backend.ai;

/** Stable diagnostic codes; never expose connection strings, credentials or model output. */
public class AiFailure extends RuntimeException {
    public enum Reason { DISABLED, BUSY, CONFIGURATION, EMBEDDING, VECTOR, CHAT, MODEL_OUTPUT, TIMEOUT, RATE_LIMIT, AUTHENTICATION, NETWORK }
    private final Reason reason;
    public AiFailure(Reason reason, Throwable cause) { super(reason.name(), cause); this.reason = reason; }
    public AiFailure(Reason reason) { this(reason, null); }
    public Reason reason() { return reason; }
    public static AiFailure at(Reason stage, RuntimeException cause) {
        if (cause instanceof AiFailure failure) return failure;
        for (Throwable current = cause; current != null; current = current.getCause()) {
            if (current instanceof java.io.InterruptedIOException || current instanceof java.net.http.HttpTimeoutException
                    || current instanceof java.util.concurrent.TimeoutException)
                return new AiFailure(Reason.TIMEOUT, cause);
            int status = current instanceof com.google.genai.errors.ApiException api ? api.code()
                    : current instanceof org.springframework.web.client.RestClientResponseException http ? http.getStatusCode().value() : 0;
            if (status == 429) return new AiFailure(Reason.RATE_LIMIT, cause);
            if (status == 401 || status == 403) return new AiFailure(Reason.AUTHENTICATION, cause);
            if (current instanceof java.io.IOException && stage != Reason.VECTOR)
                return new AiFailure(Reason.NETWORK, cause);
        }
        return new AiFailure(stage, cause);
    }
}
