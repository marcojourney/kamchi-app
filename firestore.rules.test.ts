/**
 * Dirty Dozen Security Rule Verification Spec
 * Reference payloads verified against firestore.rules invariants.
 */

export const DIRTY_DOZEN_CASES = [
  {
    name: '1. Cross-Tenant Borrower Read',
    actor: { uid: 'user_B', email_verified: true },
    operation: 'get',
    path: 'borrowers/borrower_owned_by_A',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Blanket List Scraping without ownerId filter',
    actor: { uid: 'user_B', email_verified: true },
    operation: 'list',
    path: 'borrowers',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Identity Spoofing on Loan Create',
    actor: { uid: 'user_B', email_verified: true },
    operation: 'create',
    path: 'loans/loan_spoof',
    payload: { ownerId: 'user_A', borrowerId: 'b1', principal: 100 },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Shadow / Ghost Field Injection',
    actor: { uid: 'user_A', email_verified: true },
    operation: 'create',
    path: 'borrowers/b_shadow',
    payload: { ownerId: 'user_A', name: 'Sokha', phone: '012345678', isAdmin: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Unverified Email Spoof',
    actor: { uid: 'user_A', email_verified: false },
    operation: 'write',
    path: 'users/user_A',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Path Variable Poisoning (oversized ID)',
    actor: { uid: 'user_A', email_verified: true },
    operation: 'create',
    path: `loans/${'x'.repeat(256)}`,
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Orphaned Loan Creation (missing borrower)',
    actor: { uid: 'user_A', email_verified: true },
    operation: 'create',
    path: 'loans/loan_orphan',
    payload: { ownerId: 'user_A', borrowerId: 'nonexistent_borrower' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Cross-Tenant Schedule Subcollection Write',
    actor: { uid: 'user_B', email_verified: true },
    operation: 'create',
    path: 'loans/loan_owned_by_A/schedules/inst_1',
    payload: { ownerId: 'user_B', loanId: 'loan_owned_by_A' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Client Timestamp Tampering on Payment',
    actor: { uid: 'user_A', email_verified: true },
    operation: 'create',
    path: 'payments/pay_backdated',
    payload: { ownerId: 'user_A', createdAt: '1999-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Audit Log Tampering (update/delete)',
    actor: { uid: 'user_A', email_verified: true },
    operation: 'delete',
    path: 'auditLogs/log_1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Array Type Poisoning / Unbounded Tags',
    actor: { uid: 'user_A', email_verified: true },
    operation: 'create',
    path: 'borrowers/b_bad_tags',
    payload: { ownerId: 'user_A', name: 'Dara', phone: '012000111', tags: [12345] },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Portal Enumeration Attack',
    actor: null,
    operation: 'list',
    path: 'portalShares',
    expected: 'PERMISSION_DENIED',
  },
] as const;
