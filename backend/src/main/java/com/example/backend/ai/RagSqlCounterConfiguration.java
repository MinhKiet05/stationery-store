package com.example.backend.ai;

import lombok.extern.slf4j.Slf4j;
import org.hibernate.cfg.SessionEventSettings;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Configuration;
import java.util.Map;

/** Optional diagnostics: never enable SQL/bind logging or clear shared Hibernate statistics. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "app.ai.rag-sql-count-enabled", havingValue = "true")
@Slf4j
public class RagSqlCounterConfiguration implements HibernatePropertiesCustomizer {
    private boolean installed;

    @Override public void customize(Map<String, Object> properties) {
        var existing = properties.putIfAbsent(SessionEventSettings.AUTO_SESSION_EVENTS_LISTENER,
                RagRequestTrace.SqlExecutionListener.class.getName());
        installed = existing == null;
        if (!installed) log.info("RAG SQL counter disabled: preserving an existing Hibernate session event listener");
    }

    public boolean isInstalled() { return installed; }
}
