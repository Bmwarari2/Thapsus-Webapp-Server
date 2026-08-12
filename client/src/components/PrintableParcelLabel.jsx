// PrintableParcelLabel.jsx
// Render-only component that produces a thermal-printer-friendly parcel
// label. Designed to be mounted inside a `print:block hidden` container
// so it never shows on screen but appears alone when the operator hits
// Cmd/Ctrl+P (or clicks the "Label" button on the order screen).
//
// Layout follows the standard shipping-label convention: one ruled
// outer box, a boxed TO: block that dominates the top half, a field
// grid of codes underneath, and the barcode across the bottom with its
// digits printed beneath the bars. Everything is pure black on white
// with hairline rules — thermal printers have no greys, and a design
// that leans on colour or shading prints as mud.
//
// Sizing assumes a standard 100mm × 150mm thermal label. The @page rule
// in the calling page sets paper size; this component only sets the
// inner layout. If a printer is configured for A4, the label still
// renders correctly — it just sits in the top-left of the page.

import React from 'react'
import Barcode from 'react-barcode'

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return '' }
}

/** One cell of the code grid: small caps caption over a bold value. */
const Field = ({ label, value, wide = false }) => (
  <div className={`field${wide ? ' field-wide' : ''}`}>
    <span className="field-label">{label}</span>
    <span className="field-value">{value || '—'}</span>
  </div>
)

export function PrintableParcelLabel({ parcel }) {
  if (!parcel) return null

  const trackingNumber = parcel.tracking_number || parcel.id || '—'
  const customerName   = parcel.name || parcel.user_name || parcel.consignee_name || ''
  const customerCode   = parcel.customer_code || ''
  const phone          = parcel.phone || parcel.recipient_phone || ''
  const address        = parcel.delivery_address_override || parcel.delivery_address || ''
  const description    = parcel.description || ''
  const origin         = parcel.market || parcel.origin_market || 'UK'
  const orderDate      = fmtDate(parcel.created_at)
  const quantity       = parcel.quantity || 1
  const weight         = parcel.weight_kg ? `${Number(parcel.weight_kg).toFixed(2)} kg` : ''

  return (
    <div className="parcel-label">
      <style>{`
        .parcel-label {
          width: 100mm;
          height: 150mm;
          padding: 3mm;
          font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
          color: #000;
          background: #fff;
          box-sizing: border-box;
        }
        .parcel-label * { box-sizing: border-box; }
        .parcel-label .sheet {
          height: 100%;
          border: 1pt solid #000;
          border-radius: 1.5mm;
          padding: 3mm;
          display: flex;
          flex-direction: column;
        }
        .parcel-label p, .parcel-label h1, .parcel-label h2 { margin: 0; line-height: 1.15; }

        /* Masthead — company name left, origin/route right. */
        .parcel-label .masthead {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding-bottom: 2mm;
        }
        .parcel-label .company {
          font-size: 11pt;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .parcel-label .tagline {
          font-size: 6.5pt;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          margin-top: 0.6mm;
        }
        .parcel-label .route {
          font-size: 7pt;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-align: right;
          border: 0.75pt solid #000;
          padding: 1mm 1.5mm;
        }

        /* TO: block — the part a rider reads from a metre away. */
        .parcel-label .to-box {
          border: 1pt solid #000;
          padding: 2mm 2.5mm 2.5mm;
          margin-bottom: 2.5mm;
        }
        .parcel-label .to-tag {
          font-size: 7pt;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .parcel-label .to-name {
          font-size: 14pt;
          font-weight: 800;
          margin-top: 1mm;
          line-height: 1.1;
        }
        .parcel-label .to-address {
          font-size: 10pt;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 1mm;
          white-space: pre-wrap;
        }
        .parcel-label .to-phone {
          font-size: 10.5pt;
          font-weight: 800;
          margin-top: 1.5mm;
          font-variant-numeric: tabular-nums;
        }

        /* Ruled single-value rows (item, customer). */
        .parcel-label .rule-row {
          border-bottom: 0.75pt solid #000;
          padding-bottom: 1.2mm;
          margin-bottom: 2mm;
        }
        .parcel-label .rule-label {
          font-size: 6.5pt;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .parcel-label .rule-value {
          display: block;
          font-size: 9.5pt;
          font-weight: 700;
          margin-top: 0.8mm;
          max-height: 9mm;
          overflow: hidden;
        }

        /* Code grid — two columns of boxed fields. */
        .parcel-label .grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          border: 0.75pt solid #000;
          border-bottom: none;
        }
        .parcel-label .field {
          border-bottom: 0.75pt solid #000;
          border-right: 0.75pt solid #000;
          padding: 1.2mm 1.5mm;
          min-height: 8mm;
        }
        .parcel-label .field:nth-child(2n) { border-right: none; }
        .parcel-label .field-wide { grid-column: 1 / -1; border-right: none; }
        .parcel-label .field-label {
          display: block;
          font-size: 6pt;
          font-weight: 800;
          letter-spacing: 0.09em;
          text-transform: uppercase;
        }
        .parcel-label .field-value {
          display: block;
          font-size: 9.5pt;
          font-weight: 800;
          margin-top: 0.6mm;
          font-variant-numeric: tabular-nums;
          word-break: break-word;
        }

        /* Barcode sits on the baseline of the label. */
        .parcel-label .barcode {
          margin-top: auto;
          padding-top: 2.5mm;
          display: flex;
          justify-content: center;
        }

        /* Printing. Without this the browser prints the whole dashboard
           — dark background, nav and all — with the label modal floating
           in the middle. Hide everything, lift the label to the top-left
           of a 100×150mm page, and let it be the only thing on paper. */
        @media print {
          @page { size: 100mm 150mm; margin: 0; }
          body * { visibility: hidden !important; }
          .parcel-label, .parcel-label * { visibility: visible !important; }
          .parcel-label {
            position: fixed !important;
            left: 0; top: 0;
            margin: 0;
            box-shadow: none;
          }
        }
      `}</style>

      <div className="sheet">
        <div className="masthead">
          <div>
            <h1 className="company">Thapsus Cargo</h1>
            <p className="tagline">Shop the world, delivered to Kenya</p>
          </div>
          <p className="route">{origin} &rarr; KE</p>
        </div>

        <div className="to-box">
          <span className="to-tag">To:</span>
          <h2 className="to-name">{customerName || '—'}</h2>
          {address && <p className="to-address">{address}</p>}
          {phone && <p className="to-phone">{phone}</p>}
        </div>

        <div className="rule-row">
          <span className="rule-label">Item name:</span>
          <span className="rule-value">{description || '—'}</span>
        </div>

        <div className="rule-row">
          <span className="rule-label">Customer:</span>
          <span className="rule-value">
            {customerName || '—'}{customerCode ? ` — ${customerCode}` : ''}
          </span>
        </div>

        <div className="grid">
          <Field label="Tracking nr" value={trackingNumber} />
          <Field label="Customer code" value={customerCode} />
          <Field label="Origin" value={origin} />
          <Field label="Quantity" value={quantity} />
          <Field label="Order date" value={orderDate} />
          <Field label="Weight" value={weight} />
        </div>

        <div className="barcode">
          {/* Code128 with the digits printed under the bars — a scanner
              failure at the door should still leave something readable. */}
          <Barcode
            value={String(trackingNumber)}
            format="CODE128"
            width={1.9}
            height={54}
            fontSize={14}
            textMargin={3}
            displayValue
            margin={0}
            background="#ffffff"
            lineColor="#000000"
          />
        </div>
      </div>
    </div>
  )
}
