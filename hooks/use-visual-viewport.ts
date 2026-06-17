'use client'

import { useEffect, useState } from 'react'

export function useVisualViewport() {
  const [height, setHeight] = useState<number | null>(null)
  const [offsetTop, setOffsetTop] = useState(0)

  useEffect(() => {
    function update() {
      const vv = window.visualViewport
      if (!vv) {
        setHeight(window.innerHeight)
        setOffsetTop(0)
        return
      }
      const vvH = vv.height
      const fullH = window.innerHeight
      if (vvH < fullH * 0.92) {
        setHeight(vvH)
        setOffsetTop(vv.offsetTop)
      } else {
        setHeight(null)
        setOffsetTop(0)
      }
    }

    update()
    window.addEventListener('resize', update)
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    return () => {
      window.removeEventListener('resize', update)
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', update)
        window.visualViewport.removeEventListener('scroll', update)
      }
    }
  }, [])

  return { height, offsetTop }
}
