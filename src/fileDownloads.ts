/** Downloads a stored data-URL file reliably by converting it to a Blob first.
 *  (Large `data:` URLs and opening them in a tab are blocked by browsers; a Blob URL is not.) */
export function downloadDataUrl(dataUrl: string, fileName: string) {
  try {
    const [meta, b64] = dataUrl.split(',')
    const mime = /:(.*?);/.exec(meta)?.[1] ?? 'application/octet-stream'
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([arr], { type: mime }))
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch {
    // Fallback: direct data-URL download (works for small files).
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = fileName
    a.click()
  }
}

/** Opens a stored data-URL file in a new tab via a Blob URL (browsers block `data:` navigation). */
export function openDataUrl(dataUrl: string) {
  try {
    const [meta, b64] = dataUrl.split(',')
    const mime = /:(.*?);/.exec(meta)?.[1] ?? 'application/octet-stream'
    const bin = atob(b64)
    const arr = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
    const url = URL.createObjectURL(new Blob([arr], { type: mime }))
    window.open(url, '_blank', 'noopener,noreferrer')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch {
    /* ignore */
  }
}

