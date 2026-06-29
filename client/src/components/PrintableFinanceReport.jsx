// PrintableFinanceReport.jsx
//
// Print-to-PDF financial report. Same hidden-container + window.print()
// pattern as PrintableManifest / PrintableParcelLabel — the browser's
// "Save as PDF" turns this into the downloadable PDF, so we avoid adding a
// server-side PDF dependency.
//
// Rendered (hidden on screen) by AdminFinance.jsx; the "Print / PDF" button
// flips a flag and calls window.print(). The @media print block hides the app
// and shows only .finance-report-sheet.

import React from 'react'

function money(minor, currency) {
  return `${currency} ${(Number(minor) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function PrintableFinanceReport({ pnl, tax, currency = 'GBP', from, to, businessName = 'Thapsus Cargo' }) {
  if (!pnl) return null
  return (
    <div className="finance-report-sheet">
      <style>{`
        .finance-report-sheet { display: none; }
        @media print {
          body * { visibility: hidden; }
          .finance-report-sheet, .finance-report-sheet * { visibility: visible; }
          .finance-report-sheet {
            display: block; position: absolute; top: 0; left: 0;
            width: 210mm; padding: 16mm; font-family: ui-sans-serif, system-ui, sans-serif;
            color: #0f172a;
          }
        }
        .finance-report-sheet h1 { font-size: 20px; margin: 0 0 2px; }
        .finance-report-sheet h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
        .finance-report-sheet table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .finance-report-sheet td, .finance-report-sheet th { padding: 4px 6px; text-align: left; }
        .finance-report-sheet td.num, .finance-report-sheet th.num { text-align: right; font-variant-numeric: tabular-nums; }
        .finance-report-sheet tr.total td { border-top: 1px solid #cbd5e1; font-weight: 700; }
        .finance-report-sheet .muted { color: #64748b; font-size: 11px; }
      `}</style>

      <h1>{businessName} — Financial Report</h1>
      <div className="muted">
        Profit &amp; Loss · {from} → {to} · reporting currency {currency} · generated {new Date().toLocaleString('en-GB')}
      </div>

      <h2>Income</h2>
      <table>
        <tbody>
          {(pnl.income || []).map((c) => (
            <tr key={c.id || c.name}><td>{c.name || 'Uncategorised'}</td><td className="num">{money(c.total_minor, currency)}</td></tr>
          ))}
          <tr className="total"><td>Total income</td><td className="num">{money(pnl.income_minor, currency)}</td></tr>
        </tbody>
      </table>

      <h2>Expenses</h2>
      <table>
        <tbody>
          {(pnl.expense || []).map((c) => (
            <tr key={c.id || c.name}><td>{c.name || 'Uncategorised'}</td><td className="num">{money(c.total_minor, currency)}</td></tr>
          ))}
          <tr className="total"><td>Total expenses</td><td className="num">{money(pnl.expense_minor, currency)}</td></tr>
        </tbody>
      </table>

      <h2>Net profit / loss</h2>
      <table>
        <tbody>
          <tr className="total">
            <td>Net {pnl.net_minor >= 0 ? 'profit' : 'loss'}</td>
            <td className="num">{money(pnl.net_minor, currency)}</td>
          </tr>
        </tbody>
      </table>

      {tax && tax.lines && tax.lines.length > 0 && (
        <>
          <h2>Tax summary</h2>
          <table>
            <thead>
              <tr><th>Jurisdiction</th><th>Tax code</th><th className="num">Collected</th><th className="num">Reclaimable</th><th className="num">Net due</th></tr>
            </thead>
            <tbody>
              {tax.lines.map((l) => (
                <tr key={l.tax_code}>
                  <td>{l.jurisdiction}</td><td>{l.name}</td>
                  <td className="num">{money(l.collected_minor, currency)}</td>
                  <td className="num">{money(l.reclaimable_minor, currency)}</td>
                  <td className="num">{money(l.net_minor, currency)}</td>
                </tr>
              ))}
              <tr className="total"><td colSpan={4}>Net tax due</td><td className="num">{money(tax.net_minor, currency)}</td></tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

export default PrintableFinanceReport
