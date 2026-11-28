import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  __setInstallmentStorageDriverForTests,
  buildInstallmentPlan,
  createInstallmentPlan,
  deleteInstallmentPlan,
  generateInstallmentSchedule,
  listInstallmentPlans,
  recordInstallmentPlanPayment,
  roundInstallmentAmount,
  tryParseMarketChainPayload,
  type InstallmentPlan,
} from '../index';

describe('installmentCalc: schedule generation, rounding, and payments', () => {
  it('generates exact USD installment schedule with zero rounding remainder loss', () => {
    const breakdown = generateInstallmentSchedule({
      totalPrice: 480,
      downPayment: 100,
      interestRatePercent: 0,
      installmentCount: 6,
      frequency: 'monthly',
      startDate: '2026-11-27',
      currency: 'USD',
      todayIso: '2026-11-27',
    });

    assert.equal(breakdown.financedAmount, 380);
    assert.equal(breakdown.totalInstallmentsPayable, 380);
    assert.equal(breakdown.schedules.length, 6);
    assert.equal(breakdown.schedules[0].dueDate, '2026-12-27');
    assert.equal(breakdown.schedules[5].dueDate, '2027-05-27');

    const sum = breakdown.schedules.reduce((acc, s) => acc + s.amountDue, 0);
    assert.equal(Math.round(sum * 100) / 100, 380);
  });

  it('rounds KHR installment totals using configured khrRoundingStep', () => {
    assert.equal(roundInstallmentAmount(163333, 'KHR', 500), 163500);
    assert.equal(roundInstallmentAmount(163333, 'KHR', 1000), 163000);

    const breakdown = generateInstallmentSchedule({
      totalPrice: 1500000,
      downPayment: 300000,
      interestRatePercent: 0,
      installmentCount: 6,
      frequency: 'weekly',
      startDate: '2026-11-27',
      currency: 'KHR',
      khrRoundingStep: 1000,
      todayIso: '2026-11-27',
    });

    assert.equal(breakdown.financedAmount, 1200000);
    assert.equal(breakdown.schedules[0].amountDue, 200000);
    assert.equal(breakdown.schedules[0].dueDate, '2026-12-04');
  });

  it('parses valid MarketChain QR payloads and rejects non-order or malformed text', () => {
    const parsed = tryParseMarketChainPayload(
      JSON.stringify({
        source: 'marketchain',
        invoiceId: 'MC-2026-0842',
        item: 'Samsung Galaxy A55 5G',
        customerName: 'Lukas Meyer',
        phone: '012 345 678',
        currency: 'USD',
        total: 480,
        downPayment: 100,
        installments: 6,
      })
    );

    assert.ok(parsed);
    assert.equal(parsed.invoiceId, 'MC-2026-0842');
    assert.equal(parsed.item, 'Samsung Galaxy A55 5G');
    assert.equal(parsed.total, 480);
    assert.equal(parsed.downPayment, 100);
    assert.equal(parsed.installments, 6);

    assert.equal(tryParseMarketChainPayload('KC1-ABC-DEF-GHI'), null);
    assert.equal(tryParseMarketChainPayload('{"hello":"world"}'), null);
  });
});

describe('installmentStorage: offline create, list, payment, completion, and delete', () => {
  let memoryPlans: InstallmentPlan[] = [];

  beforeEach(() => {
    memoryPlans = [];
    __setInstallmentStorageDriverForTests({
      async readPlans() {
        return structuredClone(memoryPlans);
      },
      async writePlans(plans) {
        memoryPlans = structuredClone(plans);
      },
    });
  });

  it('creates an installment plan, records partial & full payments, completes plan, and deletes', async () => {
    const created = await createInstallmentPlan({
      source: 'marketchain',
      invoiceId: 'MC-2026-0099',
      itemName: 'Honda Dream 125',
      customerName: 'Elena Rossi',
      customerPhone: '012 555 777',
      currency: 'USD',
      totalPrice: 2000,
      downPayment: 500,
      interestRatePercent: 0,
      installmentCount: 3,
      frequency: 'monthly',
      startDate: '2026-11-27',
      todayIso: '2026-11-27',
    });

    assert.equal(created.status, 'active');
    assert.equal(created.financedAmount, 1500);
    assert.equal(created.remainingBalance, 1500);
    assert.equal(created.schedules.length, 3);

    const listed = await listInstallmentPlans();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);

    // Record first installment ($500)
    const afterFirst = await recordInstallmentPlanPayment(created.id, {
      amount: 500,
      paymentDate: '2026-12-27',
      method: 'khqr_aba',
      todayIso: '2026-12-27',
    });
    assert.equal(afterFirst.plan.paidAmount, 500);
    assert.equal(afterFirst.plan.remainingBalance, 1000);
    assert.equal(afterFirst.plan.schedules[0].status, 'paid');
    assert.equal(afterFirst.plan.schedules[1].status, 'pending');
    assert.equal(afterFirst.plan.status, 'active');

    // Pay off remaining $1000 -> auto-completes plan
    const afterFinal = await recordInstallmentPlanPayment(created.id, {
      amount: 1000,
      paymentDate: '2027-01-27',
      method: 'cash',
      todayIso: '2027-01-27',
    });
    assert.equal(afterFinal.plan.remainingBalance, 0);
    assert.equal(afterFinal.plan.status, 'completed');
    assert.equal(afterFinal.plan.schedules.every((s) => s.status === 'paid'), true);

    await deleteInstallmentPlan(created.id);
    assert.equal((await listInstallmentPlans()).length, 0);
  });

  it('builds 0-remaining completed plan when downPayment equals totalPrice', () => {
    const plan = buildInstallmentPlan({
      itemName: 'Cash Purchase',
      customerName: 'Liam Novak',
      currency: 'USD',
      totalPrice: 150,
      downPayment: 150,
      installmentCount: 1,
      frequency: 'monthly',
      startDate: '2026-11-27',
      todayIso: '2026-11-27',
    });
    assert.equal(plan.remainingBalance, 0);
    assert.equal(plan.status, 'completed');
  });
});
