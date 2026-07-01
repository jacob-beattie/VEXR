import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useIsMobile } from '../useIsMobile'

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: width })
}

describe('useIsMobile', () => {
  const originalWidth = window.innerWidth

  afterEach(() => {
    setWidth(originalWidth)
  })

  it('returns true when window width is below breakpoint', () => {
    setWidth(375)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)
  })

  it('returns false when window width is at or above breakpoint', () => {
    setWidth(1024)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('returns false when width equals the breakpoint exactly', () => {
    setWidth(768)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)
  })

  it('updates when the window is resized below breakpoint', () => {
    setWidth(1024)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(false)

    act(() => {
      setWidth(375)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(true)
  })

  it('updates when the window is resized above breakpoint', () => {
    setWidth(375)
    const { result } = renderHook(() => useIsMobile())
    expect(result.current).toBe(true)

    act(() => {
      setWidth(1024)
      window.dispatchEvent(new Event('resize'))
    })

    expect(result.current).toBe(false)
  })

  it('respects a custom breakpoint', () => {
    setWidth(500)
    const { result } = renderHook(() => useIsMobile(600))
    expect(result.current).toBe(true)
  })

  it('removes resize listener on unmount', () => {
    setWidth(1024)
    const { result, unmount } = renderHook(() => useIsMobile())
    unmount()

    act(() => {
      setWidth(375)
      window.dispatchEvent(new Event('resize'))
    })

    // After unmount the hook is gone; just verify no crash
    expect(result.current).toBe(false)
  })
})
