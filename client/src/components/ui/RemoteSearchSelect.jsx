import { useEffect, useRef, useState } from 'react'
import { Select, Spin } from 'antd'

const DEBOUNCE_MS = 350

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
