package com.example.backend.services;
import com.example.backend.dto.order.*;
import java.util.List;
public interface OrderService {
    OrderResponse placeOrder(String username, PlaceOrderRequest request);
    List<OrderResponse> myOrders(String username);
    MyOrderHistoryResponse myOrderHistory(String username, int page, int size, String search, com.example.backend.model.OrderStatus status, boolean summary);
    OrderResponse getOrder(String username, Long orderID);
    OrderResponse cancelOrder(String username, Long orderID);
    List<OrderResponse> adminOrders();
    AdminOrderDetailResponse adminOrder(Long orderID);
    OrderResponse adminChangeStatus(Long orderID, UpdateOrderStatusRequest request);
}
