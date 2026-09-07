import { describe, expect, it } from "vitest";

import {
  DEFAULT_DASHBOARD_PAGE_SIZE,
  paginateItems,
} from "./dashboard/pagination.js";

describe("dashboard list pagination", () => {
  it("returns the requested page with stable display bounds", () => {
    const result = paginateItems(
      Array.from({ length: 23 }, (_, index) => `item-${index + 1}`),
      2
    );

    expect(DEFAULT_DASHBOARD_PAGE_SIZE).toBe(10);
    expect(result).toEqual({
      items: [
        "item-11",
        "item-12",
        "item-13",
        "item-14",
        "item-15",
        "item-16",
        "item-17",
        "item-18",
        "item-19",
        "item-20",
      ],
      page: 2,
      pageCount: 3,
      total: 23,
      start: 11,
      end: 20,
      hasPrevious: true,
      hasNext: true,
    });
  });

  it("clamps the active page when live data shrinks", () => {
    const result = paginateItems(["one", "two", "three"], 4, 2);

    expect(result).toEqual({
      items: ["three"],
      page: 2,
      pageCount: 2,
      total: 3,
      start: 3,
      end: 3,
      hasPrevious: true,
      hasNext: false,
    });
  });

  it("reports an empty list without creating an invalid page", () => {
    expect(paginateItems([], 8)).toEqual({
      items: [],
      page: 1,
      pageCount: 1,
      total: 0,
      start: 0,
      end: 0,
      hasPrevious: false,
      hasNext: false,
    });
  });
});
