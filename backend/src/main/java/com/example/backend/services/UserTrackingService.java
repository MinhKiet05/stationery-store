package com.example.backend.services;

import com.example.backend.model.*;

public interface UserTrackingService {
    boolean recordView(String username, Long productID);
    void recordCartAddition(User user, Product product);
    void recordPurchase(Order order);
}
