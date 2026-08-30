export const DEFAULT_DASHBOARD_PAGE_SIZE = 10;

export function paginateItems(items, requestedPage = 1, pageSize = DEFAULT_DASHBOARD_PAGE_SIZE) {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), pageCount);
  const offset = (page - 1) * pageSize;
  const pageItems = items.slice(offset, offset + pageSize);

  return {
    items: pageItems,
    page,
    pageCount,
    total,
    start: total === 0 ? 0 : offset + 1,
    end: total === 0 ? 0 : offset + pageItems.length,
    hasPrevious: page > 1,
    hasNext: page < pageCount,
  };
}
