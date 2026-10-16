import type { StitchFlowDatabase } from '../db'
import { batchEvidence, sourceOrders } from '../db/repositories/delivery'
import { getSettings } from '../settings'
import { compareSizes } from '../../renderer/lib/sort-size'

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  )
}
export function printDocument(
  db: StitchFlowDatabase,
  batchId: number,
  layout: string,
  draft = false
): string {
  const batch = db.batches.getById(batchId)
  if (!batch) throw new Error('Batch not found.')
  const settings = getSettings(db),
    evidence = batchEvidence(db, batchId)
  const items = db.productionItems.listByBatch(batchId).sort((a, b) => {
    if (layout === 'grouped')
      return (
        a.factorySku.localeCompare(b.factorySku) ||
        compareSizes(a.size, b.size) ||
        a.colour.localeCompare(b.colour)
      )
    if (settings.defaultSort === 'quantity') return b.quantity - a.quantity
    if (settings.defaultSort === 'sku')
      return a.factorySku.localeCompare(b.factorySku) || compareSizes(a.size, b.size)
    if (settings.defaultSort === 'colour')
      return a.colour.localeCompare(b.colour) || compareSizes(a.size, b.size)
    return (
      compareSizes(a.size, b.size) ||
      a.factorySku.localeCompare(b.factorySku) ||
      a.colour.localeCompare(b.colour)
    )
  })
  const date = new Date().toLocaleDateString(
    settings.dateFormat === 'iso' ? 'en-CA' : settings.dateFormat
  )
  let lastSku = ''
  const rows = items
    .map((item, index) => {
      const sources = sourceOrders(db, batchId, item.id)
      const product = [...new Set(sources.map((o) => o.productName).filter(Boolean))].join(', ')
      const group =
        layout === 'grouped' && item.factorySku !== lastSku
          ? `<tr class="group"><td colspan="6">${escapeHtml(item.factorySku)} · ${items.filter((i) => i.factorySku === item.factorySku).reduce((sum, i) => sum + i.quantity, 0)} units</td></tr>`
          : ''
      lastSku = item.factorySku
      return `${group}<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.factorySku)}</strong><small>${escapeHtml(product || (item.isManual ? 'Operator approved item' : ''))}</small></td><td>${escapeHtml(item.colour)}</td><td>${escapeHtml(item.size)}</td><td class="qty">${item.quantity}</td><td>${escapeHtml(item.sourcePlatforms || 'Manual')}${draft && (!item.isResolved || item.issueType) ? '<small>NEEDS REVIEW</small>' : ''}</td></tr>`
    })
    .join('')
  const accounts = [...new Set(evidence.orders.map((o) => `${o.platform}: ${o.sellerName}`))].join(
    ' / '
  )
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
    @page { size:A4; margin:14mm 12mm 16mm; } * { box-sizing:border-box } body { font:10pt Arial,sans-serif; color:#111; margin:0; background:white }
    h1 { font-size:24pt; margin:0 0 5mm } .eyebrow { font-size:9pt; letter-spacing:2px; margin-bottom:3mm } .meta { display:flex; justify-content:space-between; gap:6mm; margin:4mm 0; font-size:10pt }
    table { width:100%; border-collapse:collapse; table-layout:fixed; margin:5mm 0 } th,td { padding:2.6mm 2mm; border-bottom:1px solid #aaa; text-align:left; overflow-wrap:anywhere; vertical-align:top } th { border-top:2px solid #111; border-bottom:2px solid #111; font-size:9pt } thead { display:table-header-group } tr { break-inside:avoid; page-break-inside:avoid } small { display:block; font-size:8pt; margin-top:1mm } .qty { text-align:right; font-weight:bold; font-size:12pt } .group td { font-weight:bold; background:#eee; border-top:1px solid #111 } .total { text-align:right; font-size:16pt; font-weight:bold; break-inside:avoid } .refs { font-size:8pt; margin-top:6mm; line-height:1.5 } .warning { border:3px solid #111; padding:4mm; margin-bottom:5mm; font-weight:bold } .sign { margin-top:10mm; display:flex; justify-content:space-between; font-size:9pt; break-inside:avoid }
    th:first-child,td:first-child { white-space:nowrap; overflow-wrap:normal; font-size:9pt } .batch-reference td { font-size:8pt; font-weight:bold; border:0; padding:0 0 2mm }
    @media screen { body { padding:24px; max-width:850px; margin:auto } }
  </style></head><body>
  ${draft ? '<div class="warning">DRAFT PREVIEW · NOT RELEASED FOR PRODUCTION</div>' : ''}
  <div class="eyebrow">SLIPFLOW / PRODUCTION INSTRUCTIONS</div><h1>${escapeHtml(settings.factoryName)}</h1>
  <div class="meta"><div><strong>Batch ${escapeHtml(batch.batchNumber)}</strong><br>${escapeHtml(batch.name)}</div><div>Production date: ${escapeHtml(date)}<br>${items.length} lines · ${evidence.productionUnits} units</div></div>
  <table><colgroup><col style="width:7%"><col style="width:32%"><col style="width:18%"><col style="width:11%"><col style="width:10%"><col style="width:22%"></colgroup><thead><tr class="batch-reference"><td colspan="6">Batch ${escapeHtml(batch.batchNumber)} · ${escapeHtml(date)}</td></tr><tr><th>#</th><th>Factory SKU / product</th><th>Colour</th><th>Size</th><th class="qty">Qty</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="total">TOTAL ${evidence.productionUnits} UNITS</div><div class="refs"><strong>Accounts:</strong> ${escapeHtml(accounts || 'Manual production')}<br><strong>Source reconciliation:</strong> ${evidence.sourceUnits} source units; ${evidence.duplicateRows} duplicate rows excluded.<br>${batch.notes ? `<strong>Operator notes:</strong> ${escapeHtml(batch.notes)}` : ''}</div>
  <div class="sign"><span>Prepared by: ____________________</span><span>Checked by: ____________________</span></div></body></html>`
}
