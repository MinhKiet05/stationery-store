package com.example.backend.services;
import com.example.backend.dto.order.*;
import java.util.List;
public interface OrderService {
    OrderResponse placeOrder(String username, PlaceOrderRequest request);
    List<OrderResponse> myOrders(String username);
    OrderResponse getOrder(String username, Long orderID);
    OrderResponse cancelOrder(String username, Long orderID);
    List<OrderResponse> adminOrders();
    OrderResponse adminChangeStatus(Long orderID, UpdateOrderStatusRequest request);
}
