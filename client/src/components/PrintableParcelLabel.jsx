// PrintableParcelLabel.jsx
// Render-only component that produces a thermal-printer-friendly parcel
// label. Designed to be mounted inside a `print:block hidden` container
// so it never shows on screen but appears alone when the operator hits
// Cmd/Ctrl+P (or clicks the "Print label" button on OpsConsole).
//
// Sizing assumes a standard 100mm × 150mm thermal label. The @page rule
// in the calling page sets paper size; this component only sets the
// inner layout. If a printer is configured for A4, the label will still
// render correctly — it just sits in the top-left of the page.

import React from 'react'
import Barcode from 'react-barcode'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })
  } catch { return '' }
}

export function PrintableParcelLabel({ parcel }) {
  if (!parcel) return null

  const trackingNumber = parcel.tracking_number || parcel.id || '—'
  const customerName   = parcel.name || parcel.consignee_name || '—'
  const phone          = parcel.phone || parcel.recipient_phone || ''
  const address        = parcel.delivery_address_override || parcel.delivery_address || ''
  const market         = parcel.market || parcel.origin_market || ''
  const warehouseId    = parcel.warehouse_id || ''
  const description    = parcel.description || ''
  const printedAt      = new Date().toISOString()

  return (
    <div className="parcel-label">
      <style>{`
        .parcel-label {
          /* Visual sizing for screen preview if it ever leaks; the
             real print dialog uses @page sizing from OpsConsole. */
          width: 100mm;
          min-height: 150mm;
          padding: 4mm;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #0f172a;
          background: white;
          display: flex;
          flex-direction: column;
          gap: 3mm;
          box-sizing: border-box;
        }
        .parcel-label h1, .parcel-label h2, .parcel-label p {
          margin: 0;
          padding: 0;
          line-height: 1.1;
        }
        .parcel-label .brand {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 9pt;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border-bottom: 1.5pt solid #0f172a;
          padding-bottom: 1.5mm;
        }
        .parcel-label .market {
          font-size: 8pt;
          font-weight: 700;
          color: #475569;
        }
        .parcel-label .tracking {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 16pt;
          font-weight: 800;
          letter-spacing: 0.04em;
          word-break: break-all;
        }
        .parcel-label .barcode-wrap {
          display: flex;
          justify-content: center;
          padding: 1mm 0;
        }
        .parcel-label .label {
          font-size: 7pt;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #64748b;
          margin-bottom: 0.5mm;
        }
        .parcel-label .name {
          font-size: 13pt;
          font-weight: 800;
        }
        .parcel-label .address {
          font-size: 10pt;
          font-weight: 600;
          line-height: 1.25;
          white-space: pre-wrap;
        }
        .parcel-label .description {
          font-size: 8pt;
          font-weight: 500;
          color: #475569;
          line-height: 1.3;
          /* Cap description height so a long description can't push
             the rest of the label off the paper. */
          max-height: 18mm;
          overflow: hidden;
        }
        .parcel-label .footer {
          margin-top: auto;
          font-size: 7pt;
          color: #94a3b8;
          display: flex;
          justify-content: space-between;
          border-top: 0.5pt solid #cbd5e1;
          padding-top: 1.5mm;
        }
      `}</style>

      <div className="brand">
        <span>Thapsus Cargo</span>
        <span className="market">{market || warehouseId || ''}</span>
      </div>

      <div>
        <p className="label">Tracking</p>
        <h1 className="tracking">{trackingNumber}</h1>
      </div>

      <div className="barcode-wrap">
        {/* Code128 default — fits ~20 alphanumerics in 100mm. We hide
            the human-readable text under the bars because the big
            tracking-number text above already serves that role. */}
        <Barcode
          value={String(trackingNumber)}
          format="CODE128"
          width={1.6}
          height={50}
          displayValue={false}
          margin={0}
          background="#ffffff"
          lineColor="#000000"
        />
      </div>

      <div>
        <p className="label">Deliver to</p>
        <h2 className="name">{customerName}</h2>
        {phone && <p className="address" style={{ marginTop: '1mm' }}>{phone}</p>}
        {address && <p className="address" style={{ marginTop: '1mm' }}>{address}</p>}
      </div>

      {description && (
        <div>
          <p className="label">Contents</p>
          <p className="description">{description}</p>
        </div>
      )}

      <div className="footer">
        <span>Printed {fmtDate(printedAt)}</span>
        {warehouseId && <span>{warehouseId}</span>}
      </div>
    </div>
  )
}
