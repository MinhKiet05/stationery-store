package com.example.backend.services;

import com.example.backend.dto.returns.CreateReturnRequest;
import com.example.backend.dto.returns.ReturnResponse;
import com.example.backend.dto.returns.UpdateReturnStatusRequest;
import java.util.List;
import com.example.backend.dto.returns.RefundPreview;
import com.example.backend.dto.returns.RefundPreviewRequest;

public interface ReturnRequestService {
    ReturnResponse create(String username, CreateReturnRequest request);
    RefundPreview preview(String username, RefundPreviewRequest request);
    ReturnResponse createUploaded(String username, CreateReturnRequest request, List<String> publicIds);
    List<ReturnResponse> myRequests(String username);
    ReturnResponse get(String username, Long id);
    List<ReturnResponse> all();
    ReturnResponse changeStatus(Long id, UpdateReturnStatusRequest request);
}
