import { useEffect, useRef, useState } from 'react'
import { Select, Spin } from 'antd'

const DEBOUNCE_MS = 350

/**
 * Debounced, server-backed searchable select. `fetchOptions(term)` is
 * called only after the user pauses typing for DEBOUNCE_MS — never on
 * every keystroke. Stale responses (a fast typist's earlier keystroke
 * resolving after a later one) are discarded via a request-id guard so
 * the dropdown never flashes outdated results.
 */
export default function RemoteSearchSelect({
  value,
  onChange,
  fetchOptions,
  initialOptions = [],
  placeholder = 'Select...',
  disabled = false,
}) {
  const [options, setOptions] = useState(initialOptions)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef(null)
  const latestQueryRef = useRef(0)

  // If the parent's initial (top-N) list arrives after mount, adopt it —
  // but only while nothing has been searched yet, so an in-progress
  // search's results are never clobbered by a late-arriving initial list.
  useEffect(() => {
    setOptions((prev) => (prev.length === 0 ? initialOptions : prev))
  }, [initialOptions])

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  const handleSearch = (term) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!term || !term.trim()) {
      setOptions(initialOptions)
      setLoading(false)
      return
    }

    setLoading(true)
    const queryId = ++latestQueryRef.current
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await fetchOptions(term.trim())
        if (queryId === latestQueryRef.current) setOptions(results)
      } catch {
        if (queryId === latestQueryRef.current) setOptions([])
      } finally {
        if (queryId === latestQueryRef.current) setLoading(false)
      }
    }, DEBOUNCE_MS)
  }

  const handleClear = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    setOptions(initialOptions)
    setLoading(false)
  }

  return (
    <Select
      showSearch
      allowClear
      value={value || undefined}
      placeholder={placeholder}
      disabled={disabled}
      filterOption={false}
      onSearch={handleSearch}
      onChange={onChange}
      onClear={handleClear}
      notFoundContent={loading ? <Spin size="small" /> : 'No results'}
      options={options}
      size="small"
      style={{ width: '100%' }}
    />
  )
}
