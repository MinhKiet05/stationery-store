package com.example.backend.services;

import com.example.backend.dto.returns.CreateReturnRequest;
import com.example.backend.dto.returns.ReturnResponse;
import com.example.backend.dto.returns.UpdateReturnStatusRequest;
import java.util.List;

public interface ReturnRequestService {
    ReturnResponse create(String username, CreateReturnRequest request);
    List<ReturnResponse> myRequests(String username);
    ReturnResponse get(String username, Long id);
    List<ReturnResponse> all();
    ReturnResponse changeStatus(Long id, UpdateReturnStatusRequest request);
}
