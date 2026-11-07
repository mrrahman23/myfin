import { describe, expect, it } from "vitest";
import { formatDuration, formatQty, predictItem, priceStats, type PurchasePoint } from "./predict";

const p = (date: string, qty: number, price: number | null = null, store: string | null = null): PurchasePoint => ({
  date,
  qty,
  totalPrice: price === null ? null : price * 100,
  store,
});

describe("predictItem", () => {
  it("needs history before predicting", () => {
    expect(predictItem([], [], "2026-11-07").status).toBe("learning");
    const one = predictItem([p("2026-11-01", 5)], [], "2026-11-07");
    expect(one.status).toBe("learning");
    expect(one.suggestedQty).toBe(5);
  });

  it("learns from purchase intervals: 5 kg every 20 days", () => {
    const r = predictItem([p("2026-09-01", 5), p("2026-09-21", 5), p("2026-10-11", 5), p("2026-10-31", 5)], [], "2026-11-15");
    expect(r.dailyUse).toBeCloseTo(0.25);
    expect(r.daysPerUsualQty).toBeCloseTo(20);
    expect(r.runOutDate).toBe("2026-11-20");
    expect(r.daysLeft).toBe(5);
    expect(r.status).toBe("ok");
    expect(r.confidence).toBe(1);
  });

  it("prefers 'running low' signals over late purchases", () => {
    // ran low after 10 days, but the next purchase only happened after 20
    const r = predictItem([p("2026-10-01", 2), p("2026-10-21", 2)], ["2026-10-11T08:00:00Z"], "2026-10-25");
    expect(r.dailyUse).toBeCloseTo(0.2);
    expect(r.runOutDate).toBe("2026-10-31");
    expect(r.status).toBe("ok");
  });

  it("flags items that will run out within the lead time", () => {
    const r = predictItem([p("2026-10-01", 1), p("2026-10-08", 1)], [], "2026-11-13", 3);
    expect(r.runOutDate).toBe("2026-10-15");
    expect(r.status).toBe("out");
    const soon = predictItem([p("2026-11-01", 1), p("2026-11-08", 1)], [], "2026-11-13", 3);
    expect(soon.daysLeft).toBe(2);
    expect(soon.status).toBe("soon");
  });

  it("a low signal after the last purchase means it is running out now", () => {
    const r = predictItem([p("2026-11-01", 3), p("2026-11-04", 3)], ["2026-11-05"], "2026-11-06");
    expect(r.status).toBe("out");
  });
});

describe("priceStats", () => {
  it("computes unit prices, change and cheapest store", () => {
    const s = priceStats([p("2026-09-01", 5, 400, "Shwapno"), p("2026-10-01", 5, 450, "Agora"), p("2026-11-01", 2, 200, "Shwapno")]);
    expect(s.lastUnitPrice).toBe(10000); // ৳100 per unit
    expect(s.change).toBeCloseTo((100 - 85) / 85);
    expect(s.cheapest).toMatchObject({ unitPrice: 8000, store: "Shwapno" });
    expect(s.totalSpent).toBe(105000);
  });
  it("handles purchases without prices", () => {
    expect(priceStats([p("2026-11-01", 1)])).toMatchObject({ lastUnitPrice: null, change: null, totalSpent: 0 });
  });
});

describe("formatting", () => {
  it("formats quantities and durations", () => {
    expect(formatQty("5.000", "kg")).toBe("5 kg");
    expect(formatQty(1.25, "L")).toBe("1.25 L");
    expect(formatDuration(20)).toBe("about 3 weeks");
    expect(formatDuration(5)).toBe("5 days");
    expect(formatDuration(null)).toBe("—");
  });
});
