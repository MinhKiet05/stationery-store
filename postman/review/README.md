# Review API verification

The collection `review.postman_collection.json` uses placeholder `baseUrl`,
`productID`, `reviewID`, and `accessToken` variables. Supply a customer JWT and
a product in a `DELIVERED` order belonging to that customer. Run the requests
in order: list, create, update, invalid rating, delete. Use a second customer's
JWT to verify PUT/DELETE ownership denial (403), and no token for POST (401).

Business rule: one active review per customer and product. A second purchase
does not allow another active review. Deleting the review releases that slot;
this is an implementation decision because the current schema has no review
history/tombstone.

Verification on 2026-11-01: focused Maven `ReviewSecurityTest` and
`ReviewServiceImplTest` passed. Maven compile passed. No live Postman or SQL
Server verification was performed because `localhost:1433` was unavailable.
The default Spring context test also requires SMTP configuration and SQL Server;
it was not used as evidence of API success.
