import { useState, useEffect, useCallback } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import LoadingSpinner from '../../components/ui/LoadingSpinner.jsx'
import Button from '../../components/ui/Button.jsx'
import { DownloadIcon, FileTextIcon, CalendarIcon, UsersIcon, PackageIcon, SaveIcon } from '../../components/ui/Icons.jsx'
import { apiPost, apiGet } from '../../services/api.js'
import { empCateg, empIsActive, first, fmtDateTime, productStock, toNumber } from '../../components/admin/schema.js'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'

/*
 * Reports are generated on the fly — the `reports` table is gone, so
 * filter templates live in localStorage instead of the API.
 */
const TEMPLATE_KEY = 'cni_admin_report_templates'

/** Older templates stored the legacy filter vocabularies. */
const LEGACY_APPOINT_TYPE = { CLAIM: 'pickup', VISIT: 'visit' }
const LEGACY_STATUS = { OPEN: 'upcoming', CLOSED: 'done' }

const readTemplates = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const writeTemplates = (templates) => {
  try {
    localStorage.setItem(TEMPLATE_KEY, JSON.stringify(templates))
  } catch (e) {
    console.warn('Failed to persist report templates:', e)
  }
}

/** The generated report row may use the new or legacy column names. */
const reportDate = (row) => first(row, 'appoint_start', 'appoint_date')
const reportStatus = (row) => String(first(row, 'appoint_status', 'status') || '').toUpperCase()
const reportEmpType = (row) => String(first(row, 'emp_categ', 'emp_type') || '').toUpperCase()
const reportAvailability = (row) =>
  String(first(row, 'availability') || (first(row, 'emp_present', 'emp_instore') ? 'In-Store' : 'Available'))

const REPORT_TYPES = [
  { id: 'sales', label: 'Sales Report', icon: PackageIcon, desc: 'Revenue, transactions, top products by date' },
  { id: 'inventory', label: 'Inventory Report', icon: PackageIcon, desc: 'Stock levels, value, low-stock alerts' },
  { id: 'appointments', label: 'Appointments Report', icon: CalendarIcon, desc: 'Bookings by type, status, capacity utilization' },
  { id: 'staffing', label: 'Staffing Report', icon: UsersIcon, desc: 'Employee availability, hours, shift coverage' },
]

/** Human-readable value for a generated report summary cell. */
const summaryDisplay = (value) => {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'object') {
    if ('from' in value || 'to' in value) return `${value.from ?? 'All time'} – ${value.to ?? 'All time'}`
    return JSON.stringify(value)
  }
  return String(value)
}

function AdminReports() {
  useAdmin()
  const { showToast } = useToast()

  const [reportType, setReportType] = useState('sales')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [prodId, setProdId] = useState('')
  const [empId, setEmpId] = useState('')
  const [appointType, setAppointType] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [empTypeFilter, setEmpTypeFilter] = useState('')
  const [products, setProducts] = useState([])
  const [employees, setEmployees] = useState([])
  const [savedReports, setSavedReports] = useState([])
  const [generatedData, setGeneratedData] = useState(null)
  // The filter grid is conditional and can reach seven controls, which put
  // the whole block between the report type and Generate for every page load.
  // Collapsed by default; the header carries the active count so a hidden
  // filter is never invisible.
  const [showFilters, setShowFilters] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoadingReports, setIsLoadingReports] = useState(true)
  const [, setIsLoadingOptions] = useState(true)
  const [templateName, setTemplateName] = useState('')
  const [showSaveModal, setShowSaveModal] = useState(false)

  // Load saved report templates (localStorage — reports are never persisted
  // server-side). Both loaders are inlined into their effect: they used to be
  // called through callbacks declared further down, which the hooks rule
  // flags as reading a binding before it exists.
  useEffect(() => {
    setSavedReports(readTemplates())
    setIsLoadingReports(false)
  }, [])

  // Load filter options (products, employees)
  useEffect(() => {
    Promise.all([apiGet('/products/filter'), apiGet('/accounts/display')])
      .then(([prodData, empData]) => {
        if (prodData.success) setProducts(prodData.data?.products || prodData.data || [])
        if (empData.success) {
          setEmployees(
            (empData.data?.employees || empData.data || []).filter((employee) => empIsActive(employee))
          )
        }
      })
      .catch((e) => console.warn('Failed to load filter options:', e))
      .finally(() => setIsLoadingOptions(false))
  }, [])

  const handleLoadTemplate = useCallback((report) => {
    try {
      const meta = JSON.parse(report.report_text || '{}')
      if (meta.type) setReportType(meta.type)
      if (meta.filters) {
        if (meta.filters.date_from) setDateFrom(meta.filters.date_from)
        if (meta.filters.date_to) setDateTo(meta.filters.date_to)
        if (meta.filters.prod_id) setProdId(String(meta.filters.prod_id))
        if (meta.filters.emp_id) setEmpId(String(meta.filters.emp_id))
        if (meta.filters.appoint_type) setAppointType(LEGACY_APPOINT_TYPE[meta.filters.appoint_type] || meta.filters.appoint_type)
        if (meta.filters.status || meta.filters.appoint_status) {
          const rawStatus = meta.filters.status || meta.filters.appoint_status
          setStatusFilter(LEGACY_STATUS[rawStatus] || rawStatus)
        }
        if (meta.filters.emp_categ || meta.filters.emp_type) setEmpTypeFilter(String(meta.filters.emp_categ || meta.filters.emp_type).toLowerCase())
      }
      setGeneratedData(null)
      showToast(`Loaded template: ${report.report_title}`, 'success')
    } catch {
      showToast('Failed to load template', 'error')
    }
  }, [showToast])

  const buildFilters = () => {
    const filters = {}
    if (dateFrom) filters.date_from = dateFrom
    if (dateTo) filters.date_to = dateTo
    if (prodId) filters.prod_id = Number(prodId)
    if (empId) filters.emp_id = Number(empId)
    if (appointType) filters.appoint_type = appointType
    if (statusFilter) {
      filters.status = statusFilter
      filters.appoint_status = statusFilter
    }
    if (empTypeFilter) {
      filters.emp_categ = empTypeFilter
      filters.emp_type = String(empTypeFilter).toUpperCase()
    }
    return filters
  }

  const handleGenerate = async () => {
    if (isGenerating) return
    setIsGenerating(true)
    try {
      const res = await apiPost('/reports', {
        report_type: reportType,
        filters: buildFilters(),
        save_template: false,
      })

      if (res.success) {
        setGeneratedData(res.data.report_data)
        showToast('Report generated successfully', 'success')
      } else {
        showToast(res.message || 'Failed to generate report', 'error')
      }
    } catch (e) {
      showToast(e.message || 'Failed to generate report', 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleSaveTemplate = () => {
    if (!templateName.trim()) return
    try {
      const templates = readTemplates()
      templates.unshift({
        report_id: `local-${Date.now()}`,
        report_title: templateName.trim(),
        report_created: new Date().toISOString(),
        report_text: JSON.stringify({
          type: reportType,
          filters: buildFilters(),
        }),
      })
      writeTemplates(templates)
      setSavedReports(templates)
      showToast('Report template saved', 'success')
      setTemplateName('')
      setShowSaveModal(false)
    } catch (e) {
      showToast(e.message || 'Failed to save template', 'error')
    }
  }

  const handleExportCSV = () => {
    if (!generatedData) return
    let csvContent = ''
    let filename = ''

    switch (reportType) {
      case 'sales':
        csvContent = generateSalesCSV(generatedData)
        filename = `sales-report-${new Date().toISOString().split('T')[0]}.csv`
        break
      case 'inventory':
        csvContent = generateInventoryCSV(generatedData)
        filename = `inventory-report-${new Date().toISOString().split('T')[0]}.csv`
        break
      case 'appointments':
        csvContent = generateAppointmentsCSV(generatedData)
        filename = `appointments-report-${new Date().toISOString().split('T')[0]}.csv`
        break
      case 'staffing':
        csvContent = generateStaffingCSV(generatedData)
        filename = `staffing-report-${new Date().toISOString().split('T')[0]}.csv`
        break
    }

    downloadFile(csvContent, filename, 'text/csv')
    showToast('CSV exported', 'success')
  }

  const handleExportPDF = () => {
    if (!generatedData) return
    try {
      const doc = new jsPDF()
      const title = REPORT_TYPES.find(t => t.id === reportType)?.label || 'Report'
      
      doc.setFontSize(18)
      doc.text(title, 14, 22)
      doc.setFontSize(10)
      doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)
      
      // Summary
      let y = 36
      doc.setFontSize(12)
      doc.text('Summary', 14, y)
      y += 6
      doc.setFontSize(9)
      Object.entries(generatedData.summary || {}).forEach(([k, v]) => {
        doc.text(`${k.replace(/_/g, ' ')}: ${summaryDisplay(v)}`, 14, y)
        y += 5
      })
      y += 4
      
      // Tables based on report type
      switch (reportType) {
        case 'sales':
          if (generatedData.by_date?.length) {
            doc.text('By Date', 14, y)
            y += 6
            doc.autoTable({
              startY: y,
              head: [['Date', 'Transactions', 'Revenue']],
              body: generatedData.by_date.map(d => [d.date, d.transactions, `₱${toNumber(d.revenue).toLocaleString()}`]),
              theme: 'striped',
              headStyles: { fillColor: [249, 115, 22] },
            })
            y = doc.lastAutoTable.finalY + 10
          }
          if (generatedData.by_product?.length) {
            doc.text('By Product', 14, y)
            y += 6
            doc.autoTable({
              startY: y,
              head: [['Product', 'Qty Sold', 'Revenue', 'Orders']],
              body: generatedData.by_product.slice(0, 30).map(p => [p.prod_name, p.total_qty, `₱${toNumber(p.total_revenue).toLocaleString()}`, p.orders_count]),
              theme: 'striped',
              headStyles: { fillColor: [249, 115, 22] },
            })
          }
          break
        case 'inventory':
          if (generatedData.items?.length) {
            doc.text('Items', 14, y)
            y += 6
            doc.autoTable({
              startY: y,
              head: [['Name', 'Category', 'Price', 'Qty', 'Stock Value', 'Low Stock']],
              body: generatedData.items.slice(0, 50).map(i => [i.prod_name, i.prod_categ, `₱${i.prod_price}`, productStock(i), `₱${toNumber(i.stock_value).toLocaleString()}`, i.is_low_stock ? 'Yes' : 'No']),
              theme: 'striped',
              headStyles: { fillColor: [249, 115, 22] },
            })
          }
          break
        case 'appointments':
          if (generatedData.items?.length) {
            doc.text('Appointments', 14, y)
            y += 6
            doc.autoTable({
              startY: y,
              head: [['ID', 'Type', 'Date', 'Status', 'Customer']],
              body: generatedData.items.slice(0, 50).map(a => [a.appoint_id, a.appoint_type, fmtDateTime(reportDate(a)), reportStatus(a), a.customer]),
              theme: 'striped',
              headStyles: { fillColor: [249, 115, 22] },
            })
          }
          break
        case 'staffing':
          if (generatedData.staff?.length) {
            doc.text('Staff', 14, y)
            y += 6
            doc.autoTable({
              startY: y,
              head: [['Name', 'Type', 'Email', 'In-Store', 'Shifts', 'Hours']],
              body: generatedData.staff.map(s => [s.name, reportEmpType(s), s.emp_email, reportAvailability(s), `${s.total_shifts} (${s.upcoming_shifts} upcoming)`, `${s.total_hours}h`]),
              theme: 'striped',
              headStyles: { fillColor: [249, 115, 22] },
            })
          }
          break
      }
      
      const filename = `${reportType}-report-${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(filename)
      showToast('PDF exported', 'success')
    } catch (e) {
      console.error('PDF export failed:', e)
      showToast('PDF export failed', 'error')
    }
  }

  const generateSalesCSV = (data) => {
    const rows = []
    // Summary
    rows.push(['Sales Report Summary'])
    Object.entries(data.summary || {}).forEach(([k, v]) => rows.push([k, summaryDisplay(v)]))
    rows.push([])
    // By Date
    rows.push(['By Date'])
    rows.push(['Date', 'Transactions', 'Revenue'])
    data.by_date?.forEach(d => rows.push([d.date, d.transactions, d.revenue]))
    rows.push([])
    // By Product
    rows.push(['By Product'])
    rows.push(['Product', 'Total Qty', 'Total Revenue', 'Orders Count'])
    data.by_product?.forEach(p => rows.push([p.prod_name, p.total_qty, p.total_revenue, p.orders_count]))
    rows.push([])
    // By Staff
    rows.push(['By Staff/Customer'])
    rows.push(['Customer', 'Orders', 'Total Revenue'])
    data.by_staff?.forEach(s => rows.push([s.customer, s.orders_count, s.total_revenue]))

    return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  }

  const generateInventoryCSV = (data) => {
    const rows = [['Inventory Report Summary']]
    Object.entries(data.summary || {}).forEach(([k, v]) => rows.push([k, summaryDisplay(v)]))
    rows.push([])
    rows.push(['Items'])
    rows.push(['ID', 'Tag', 'Name', 'Category', 'Price', 'Qty', 'Stock Value', 'Low Stock'])
    data.items?.forEach(i => rows.push([
      i.prod_id, i.prod_tag, i.prod_name, i.prod_categ,
      i.prod_price, productStock(i), i.stock_value, i.is_low_stock ? 'Yes' : 'No'
    ]))
    return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  }

  const generateAppointmentsCSV = (data) => {
    const rows = [['Appointments Report Summary']]
    Object.entries(data.summary || {}).forEach(([k, v]) => rows.push([k, summaryDisplay(v)]))
    rows.push([])
    rows.push(['Appointments'])
    rows.push(['ID', 'QR', 'Type', 'Date', 'Status', 'Customer', 'Phone'])
    data.items?.forEach(a => rows.push([
      a.appoint_id, a.appoint_qr, a.appoint_type, reportDate(a),
      reportStatus(a), a.customer, a.customer_phone
    ]))
    return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  }

  const generateStaffingCSV = (data) => {
    const rows = [['Staffing Report Summary']]
    Object.entries(data.summary || {}).forEach(([k, v]) => rows.push([k, summaryDisplay(v)]))
    rows.push([])
    rows.push(['Staff'])
    rows.push(['ID', 'Name', 'Type', 'Email', 'Phone', 'In-Store', 'Total Shifts', 'Upcoming', 'Hours'])
    data.staff?.forEach(s => rows.push([
      s.emp_id, s.name, reportEmpType(s), s.emp_email, s.emp_phone,
      reportAvailability(s), s.total_shifts, s.upcoming_shifts, s.total_hours
    ]))
    return rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
  }

  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  /** How many filters are set to something other than their default. */
  const activeFilterCount = [dateFrom, dateTo, prodId, empId, appointType, statusFilter, empTypeFilter]
    .filter((value) => value !== '' && value !== null && value !== undefined)
    .length

  const showDateFilter = ['sales', 'appointments'].includes(reportType)
  const showProductFilter = ['sales', 'inventory'].includes(reportType)
  const showEmployeeFilter = ['sales', 'staffing'].includes(reportType)
  const showAppointTypeFilter = reportType === 'appointments'
  const showStatusFilter = reportType === 'appointments'
  const showEmpTypeFilter = reportType === 'staffing'

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">
              Report Builder
            </h1>
            <p className="text-sm text-slate-500 font-normal mt-1">
              Generate on-demand business reports with custom filters
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">Report Type</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {REPORT_TYPES.map(type => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => { setReportType(type.id); setGeneratedData(null); }}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    reportType === type.id
                      ? 'border-brand-orange bg-orange-50'
                      : 'border-slate-200 hover:border-brand-orange/50'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-orange-100 text-brand-orange flex items-center justify-center mb-2">
                    <type.icon className="w-5 h-5" />
                  </div>
                  <p className="font-semibold text-slate-900">{type.label}</p>
                  <p className="text-xs text-slate-500 mt-1">{type.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              aria-expanded={showFilters}
              className="w-full flex items-center justify-between gap-3 text-left cursor-pointer group"
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 group-hover:text-slate-600">
                Filters
                {activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-md border ${
                  showFilters || activeFilterCount > 0
                    ? 'bg-brand-orange text-white border-brand-orange'
                    : 'bg-slate-50 text-slate-700 border-slate-200 group-hover:bg-slate-100'
                }`}
              >
                {showFilters ? 'Hide' : 'Show'}
              </span>
            </button>
            {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              {showDateFilter && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Date From</label>
                    <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Date To</label>
                    <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange" />
                  </div>
                </>
              )}
              {showProductFilter && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Product</label>
                  <select value={prodId} onChange={e => setProdId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange">
                    <option value="">All Products</option>
                    {products.map(p => <option key={p.prod_id} value={p.prod_id}>{p.prod_name}</option>)}
                  </select>
                </div>
              )}
              {showEmployeeFilter && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee</label>
                  <select value={empId} onChange={e => setEmpId(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange">
                    <option value="">All Employees</option>
                    {employees.map(e => <option key={e.emp_id} value={e.emp_id}>{e.emp_givname} {e.emp_surname} ({empCateg(e).toUpperCase()})</option>)}
                  </select>
                </div>
              )}
              {showAppointTypeFilter && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Appointment Type</label>
                  <select value={appointType} onChange={e => setAppointType(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange">
                    <option value="">All Types</option>
                    <option value="pickup">Pickup</option>
                    <option value="visit">Visit</option>
                  </select>
                </div>
              )}
              {showStatusFilter && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange">
                    <option value="">All Statuses</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="done">Done</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="absent">Absent</option>
                  </select>
                </div>
              )}
              {showEmpTypeFilter && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Employee Type</label>
                  <select value={empTypeFilter} onChange={e => setEmpTypeFilter(e.target.value)} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange">
                    <option value="">All Types</option>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    <option value="super admin">Super Admin</option>
                  </select>
                </div>
              )}
            </div>
            )}
          </div>

          <div className="p-6 border-b border-slate-100 flex flex-wrap items-center gap-3">
            <Button onClick={handleGenerate} disabled={isGenerating} className="flex-1 sm:flex-none">
              {isGenerating ? <><LoadingSpinner size={16} /> Generating...</> : 'Generate Report'}
            </Button>
            {generatedData && (
              <>
                <Button variant="outline" onClick={handleExportCSV} className="flex-1 sm:flex-none">
                  <DownloadIcon className="w-4 h-4 mr-1" /> Export CSV
                </Button>
                <Button variant="outline" onClick={handleExportPDF} className="flex-1 sm:flex-none">
                  <FileTextIcon className="w-4 h-4 mr-1" /> Export PDF
                </Button>
                <Button variant="outline" onClick={() => setShowSaveModal(true)} className="flex-1 sm:flex-none">
                  <SaveIcon className="w-4 h-4 mr-1" /> Save Template
                </Button>
              </>
            )}
          </div>

          {generatedData && (
            <div className="p-6 space-y-6">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h3 className="font-bold text-slate-900 mb-3">Summary</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(generatedData.summary).map(([key, value]) => (
                    <div key={key} className="bg-white rounded-lg p-3 border border-slate-200">
                      <p className="text-xs text-slate-400 uppercase tracking-wider">{key.replace(/_/g, ' ')}</p>
                      <p className="text-xl font-bold text-slate-900">{typeof value === 'number' && (key.includes('revenue') || key.includes('value')) ? `₱${value.toLocaleString()}` : summaryDisplay(value)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {reportType === 'sales' && generatedData.by_date && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Sales by Date</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                        <tr><th className="p-3 text-left">Date</th><th className="p-3 text-right">Transactions</th><th className="p-3 text-right">Revenue</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {generatedData.by_date.map(d => (
                          <tr key={d.date} className="hover:bg-slate-50">
                            <td className="p-3">{d.date}</td>
                            <td className="p-3 text-right">{d.transactions}</td>
                            <td className="p-3 text-right font-medium">₱{toNumber(d.revenue).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportType === 'sales' && generatedData.by_product && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Top Products</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                        <tr><th className="p-3 text-left">Product</th><th className="p-3 text-right">Qty Sold</th><th className="p-3 text-right">Revenue</th><th className="p-3 text-right">Orders</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {generatedData.by_product.slice(0, 20).map(p => (
                          <tr key={p.prod_id} className="hover:bg-slate-50">
                            <td className="p-3">{p.prod_name}</td>
                            <td className="p-3 text-right">{p.total_qty}</td>
                            <td className="p-3 text-right font-medium">₱{toNumber(p.total_revenue).toLocaleString()}</td>
                            <td className="p-3 text-right">{p.orders_count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportType === 'inventory' && generatedData.items && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Inventory Items</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                        <tr>
                          <th className="p-3 text-left">Name</th>
                          <th className="p-3 text-left">Category</th>
                          <th className="p-3 text-right">Price</th>
                          <th className="p-3 text-right">Qty</th>
                          <th className="p-3 text-right">Stock Value</th>
                          <th className="p-3 text-center">Low Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {generatedData.items.slice(0, 50).map(i => (
                          <tr key={i.prod_id} className={`hover:bg-slate-50 ${i.is_low_stock ? 'bg-rose-50/30' : ''}`}>
                            <td className="p-3 font-medium">{i.prod_name}</td>
                            <td className="p-3 text-slate-600">{i.prod_categ}</td>
                            <td className="p-3 text-right">₱{toNumber(i.prod_price).toFixed(2)}</td>
                            <td className="p-3 text-right">{productStock(i)}</td>
                            <td className="p-3 text-right font-medium">₱{toNumber(i.stock_value).toLocaleString()}</td>
                            <td className="p-3 text-center">
                              {i.is_low_stock && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-xs font-semibold">⚠ Low</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportType === 'appointments' && generatedData.items && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Appointments</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                        <tr><th className="p-3 text-left">ID</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Date</th><th className="p-3 text-center">Status</th><th className="p-3 text-left">Customer</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {generatedData.items.slice(0, 50).map(a => (
                          <tr key={a.appoint_id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono text-xs">{a.appoint_id}</td>
                            <td className="p-3">{a.appoint_type}</td>
                            <td className="p-3">{fmtDateTime(reportDate(a))}</td>
                            <td className="p-3 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${
                                ['UPCOMING', 'DONE', 'OPEN', 'CLAIMED', 'RECEIVED'].includes(reportStatus(a)) ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                              }`}>{reportStatus(a)}</span>
                            </td>
                            <td className="p-3">{a.customer}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {reportType === 'staffing' && generatedData.staff && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Staff Details</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                        <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Email</th><th className="p-3 text-center">In-Store</th><th className="p-3 text-right">Shifts</th><th className="p-3 text-right">Hours</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {generatedData.staff.map(s => (
                          <tr key={s.emp_id} className="hover:bg-slate-50">
                            <td className="p-3 font-medium">{s.name}</td>
                            <td className="p-3">{reportEmpType(s)}</td>
                            <td className="p-3 text-slate-600">{s.emp_email}</td>
                            <td className="p-3 text-center">{reportAvailability(s)}</td>
                            <td className="p-3 text-right">{s.total_shifts} ({s.upcoming_shifts} upcoming)</td>
                            <td className="p-3 text-right">{s.total_hours}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {generatedData.coverage && (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Shift Coverage (Next 7 Days)</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                        <tr><th className="p-3 text-left">Date</th><th className="p-3 text-right">Shifts</th><th className="p-3 text-right">Staff</th><th className="p-3 text-right">Hours</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {generatedData.coverage.map(c => (
                          <tr key={c.date} className="hover:bg-slate-50">
                            <td className="p-3">{new Date(c.date).toLocaleDateString()}</td>
                            <td className="p-3 text-right">{c.shifts_count}</td>
                            <td className="p-3 text-right">{c.staff_count}</td>
                            <td className="p-3 text-right">{c.hours_covered}h</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {!generatedData && !isLoadingReports && savedReports.length > 0 && (
            <div className="p-6">
              <h3 className="font-bold text-slate-900 mb-4">Saved Report Templates</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-100 text-xs font-semibold uppercase text-slate-400">
                    <tr><th className="p-3 text-left">Template</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Created</th><th className="p-3 text-right">Actions</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {savedReports.map(r => {
                      const meta = JSON.parse(r.report_text || '{}')
                      return (
                        <tr key={r.report_id} className="hover:bg-slate-50">
                          <td className="p-3 font-medium">{r.report_title}</td>
                          <td className="p-3 capitalize">{meta.type}</td>
                          <td className="p-3 text-slate-600">{new Date(r.report_created).toLocaleString()}</td>
                          <td className="p-3 text-right">
                            <button
                              onClick={() => handleLoadTemplate(r)}
                              className="text-brand-orange hover:underline text-sm cursor-pointer"
                            >
                              Load
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!generatedData && savedReports.length === 0 && !isLoadingReports && (
            <div className="p-12 text-center text-slate-400">
              <FileTextIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No reports generated yet. Select a report type, set filters, and click Generate.</p>
            </div>
          )}
        </div>
      </div>

      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-100 p-6 animate-scale-in">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Save Report Template</h3>
            <p className="text-sm text-slate-500 mb-4">Give this filter combination a name for quick reuse.</p>
            <input
              type="text"
              value={templateName}
              onChange={e => setTemplateName(e.target.value)}
              placeholder="e.g., Weekly Sales Report"
              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-brand-orange focus:ring-1 focus:ring-brand-orange mb-4"
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowSaveModal(false)} className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={handleSaveTemplate} disabled={isGenerating || !templateName.trim()} className="px-4 py-2 rounded-lg bg-brand-orange text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50">Save Template</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}

export default AdminReports