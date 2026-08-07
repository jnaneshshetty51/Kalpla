# Payment Collection Method — Pilot Cohort 1

See [canonical facts](../README.md#canonical-facts) for price and installment structure.

## Decision: UPI / direct bank transfer, manually reconciled

For cohort 1, collect payments via **UPI (VPA/QR) or direct NEFT/IMPS bank transfer** into the operating entity's bank account, tracked manually in the same Google Sheet used for [communication/roadmap tracking](08-communication-tool-decision.md).

## Why, and what was ruled out

| Option | Setup speed | Installment support | Fees | Blocking dependency |
|---|---|---|---|---|
| **UPI / bank transfer (chosen)** | Immediate — works with any bank account today | Manual (3 tracked payments per student) | ~0 (UPI) / negligible | None |
| Razorpay Payment Links | Fast once approved | Native | ~2% | **Merchant KYC requires a registered entity with GST/PAN** |
| Stripe Payment Links | Fast once approved | Native | ~2–3% + FX if not INR-native | Same KYC requirement; also less India-native than Razorpay for INR collection |
| Cash / cheque | Immediate | Manual | None | Poor audit trail, not recommended even at pilot scale |

The real blocker for Razorpay/Stripe is **merchant onboarding KYC**, which requires the entity-registration question in the [README's Open Items](../README.md#open-items-need-a-human-decision-not-more-drafting) to be resolved first (GST number, PAN, registered business proof). Rather than let that block cohort 1's launch, this document recommends starting with UPI/bank transfer — which has zero KYC dependency — and upgrading once the entity is confirmed.

## Recommended reconciliation process (pilot scale: ~10–20 students)

1. Each student receives a UPI ID/QR code and bank details, plus the installment schedule from [`05`](../legal/05-refund-cancellation-policy.md), at enrollment.
2. On each payment, the student sends a screenshot/reference number via WhatsApp (see [`08`](08-communication-tool-decision.md)).
3. A single person (named owner, not "whoever's free") logs each payment same-day in the shared Sheet's Payments tab: student name, installment #, amount, date, reference number, confirmed-by.
4. A student is only marked "fully enrolled" / given full platform access once installment 1 clears — this should be stated in the enrollment flow, not just tracked internally.

## Upgrade path

Once the entity's GST/PAN registration is confirmed, move to **Razorpay** (preferred over Stripe for an India/INR-native business — better UPI-native support and no FX friction) for cohort 2+. At that point the "installment plan" language can be revisited if a real BNPL/NBFC partner (e.g. Razorpay Affordability Suite) is also signed — see the README's [EMI vs. installment note](../README.md#why-installment-plan-not-emi).

## What this decision feeds

- [`05` refund policy](../legal/05-refund-cancellation-policy.md) — refund mechanics (manual UPI/bank reversal, not an automated gateway refund API)
- [`10` outcomes tracking](10-outcomes-tracking-template.md) — payment-status columns
- [`04` marketing copy](../legal/04-marketing-copy-pilot-cohort.md) — must not promise "instant automated refund" since none exists yet
