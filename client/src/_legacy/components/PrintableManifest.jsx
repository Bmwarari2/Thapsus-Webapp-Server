// PrintableManifest.jsx
//
// Print-friendly consolidation manifest. Companion to
// PrintableParcelLabel — same hidden-container + window.print()
// pattern, but laid out for a multi-row table on A4 portrait
// rather than a 100×150mm thermal label.
//
// Used by OpsConsolidations.jsx's detail page; the existing
// "Generate manifest" button keeps producing the JSON blob for
// machine consumers, this one renders the human-readable sheet
// the cargo agent actually carries.

import React from 'react'

function fmtDate(iso, opts = { dateStyle: 'medium' }) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('en-GB', opts)
  } catch { return '—' }
}

function fmtKg(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v.toFixed(1) : '—'
}

export function PrintableManifest({ consolidation, parcels = [] }) {
  if (!consolidation) return null
  const c = consolidation
  const printedAt = new Date().toISOString()
  const totalKg = parcels.reduce((acc, p) => {
    const v = Number(p.chargeable_kg ?? p.weight_kg ?? 0)
    return acc + (Number.isFinite(v) ? v : 0)
  }, 0)

  return (
    <div className="manifest-sheet">
      <style>{`
        .manifest-sheet {
          width: 210mm;
          min-height: 297mm;
          padding: 12mm 12mm 14mm;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #0f172a;
          background: white;
          box-sizing: border-box;
        }
        .manifest-sheet .brand-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          border-bottom: 1.5pt solid #0f172a;
          padding-bottom: 3mm;
          margin-bottom: 5mm;
        }
        .manifest-sheet .brand {
          font-size: 13pt;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .manifest-sheet .doc-tag {
          font-size: 9pt;
          font-weight: 700;
          color: #475569;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .manifest-sheet h1 {
          font-size: 18pt;
          font-weight: 800;
          margin: 0 0 1.5mm 0;
        }
        .manifest-sheet .subtitle {
          font-size: 10pt;
          color: #475569;
          margin: 0 0 4mm 0;
        }
        .manifest-sheet .meta-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 3mm;
          margin-bottom: 5mm;
          font-size: 9pt;
        }
        .manifest-sheet .meta-cell {
          padding: 2mm 2.5mm;
          border: 0.5pt solid #cbd5e1;
          border-radius: 1.5mm;
        }
        .manifest-sheet .meta-label {
          font-size: 7pt;
          font-weight: 800;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: block;
          margin-bottom: 0.5mm;
        }
        .manifest-sheet .meta-value {
          font-size: 11pt;
          font-weight: 700;
        }
        .manifest-sheet table {
          width: 100%;
          border-collapse: collapse;
          font-size: 8.5pt;
          page-break-inside: auto;
        }
        .manifest-sheet thead {
          background: #f1f5f9;
          display: table-header-group; /* repeat header on each printed page */
        }
        .manifest-sheet th {
          text-align: left;
          font-size: 7pt;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #475569;
          padding: 2mm 2mm;
          border-bottom: 1pt solid #94a3b8;
        }
        .manifest-sheet td {
          padding: 2mm 2mm;
          border-bottom: 0.25pt solid #e2e8f0;
          vertical-align: top;
        }
        .manifest-sheet tr {
          page-break-inside: avoid;
        }
        .manifest-sheet .mono {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 8pt;
        }
        .manifest-sheet .num {
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .manifest-sheet .totals {
          margin-top: 4mm;
          display: flex;
          justify-content: flex-end;
          gap: 8mm;
          font-size: 10pt;
          font-weight: 700;
        }
        .manifest-sheet .totals .label {
          color: #64748b;
          font-weight: 600;
          margin-right: 1mm;
        }
        .manifest-sheet .footer {
          margin-top: 8mm;
          font-size: 7pt;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
          border-top: 0.5pt solid #cbd5e1;
          padding-top: 2mm;
        }
        .manifest-sheet .signature-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12mm;
          margin-top: 12mm;
          font-size: 9pt;
        }
        .manifest-sheet .sig-block {
          border-top: 0.75pt solid #0f172a;
          padding-top: 2mm;
        }
        .manifest-sheet .sig-label {
          font-weight: 700;
        }
      `}</style>

      <div className="brand-row">
        <span className="brand">Thapsus Cargo</span>
        <span className="doc-tag">Consolidation manifest</span>
      </div>

      <h1>Consolidation {c.id}</h1>
      <p className="subtitle">
        Week of {c.week_start ? fmtDate(c.week_start) : '—'}
        {' '}·{' '}
        Status: {c.status || '—'}
      </p>

      <div className="meta-grid">
        <div className="meta-cell">
          <span className="meta-label">Master AWB</span>
          <span className="meta-value mono">{c.master_awb_no || '—'}</span>
        </div>
        <div className="meta-cell">
          <span className="meta-label">Tudor invoice</span>
          <span className="meta-value mono">{c.tudor_invoice_no || '—'}</span>
        </div>
        <div className="meta-cell">
          <span className="meta-label">Cut-off</span>
          <span className="meta-value">{fmtDate(c.cutoff_at, { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
        <div className="meta-cell">
          <span className="meta-label">Departure</span>
          <span className="meta-value">{fmtDate(c.departure_at, { dateStyle: 'short', timeStyle: 'short' })}</span>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '8%' }}>#</th>
            <th style={{ width: '22%' }}>Tracking</th>
            <th style={{ width: '28%' }}>Consignee</th>
            <th style={{ width: '18%' }}>Description</th>
            <th style={{ width: '12%' }} className="num">Weight (kg)</th>
            <th style={{ width: '12%' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {parcels.length === 0 ? (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: '6mm 0', color: '#94a3b8' }}>
                No parcels booked on this consolidation.
              </td>
            </tr>
          ) : (
            parcels.map((p, idx) => (
              <tr key={p.id}>
                <td className="num">{idx + 1}</td>
                <td className="mono">{p.tracking_number || p.id || '—'}</td>
                <td>
                  {p.consignee_name || p.name || '—'}
                  {p.email && (
                    <div style={{ fontSize: '7.5pt', color: '#64748b' }}>{p.email}</div>
                  )}
                </td>
                <td style={{ fontSize: '8pt' }}>{p.description || '—'}</td>
                <td className="num">{fmtKg(p.chargeable_kg ?? p.weight_kg)}</td>
                <td>{p.status || '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <div className="totals">
        <span><span className="label">Parcels:</span>{parcels.length}</span>
        <span><span className="label">Total weight:</span>{fmtKg(totalKg)} kg</span>
      </div>

      <div className="signature-grid">
        <div className="sig-block">
          <span className="sig-label">Released by</span>
          <div style={{ marginTop: '2mm', color: '#64748b' }}>Operator name + signature + date</div>
        </div>
        <div className="sig-block">
          <span className="sig-label">Received by</span>
          <div style={{ marginTop: '2mm', color: '#64748b' }}>Carrier / agent name + signature + date</div>
        </div>
      </div>

      <div className="footer">
        <span>Printed {fmtDate(printedAt, { dateStyle: 'short', timeStyle: 'short' })}</span>
        <span>Thapsus Cargo · UK → Nairobi</span>
      </div>
    </div>
  )
}
