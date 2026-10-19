import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  TYPES, PLACEHOLDERS, PREVIEW_COLORS, FILE_COLORS,
  encodePayload, slugFilename, toSvg, toPngDataUrl,
} from './qr'
import './qr.css'

export default function QrCreator() {
  const [type, setType] = useState('url')
  const [data, setData] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // { payload, svg, svgUrl, pngUrl, svgName, pngName }

  useEffect(() => {
    const raw = data.trim()
    if (!raw) {
      setError('')
      setResult(null)
      return
    }

    let cancelled = false
    let svgUrl = null
    const timer = setTimeout(async () => {
      try {
        const payload = encodePayload(type, raw)
        const [svg, fileSvg, pngUrl] = await Promise.all([
          toSvg(payload, PREVIEW_COLORS),
          toSvg(payload, FILE_COLORS),
          toPngDataUrl(payload),
        ])
        if (cancelled) return
        svgUrl = URL.createObjectURL(new Blob([fileSvg], { type: 'image/svg+xml' }))
        setResult({ payload, svg, svgUrl, pngUrl, svgName: slugFilename(raw, 'svg'), pngName: slugFilename(raw, 'png') })
        setError('')
      } catch (e) {
        if (cancelled) return
        setResult(null)
        setError(e.message || 'could not create the code')
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (svgUrl) URL.revokeObjectURL(svgUrl)
    }
  }, [type, data])

  return (
    <main className="page">
      <Link to="/dashboard" className="back-link">&lt; back</Link>
      <h1 className="article-heading">QR Creator</h1>
      <p className="qr-intro">turn a url, some text, or coordinates into a qr code</p>

      <div className="qr-types">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`qr-type${t === type ? ' active' : ''}`}
            onClick={() => setType(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <input
        className="qr-input"
        type="text"
        value={data}
        onChange={(e) => setData(e.target.value)}
        placeholder={PLACEHOLDERS[type]}
        autoComplete="off"
        spellCheck={type === 'text'}
        autoFocus
      />
      {error && <p className="qr-error">{error}</p>}

      {result && (
        <div className="qr-result">
          <div className="qr-frame" dangerouslySetInnerHTML={{ __html: result.svg }} />
          <div className="qr-downloads">
            <span className="qr-payload">{result.payload}</span>
            <a href={result.svgUrl} download={result.svgName} className="qr-download">
              download svg <span className="qr-ext">vector</span>
            </a>
            <a href={result.pngUrl} download={result.pngName} className="qr-download">
              download png <span className="qr-ext">image</span>
            </a>
          </div>
        </div>
      )}
    </main>
  )
}
