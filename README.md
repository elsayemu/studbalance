# BrickLink Income & Expense Tracker

An application that pulls your BrickLink orders (sales + purchases) into a
database, lets you add manual expenses, view a dashboard with insights and
charts, and export everything to Excel/XML/CSV/HTML for any date range.

## How To Use
- Open the standalone StudBalance.exe file 

## Features

- **Sync Now** - pulls latest sales & purchases from BrickLink.
- **Dark mode** - toggle switch, top left.
- **Currency conversion** - pick a display currency from the dropdown; every
  order/expense is converted using the *historical* exchange rate from its
  own transaction date (via the free Frankfurter API), not today's rate.
  The "Order Total" column always shows the original amount/currency; the
  "Converted" column next to it shows the same amount in your selected
  currency - compare the two directly to confirm conversion is applying.
- **Cancelled orders** - shown in the list (struck-through, dimmed) but
  excluded from every total, summary card, and insight.
- **Summary & Insights** - Sales, Purchases, Other Expenses, Net.,
  Avg Order Value, Avg Monthly Expenses, and a month-by-month profit line 
  chart for the selected date range.
- **Orders / Expenses tabs** - each searchable, filterable, and sortable
  (click column headers to sort). Orders show Item Total,
  Order Total, and Converted side by side.
- **Export** - Sales, Purchases, Other Expenses, and Summary
  sheets for the selected date range and currency.

## Notes

- 

