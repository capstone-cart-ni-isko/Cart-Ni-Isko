/**
 * Styled Excel (.xlsx) exports for the admin reports.
 *
 * Plain CSV cannot carry formatting, so every admin export now builds a real
 * workbook: a merged brand-coloured title row, a "generated" line, an
 * optional summary block, and one table per section with a filled, bold
 * header row, borders, zebra rows, frozen header, peso number formats and
 * sized columns. exceljs is loaded on demand so it never weighs on the
 * storefront bundle.
 */

const BRAND = 'FFFF6A00' // Tindahan ni Isko orange
const HEADER_FILL = 'FFFFE8D6'
const ZEBRA_FILL = 'FFFAFAFA'
const BORDER = { style: 'thin', color: { argb: 'FFE2E8F0' } }
const PESO_FORMAT = '"₱"#,##0.00'
const MONEY_HINT = /(revenue|price|amount|total|value|php|₱|sales \(|gross|fee)/i

const allBorders = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER }

/**
 * @param {object} report
 * @param {string} report.title      e.g. "Sales Report"
 * @param {string} [report.subtitle] e.g. "Last 30 days"
 * @param {Array<[string, any]>} [report.summary] key/value rows
 * @param {Array<{title?: string, columns: string[], rows: any[][]}>} report.sections
 * @param {string} [report.sheetName]
 * @returns {Promise<Blob>}
 */
export async function buildXlsx({ title, subtitle = '', summary = [], sections = [], sheetName = 'Report' }) {
  const { default: ExcelJS } = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Tindahan ni Isko'
  workbook.created = new Date()

  const width = Math.max(2, ...sections.map((s) => s.columns.length))
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 0 }],
    pageSetup: { orientation: width > 5 ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1 },
  })

  // ── Title + generated line ──
  const titleRow = sheet.addRow([title])
  sheet.mergeCells(titleRow.number, 1, titleRow.number, width)
  titleRow.height = 28
  titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } }
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } }
  titleRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }

  const stamp = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
  const metaRow = sheet.addRow([`Tindahan ni Isko · ${subtitle ? `${subtitle} · ` : ''}Generated ${stamp}`])
  sheet.mergeCells(metaRow.number, 1, metaRow.number, width)
  metaRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  sheet.addRow([])

  const widths = Array.from({ length: width }, () => 10)
  const track = (index, value) => {
    const len = String(value ?? '').length + 2
    widths[index] = Math.min(60, Math.max(widths[index], len))
  }

  // ── Summary block ──
  if (summary.length > 0) {
    const head = sheet.addRow(['Summary'])
    head.getCell(1).font = { bold: true, size: 12, color: { argb: BRAND } }
    summary.forEach(([label, value]) => {
      const row = sheet.addRow([label, value])
      row.getCell(1).font = { bold: true }
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      ;[1, 2].forEach((c) => (row.getCell(c).border = allBorders))
      if (typeof value === 'number' && MONEY_HINT.test(String(label))) row.getCell(2).numFmt = PESO_FORMAT
      track(0, label)
      track(1, value)
    })
    sheet.addRow([])
  }

  // ── Sections ──
  sections.forEach((section) => {
    if (section.title) {
      const head = sheet.addRow([section.title])
      head.getCell(1).font = { bold: true, size: 12, color: { argb: BRAND } }
    }
    const headerRow = sheet.addRow(section.columns)
    headerRow.height = 20
    headerRow.eachCell((cell, col) => {
      cell.font = { bold: true, color: { argb: 'FF7C2D12' } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { ...allBorders, bottom: { style: 'medium', color: { argb: BRAND } } }
      track(col - 1, cell.value)
    })
    // The first table's header stays visible while scrolling.
    if (sheet.views[0].ySplit === 0) sheet.views = [{ state: 'frozen', ySplit: headerRow.number }]

    const money = section.columns.map((label) => MONEY_HINT.test(String(label)))
    section.rows.forEach((values, i) => {
      const row = sheet.addRow(values.map((v) => (v === undefined || v === null ? '' : v)))
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > section.columns.length) return
        cell.border = allBorders
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } }
        const numeric = typeof cell.value === 'number' || (typeof cell.value === 'string' && /^-?\d+(\.\d+)?$/.test(cell.value))
        if (money[col - 1] && numeric) {
          cell.value = Number(cell.value)
          cell.numFmt = PESO_FORMAT
        }
        track(col - 1, cell.value)
      })
    })
    if (section.rows.length === 0) {
      const empty = sheet.addRow(['No records'])
      empty.getCell(1).font = { italic: true, color: { argb: 'FF94A3B8' } }
    }
    sheet.addRow([])
  })

  sheet.columns.forEach((column, i) => {
    column.width = widths[i] ?? 12
  })

  const buffer = await workbook.xlsx.writeBuffer()
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Build and download in one step. */
export async function downloadXlsx(filename, report) {
  const blob = await buildXlsx(report)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
