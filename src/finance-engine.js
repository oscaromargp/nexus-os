/**
 * Nexus OS — FinancialEngine v1.0
 * Unified calculation used by Bio-Finanzas AND Plan del Mes.
 * All views must use these functions — no custom local filters.
 */

/**
 * Get transactions filtered by account and/or period.
 * @param {Array} nodes - allNodes array
 * @param {string|null} accountId - account ID or 'all' or null
 * @param {string|null} period - 'YYYY-MM' string or null for all time
 * @returns {Array} filtered transaction nodes
 */
export function getTransactions(nodes, accountId = 'all', period = null) {
  return (nodes || []).filter(n => {
    if (n.type !== 'income' && n.type !== 'expense' && n.type !== 'loan') return false

    // Account filter
    if (accountId && accountId !== 'all') {
      if (n.metadata?.account_id !== accountId) return false
    }

    // Period filter: YYYY-MM
    if (period) {
      const raw = n.metadata?.date || n.created_at || ''
      if (!raw) return true  // no date → include (conservative)
      const txPeriod = String(raw).slice(0, 7)  // 'YYYY-MM'
      if (txPeriod !== period) return false
    }

    return true
  })
}

/**
 * Calculate balance summary from a list of transactions.
 * @param {Array} txs - filtered transaction nodes
 * @param {number} initialBalance - account initial balance (0 for 'all')
 * @returns {{ income, expense, net, balance, count }}
 */
export function calcBalance(txs, initialBalance = 0) {
  const income  = txs.filter(n => n.type === 'income').reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const expense = txs.filter(n => n.type === 'expense').reduce((s, n) => s + (n.metadata?.amount || 0), 0)
  const net     = income - expense
  const balance = (initialBalance || 0) + net
  return { income, expense, net, balance, count: txs.length }
}

/**
 * Build running balance array (most recent first).
 * @param {Array} txs - transactions (any order)
 * @param {number} initialBalance
 * @returns {Array} same txs with _runningBalance added, sorted newest first
 */
export function buildRunningBalance(txs, initialBalance = 0) {
  const sorted = [...txs].sort((a, b) => {
    const da = a.metadata?.date || a.created_at || ''
    const db = b.metadata?.date || b.created_at || ''
    return String(da).localeCompare(String(db))  // oldest first
  })
  let running = initialBalance || 0
  const withBalance = sorted.map(tx => {
    const amt = tx.metadata?.amount || 0
    if (tx.type === 'income') running += amt
    else if (tx.type === 'expense') running -= amt
    return { ...tx, _runningBalance: running }
  })
  return withBalance.reverse()  // newest first for display
}

/**
 * Get current month period string 'YYYY-MM'
 */
export function currentPeriod() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Format currency (MXN style)
 */
export function fmt$(amount) {
  return '$' + (amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default { getTransactions, calcBalance, buildRunningBalance, currentPeriod, fmt$ }
