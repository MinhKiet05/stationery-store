# Return request API verification

Set the collection variables to a delivered order belonging to `customerToken`,
an order detail in that order, and two different customer JWTs plus an ADMIN JWT.
The order needs `deliveredAt` within seven days and a quantity not already
reserved by other non-rejected requests. Run the collection in order. Set
`rejectReturnID` to a second PENDING request before the final request;
approval and rejection cannot both be applied to the same request.

Policy decisions used by this implementation: the return deadline is exactly
seven 24-hour periods after `deliveredAt` (the boundary instant is allowed);
multiple requests are allowed while quantity remains; PENDING, APPROVED and
COMPLETED reserve quantity, REJECTED does not. Evidence is 1–5 HTTP(S) URLs,
stored newline-separated in the existing `evidence_images` column. The order
uses RETURN_PENDING only while a request is awaiting review. Admin may change
PENDING to APPROVED or REJECTED once. Approval is acceptance for manual
processing; it does not refund payment or restock inventory.

Verification on 2026-11-01: focused service and HTTP-security tests passed;
Maven compile passed. Live Postman and SQL Server verification remain pending
because `localhost:1433` was unavailable. No real tokens are stored here.
