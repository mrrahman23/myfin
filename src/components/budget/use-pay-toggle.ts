"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import { errorMessage } from "@/lib/data/errors";
import { deleteTransaction, markPaid, refreshAll, unmarkObligation } from "@/lib/data/mutations";
import type { LineItem } from "@/lib/finance/summary";
import { STATE_LABEL } from "@/lib/finance/summary";
import { formatMoney } from "@/lib/money";
import { useCurrency } from "@/lib/data/hooks";

/**
 * One-tap Paid / Received. Settling is immediate with an Undo toast;
 * un-ticking asks for confirmation because it removes recorded payments.
 */
export function usePayToggle() {
  const toast = useToast();
  const currency = useCurrency();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, LineItem["state"]>>({});
  const [confirmUnpay, setConfirmUnpay] = useState<LineItem | null>(null);

  async function settle(item: LineItem) {
    if (busyId) return;
    setBusyId(item.id);
    setOptimistic((o) => ({ ...o, [item.id]: "paid" }));
    if ("vibrate" in navigator) navigator.vibrate?.(8);
    try {
      const txnId = await markPaid(item.id);
      await refreshAll();
      const verb = item.kind === "income" ? "received" : "paid";
      toast.success(`${item.name} ${verb} · ${formatMoney(item.totalDue, { currency })}`, {
        label: "Undo",
        onClick: async () => {
          try {
            await deleteTransaction(txnId);
            await refreshAll();
            toast.show(`${item.name} marked ${STATE_LABEL[item.kind][item.state].toLowerCase()} again`);
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      });
    } catch (e) {
      toast.error(errorMessage(e));
      await refreshAll();
    } finally {
      setOptimistic((o) => {
        const next = { ...o };
        delete next[item.id];
        return next;
      });
      setBusyId(null);
    }
  }

  async function unpay(item: LineItem) {
    setBusyId(item.id);
    try {
      const removed = await unmarkObligation(item.id);
      await refreshAll();
      if (removed === 0) {
        toast.show("This item was settled by a payment recorded on a later month. Edit that payment in Transactions.");
      } else {
        toast.success(`Removed ${removed} payment${removed === 1 ? "" : "s"} from ${item.name}`);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusyId(null);
      setConfirmUnpay(null);
    }
  }

  function toggle(item: LineItem) {
    const state = optimistic[item.id] ?? item.state;
    if (state === "paid") setConfirmUnpay(item);
    else void settle(item);
  }

  const stateOf = (item: LineItem) => optimistic[item.id] ?? item.state;

  return { toggle, stateOf, busyId, confirmUnpay, setConfirmUnpay, unpay };
}
