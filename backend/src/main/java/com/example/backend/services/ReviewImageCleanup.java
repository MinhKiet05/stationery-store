package com.example.backend.services;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class ReviewImageCleanup {
    private final ReviewImageStorage storage;

    public void afterCommit(List<String> publicIds) {
        if (publicIds.isEmpty()) return;
        List<String> snapshot = new ArrayList<>(publicIds);
        requireTransaction();
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { snapshot.forEach(storage::deleteSafely); }
        });
    }

    public void onRollback(String publicId) {
        requireTransaction();
        // Register BEFORE the request, so a timeout can also be reconciled by ID.
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) storage.deleteSafely(publicId);
                else if (status == STATUS_UNKNOWN) {
                    log.error("REVIEW_IMAGE_COMMIT_UNKNOWN public_id={} reconcile DB before cleanup", publicId);
                }
            }
        });
    }

    private void requireTransaction() {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()) {
            throw new IllegalStateException("Image changes require an active transaction");
        }
    }
}
