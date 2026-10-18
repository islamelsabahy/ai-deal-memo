# AI Deal Memo · مذكرة صفقة الأرض

Paste a land offer the way it reached you (WhatsApp text, broker message, email, Arabic or English) and get an investment decision in seconds: **Go, Negotiate or Walk away**, with the numbers behind it, a negotiation range, red flags and a memo you can forward.

**Live:** https://islamelsabahy.github.io/ai-deal-memo/

## What it does

1. **Reads the offer.** It extracts area (m² or feddan), asking price (millions, billions or per m²), cash vs instalments, down payment, years, FAR, selling price and construction cost. It understands Arabic-Indic digits and Egyptian phrasing. Recognised fields are highlighted so you can check them.
2. **Values the land.** It runs the [Land Deal Lab](https://github.com/islamelsabahy/land-deal-lab) residual-valuation engine (monthly discounting of sales, construction, overhead and land payments) to find the most you can pay and still hit your target margin, plus margin and IRR at the asking price.
3. **Decides.**
   - **Go:** the max price is at least 10% above the ask and the margin at the ask meets target.
   - **Walk away:** the max price is below 85% of the ask, or the project is infeasible.
   - **Negotiate:** anything in between.
4. **Gives a negotiation range:** an opening offer and a walk-away price.
5. **Prices the payment structure:** max land price for cash, 3-year and 5-year instalments.
6. **Stress-tests:** margin with selling prices −15% and costs +20%, the hidden discount in the buyer payment plan (via [Egypt Payment Plans](https://github.com/islamelsabahy/egypt-payment-plans)), and the three drivers that move the answer most.
7. **Raises red flags:** low margin, IRR below the cost of money, loss under stress, optimistic efficiency or price growth, long buyer plans, fragile decisions and land-heavy deals.
8. **Writes the memo:** a copyable Markdown memo in Arabic or English, print to PDF, CSV export, and a one-click hand-off to [Developer Cashflow Survival](https://github.com/islamelsabahy/developer-cashflow-survival) to stress the cash.
9. **Optional AI layer:** paste your own Anthropic API key to turn the analysis into an investor-ready memo with a negotiation script and a due-diligence checklist. The key stays in the page and is never stored. Without it everything still works, and the AI is told to use only the computed numbers.

Nothing you paste is uploaded: it all runs in your browser.

## Engines

`docs/app/dealmemo.js` contains the extraction, decision rules, flags and memo. `docs/app/vendor/` holds unchanged copies of the tested engines from land-deal-lab and egypt-payment-plans (see `SOURCES.txt`). Tests: `node tests/test_dealmemo.js`.

## Limits

The extractor is rule-based and only fills what it can recognise, so always check the highlighted fields. The verdict is only as good as the selling price, cost and timing assumptions. Not investment advice: title, zoning, utilities and permits still need checking.

Author: Islam El-Sherbiny · MIT License

## Limitations
- Demonstration tool built on **fictional sample data**. Outputs are decision support, not legal, tax or investment advice.
- Results depend on the assumptions you enter; check them against your own numbers before relying on them.
- Browser-only: nothing is sent to a server by this tool. See [SECURITY.md](SECURITY.md).
