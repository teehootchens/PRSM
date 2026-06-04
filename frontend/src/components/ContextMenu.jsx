import { useEffect, useRef } from 'react'

export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  // Adjust position to stay within viewport
  const menuWidth = 220
  const menuHeight = items.length * 36 + 8
  const adjustedX = x + menuWidth > window.innerWidth ? x - menuWidth : x
  const adjustedY = y + menuHeight > window.innerHeight ? y - menuHeight : y

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: adjustedY,
        left: adjustedX,
        background: '#1a1d27',
        border: '1px solid #2d3148',
        borderRadius: 8,
        padding: '4px 0',
        zIndex: 9999,
        minWidth: menuWidth,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      {items.map((item, i) => (
        item === 'divider' ? (
          <div key={i} style={{ height: 1, background: '#2d3148', margin: '4px 0' }} />
        ) : (
          <div
            key={i}
            onClick={() => { item.onClick(); onClose() }}
            style={{
              padding: '8px 16px',
              cursor: item.disabled ? 'default' : 'pointer',
              color: item.danger ? '#ef4444' : item.disabled ? '#475569' : '#e2e8f0',
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: item.disabled ? 0.5 : 1,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { if (!item.disabled) e.currentTarget.style.background = '#2d3148' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {item.icon && <span style={{ fontSize: 14 }}>{item.icon}</span>}
            {item.label}
          </div>
        )
      ))}
    </div>
  )
}
