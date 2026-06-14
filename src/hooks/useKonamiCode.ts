import { useEffect } from 'react'

const SEQ = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
]

export function useKonamiCode(onToggle: () => void) {
  useEffect(() => {
    let idx = 0
    let timer: ReturnType<typeof setTimeout>

    const onKey = (e: KeyboardEvent) => {
      clearTimeout(timer)
      if (e.key === SEQ[idx]) {
        idx++
        if (idx === SEQ.length) {
          onToggle()
          idx = 0
        }
      } else {
        idx = 0
      }
      timer = setTimeout(() => { idx = 0 }, 5000)
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [onToggle])
}
