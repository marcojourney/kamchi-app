# Security Specification: RielLedger Firestore Rules

## 1. Data Invariants
1. **User Isolation**: Every `borrowers`, `loans`, `payments`, `staff`, `auditLogs`, and `portalShares` document has an `ownerId` matching `request.auth.uid`, and `users/{userId}` is strictly readable and writable only by `userId == request.auth.uid` with `email_verified == true`.
2. **Master Gate on Subcollections**: `/loans/{loanId}/schedules/{installmentId}` cannot be created, read, updated, or deleted unless the parent `/loans/{loanId}` exists and has `ownerId == request.auth.uid`.
3. **Referential Integrity on Create**: A `/loans/{loanId}` document requires an existing `/borrowers/{borrowerId}` owned by the same user, and a `/payments/{paymentId}` document requires an existing `/loans/{loanId}` owned by the same user.
4. **Immortal Ownership & Timestamps**: `ownerId` and `createdAt` cannot be modified after creation. `createdAt == request.time` on create and `updatedAt == request.time` on update.
5. **Immutable Audit Trail**: `/auditLogs/{logId}` is append-only (`update` and `delete` are forbidden).
6. **Terminal State Locking**: Once a loan's `status` becomes `settled`, `written_off`, or `renewed`, balance-mutating updates are blocked unless explicitly transitioning via valid non-terminal states.
7. **PII-Free Borrower Portal**: `/portalShares/{shareId}` allows exact-ID `get` only (`allow list: if false`) and never stores phone numbers, addresses, national ID numbers, or emails.
8. **Strict Key & Size Constraints**: Every write uses `keys().hasAll(...)` + `keys().hasOnly(...)` on create, `affectedKeys().hasOnly(...)` on update, `isValidId()` on path variables, and bounded `.size()` checks on every string and array.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-Tenant Borrower Read**: User B attempts `get(/borrowers/b_userA)` -> `PERMISSION_DENIED`.
2. **Blanket List Scraping**: User B attempts `list(/borrowers)` without `where('ownerId', '==', uidB)` -> `PERMISSION_DENIED`.
3. **Identity Spoofing on Create**: User B creates a loan with `ownerId: uidA` -> `PERMISSION_DENIED`.
4. **Shadow / Ghost Field Injection**: User A creates a borrower with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
5. **Unverified Email Spoof**: User with `email_verified: false` attempts to write to `/users/{uid}` -> `PERMISSION_DENIED`.
6. **Path Variable Poisoning**: User A writes to `/loans/<2000-char-id>` -> `PERMISSION_DENIED`.
7. **Orphaned Loan Creation**: User A creates a loan referencing a nonexistent `borrowerId` -> `PERMISSION_DENIED`.
8. **Cross-Tenant Schedule Subcollection Write**: User B writes `/loans/loanA/schedules/1` even with `ownerId: uidB` -> `PERMISSION_DENIED` (Master Gate fails).
9. **Client Timestamp Tampering**: User A creates a payment with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
10. **Audit Log Tampering**: User A attempts `update` or `delete` on `/auditLogs/{logId}` -> `PERMISSION_DENIED`.
11. **Array Type Poisoning / Unbounded Tags**: User A creates a borrower with 25 tags or `tags: [12345]` -> `PERMISSION_DENIED`.
12. **Portal Enumeration Attack**: Unauthenticated or malicious user attempts `list(/portalShares)` -> `PERMISSION_DENIED`.
