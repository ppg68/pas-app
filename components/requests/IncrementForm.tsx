"use client";

import MoneyInput from "@/components/MoneyInput";
import SubmitButton from "@/components/SubmitButton";
import { addIncrement } from "@/lib/domain/workflow";

/**
 * Additional service after (or during) payment. Blocks with an alert when the amount goes over what is
 * left of the 50% limit (the server and the database check it again).
 */
export default function IncrementForm({
  requestId,
  currency,
  left,
}: {
  requestId: string;
  currency: string;
  left: number;
}) {
  const fmt = (n: number) => n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <form
      action={addIncrement.bind(null, requestId)}
      style={{ marginTop: 10 }}
      onSubmit={(e) => {
        const amount = parseFloat(String(new FormData(e.currentTarget).get("amount") || ""));
        if (Number.isFinite(amount) && amount > left + 0.005) {
          e.preventDefault();
          window.alert(
            `The additional service cannot exceed 50% of the initial value: you can add at most ${fmt(left)} ${currency}.`
          );
        }
      }}
    >
      <div className="field">
        <label>Additional amount ({currency})</label>
        <MoneyInput name="amount" required />
      </div>
      <div className="field">
        <label>Reason for the additional service</label>
        <textarea name="reason" required rows={2} />
      </div>
      <SubmitButton pendingLabel="Saving…">Add additional service</SubmitButton>
      <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 6 }}>
        The request goes back to the payment stage; the extra payment is authorized as usual.
      </p>
    </form>
  );
}
