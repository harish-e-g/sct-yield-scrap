# Yield & Scrap Management Dashboard

Prepared by Prowesstics for Sujan Continental, Pune.

Live: https://harish-e-g.github.io/sct-yield-scrap/

## Views
- **Live shift**: simulated real-time feed of GO / NG parts (about 1,00,000 parts per shift across Line 1 and Line 2, ticking every second), run rate vs target, NG % against USL 3.5%, NG reason Pareto, live RM consumption and scrap cost, AI live insights and an event log. Speed control 1x / 10x / 60x. In production the feed comes from press counters, weighing scales and ProVision AI cameras.
- **Monthly analysis**: the view below.

## What it shows (monthly)
- KPIs: material yield, scrap %, wastage kg, scrap cost, good parts, rejection rate (vs last month)
- Production details per line: set vs actual RM consumption, wastage and waste per part
- Available RM stock: opening, inward, consumed, closing and days of cover
- Scrap % control chart with Average, USL and LSL (auto 3 sigma or manual)
- Trends: produced parts vs month, wastage by raw material, set vs actual
- AI insights: top scrap driver, out-of-limit months, trend forecast, stock alerts, savings
- What-if simulator: wastage reduction and RM price change

## Formulas
- Set consumption = good parts x standard kg per part
- Wastage = actual consumption - set consumption
- Material yield = set / actual; Scrap % = wastage / actual
- Closing stock = opening + inward - consumed; next month opens with this closing
- Auto limits: average +/- 3 sigma, sigma from the average moving range / 1.128

## Using real data
Upload / Download > Download template (.xlsx, sheets: Production, Part Weights, Stock, Rates), fill in plant data, upload.
Edits are kept in the viewer's browser. "Reset demo data" restores the sample.

Demo data is illustrative.
