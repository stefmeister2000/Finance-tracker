import { useEffect, useRef, useState } from 'react'

/** Shared page navigation and density controls for every workspace tab. */
export default function PageFrame({ pageKey, children }: { pageKey: string; children: React.ReactNode }) {
  const content = useRef<HTMLDivElement>(null)
  const [sections, setSections] = useState<{ label: string; element: HTMLElement }[]>([])
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const root = content.current
    if (!root) return
    let pending = 0
    const scan = () => {
      const next = Array.from(root.querySelectorAll<HTMLElement>('.panel-header h2, .drive-list-toolbar h3'))
        .filter((element) => element.getClientRects().length > 0 && !element.closest('.modal-backdrop'))
        .map((element) => ({ label: element.textContent?.trim() ?? '', element }))
      setSections((previous) => previous.length === next.length && previous.every((s, i) => s.label === next[i].label && s.element === next[i].element) ? previous : next)
    }
    const observer = new MutationObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(scan) })
    observer.observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['open', 'hidden'] })
    scan()
    root.closest('.main')?.scrollTo({ top: 0 })
    return () => { observer.disconnect(); cancelAnimationFrame(pending) }
  }, [pageKey])
  return <div className={`page-frame ${compact ? 'compact-tables' : ''}`}>
    <div className="page-navigation">
      <div className="section-shortcuts" aria-label="Page sections">
        {sections.length > 1 ? <><span>Jump to</span>{sections.map((section, i) => <button key={`${section.label}-${i}`} onClick={() => section.element.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{section.label}</button>)}</> : null}
      </div>
      <button className="density-toggle" aria-pressed={compact} onClick={() => setCompact(!compact)} title="Change table spacing">{compact ? '↕ Compact rows' : '↕ Comfortable rows'}</button>
    </div>
    <div ref={content}>{children}</div>
  </div>
}
