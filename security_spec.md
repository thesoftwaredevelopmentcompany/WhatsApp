# Security Specification & Test Payloads

## 1. Data Invariants
- Users can only read and write to documents within their own user hierarchy (`/users/{userId}/**`).
- Contacts must have `ownerId == request.auth.uid` and `{userId} == request.auth.uid`.
- Campaigns and Reports cannot be forged or accessed by other authenticated users.
- Default deny prevents unauthorized collection read/write.
- Document IDs must satisfy string length bounds and regex sanity `^[a-zA-Z0-9_\-]+$`.

## 2. The Dirty Dozen Attack Payloads
1. **Cross-Tenant User Profile Read**: User B reading `/users/{userA}` without ownership -> `PERMISSION_DENIED`.
2. **Cross-Tenant User Profile Write**: User B overwriting `/users/{userA}` -> `PERMISSION_DENIED`.
3. **Cross-Tenant Contact Creation**: User B injecting contacts into `/users/{userA}/contacts/{contact1}` -> `PERMISSION_DENIED`.
4. **OwnerId Impersonation**: User A setting `ownerId: "userB"` on a contact in User A's subcollection -> `PERMISSION_DENIED`.
5. **Cross-Tenant Contact Read**: User B listing `/users/{userA}/contacts` -> `PERMISSION_DENIED`.
6. **Cross-Tenant Contact Delete**: User B deleting `/users/{userA}/contacts/{contact1}` -> `PERMISSION_DENIED`.
7. **Unauthenticated Read**: Anonymous user reading `/users/{userA}/contacts` -> `PERMISSION_DENIED`.
8. **Unauthenticated Write**: Anonymous user writing `/users/{userA}/campaigns/{camp1}` -> `PERMISSION_DENIED`.
9. **Junk Character Document ID Injection**: Attempting document ID with 1.5KB junk string or forbidden characters -> `PERMISSION_DENIED`.
10. **Report Tampering**: User B modifying reports under `/users/{userA}/reports` -> `PERMISSION_DENIED`.
11. **Shadow Field Injection**: Injecting arbitrary extra root privilege flags -> `PERMISSION_DENIED`.
12. **Blanket Query Scraping**: Attempting a collection group query across all users' contacts without filtering `ownerId == request.auth.uid` -> `PERMISSION_DENIED`.
