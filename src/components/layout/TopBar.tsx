import { COLORS } from '../../lib/colors'

interface TopBarProps {
  title: string
  subtitle?: string
  titleIcon?: string
  titleIconColor?: string
  onMenuClick?: () => void
  isMobile?: boolean
}

export function TopBar({ title, subtitle, titleIcon, titleIconColor, onMenuClick, isMobile = false }: TopBarProps) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 28,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {isMobile && (
          <button
            onClick={onMenuClick}
            style={{
              background: 'none', border: 'none',
              color: COLORS.text, fontSize: 20, cursor: 'pointer',
              padding: '2px 4px', lineHeight: 1, flexShrink: 0,
            }}
            aria-label="Open menu"
          >
            ☰
          </button>
        )}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {titleIcon && (
              <span style={{ fontSize: isMobile ? 16 : 18, color: titleIconColor ?? COLORS.accent, lineHeight: 1 }}>
                {titleIcon}
              </span>
            )}
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 900, letterSpacing: '-0.03em', color: COLORS.text, lineHeight: 1.1 }}>{title}</div>
          </div>
          {subtitle && <div style={{ fontSize: 13, color: COLORS.muted, marginTop: isMobile ? 3 : 5, fontWeight: 500 }}>{subtitle}</div>}
        </div>
      </div>
    </div>
  )
}
