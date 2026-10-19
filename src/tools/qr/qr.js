// QR Creator — pure logic, no React.
// Ported from ~/Projects/qr-creator (qr_creator.py / app.py).
import QRCode from 'qrcode'

export const MAX_LEN = 2000
export const TYPES = ['url', 'text', 'geo']

export const PLACEHOLDERS = {
  url: 'example.com or https://example.com',
  text: 'anything you want to encode',
  geo: '51.5074, -0.1278  (lat, lon)',
}

// Site colours for the on-page preview; downloads use classic black on white.
export const PREVIEW_COLORS = { dark: '#46413d', light: '#faf5e4' }
export const FILE_COLORS = { dark: '#000000', light: '#ffffff' }

const BASE_OPTS = { errorCorrectionLevel: 'M', margin: 4 }

/** Turn the raw input into the string that gets encoded. Throws on bad input. */
export function encodePayload(kind, value) {
  const data = (value || '').trim()
  if (!data) throw new Error('no data provided')
  if (data.length > MAX_LEN) throw new Error(`data too long (max ${MAX_LEN} characters)`)
  switch (kind) {
    case 'text':
      return data
    case 'url':
      return /^[a-z][a-z0-9+.-]*:/i.test(data) ? data : `https://${data}`
    case 'geo': {
      const parts = data.split(',').map((p) => p.trim())
      if (parts.length !== 2) throw new Error("geo coordinates must be 'lat,lon'")
      const [lat, lon] = parts
      if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) throw new Error('lat and lon must be numbers')
      if (Math.abs(+lat) > 90 || Math.abs(+lon) > 180) throw new Error('lat must be -90..90, lon -180..180')
      return `geo:${lat},${lon}`
    }
    default:
      throw new Error(`unknown type: ${kind}`)
  }
}

function isFiniteNumber(s) {
  return s !== '' && Number.isFinite(Number(s))
}

/** qr-<slug>.<ext>: lowercased input, non-alphanumeric runs -> hyphens, max 20 chars. */
export function slugFilename(data, ext) {
  let slug = data.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20).replace(/-$/, '')
  if (!slug) slug = 'code'
  return `qr-${slug}.${ext}`
}

/** SVG markup for the payload. */
export function toSvg(payload, color = PREVIEW_COLORS) {
  return QRCode.toString(payload, { ...BASE_OPTS, type: 'svg', color })
}

/** PNG data URL for the payload (browser canvas). */
export function toPngDataUrl(payload, color = FILE_COLORS, width = 1024) {
  return QRCode.toDataURL(payload, { ...BASE_OPTS, type: 'image/png', width, color })
}
