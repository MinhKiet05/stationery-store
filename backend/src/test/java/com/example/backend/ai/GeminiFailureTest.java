package com.example.backend.ai;

import com.google.genai.errors.ApiException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import java.net.*;
import static org.assertj.core.api.Assertions.*;

class GeminiFailureTest {
    @ParameterizedTest
    @CsvSource({"429,RATE_LIMIT", "401,AUTHENTICATION", "403,AUTHENTICATION", "500,CHAT", "503,CHAT"})
    void classifiesWrappedGeminiStatusWithoutExposingProviderMessage(int status, AiFailure.Reason reason) {
        var failure = AiFailure.at(AiFailure.Reason.CHAT, new RuntimeException(new ApiException(status, "status", "sensitive provider details")));
        assertThat(failure.reason()).isEqualTo(reason);
        assertThat(failure.getMessage()).isEqualTo(reason.name());
    }

    @Test
    void distinguishesTimeoutsConnectionsAndVectorFailures() {
        assertThat(AiFailure.at(AiFailure.Reason.EMBEDDING, new RuntimeException(new SocketTimeoutException())).reason())
                .isEqualTo(AiFailure.Reason.TIMEOUT);
        assertThat(AiFailure.at(AiFailure.Reason.CHAT, new RuntimeException(new java.net.http.HttpTimeoutException("timeout"))).reason())
                .isEqualTo(AiFailure.Reason.TIMEOUT);
        assertThat(AiFailure.at(AiFailure.Reason.EMBEDDING, new RuntimeException(new UnknownHostException())).reason())
                .isEqualTo(AiFailure.Reason.NETWORK);
        assertThat(AiFailure.at(AiFailure.Reason.VECTOR, new RuntimeException(new ConnectException())).reason())
                .isEqualTo(AiFailure.Reason.VECTOR);
        var disabled = new AiFailure(AiFailure.Reason.DISABLED);
        assertThat(AiFailure.at(AiFailure.Reason.CHAT, disabled)).isSameAs(disabled);
    }
}
