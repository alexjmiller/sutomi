import { useRef, useState, useEffect, useCallback } from 'react'

// What pasted HTML may keep: the article's own vocabulary, nothing else (no inline styles, no spans).
const KEEP = new Set(['P', 'BR', 'H2', 'H3', 'B', 'STRONG', 'I', 'EM', 'A', 'IMG', 'UL', 'OL', 'LI', 'BLOCKQUOTE'])
const RENAME = { H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3', DIV: 'P' }

/** Rebuild pasted markup with only the tags and attributes the editor understands. */
export function cleanHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const walk = (node) => {
    let out = ''
    for (const child of node.childNodes) {
      if (child.nodeType === 3) { out += child.textContent.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); continue }
      if (child.nodeType !== 1) continue
      let tag = RENAME[child.tagName] || child.tagName
      if (tag === 'IMG') { out += child.src ? `<img src="${child.getAttribute('src')}" alt="">` : ''; continue }
      if (tag === 'BR') { out += '<br>'; continue }
      const inner = walk(child)
      if (!KEEP.has(tag)) { out += inner; continue }
      if (tag === 'A') { out += child.getAttribute('href') ? `<a href="${child.getAttribute('href')}" target="_blank" rel="noopener">${inner}</a>` : inner; continue }
      if (!inner.trim() && tag !== 'LI') continue // drop empty blocks that pasting leaves behind
      out += `<${tag.toLowerCase()}>${inner}</${tag.toLowerCase()}>`
    }
    return out
  }
  return walk(doc.body)
}

export default function RichEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [inputMode, setInputMode] = useState(null) // 'link' | 'image'
  const [inputUrl, setInputUrl] = useState('')
  const savedSelection = useRef(null)

  useEffect(() => {
    // Enter makes a new <p>, like every existing article, rather than the browser's <div>
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch { /* older engines */ }
  }, [])

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  function handleInput() {
    onChange(editorRef.current.innerHTML)
  }

  function handlePaste(e) {
    const html = e.clipboardData.getData('text/html')
    const text = e.clipboardData.getData('text/plain')
    if (!html && !text) return
    e.preventDefault()
    const clean = html ? cleanHtml(html) : text.split(/\n{2,}/).map((para) => `<p>${para.replace(/\n/g, '<br>')}</p>`).join('')
    document.execCommand('insertHTML', false, clean)
    handleInput()
  }

  /** Block styles for the selected lines, and italic for the selected words. */
  function applyFormat(kind) {
    restoreSelection()
    editorRef.current.focus()
    if (kind === 'italic') document.execCommand('italic')
    else if (kind === 'clear') { document.execCommand('removeFormat'); document.execCommand('formatBlock', false, 'p') }
    else document.execCommand('formatBlock', false, kind)
    handleInput()
    closeMenu()
  }

  function saveSelection() {
    const sel = window.getSelection()
    if (sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange()
    }
  }

  function restoreSelection() {
    if (savedSelection.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedSelection.current)
    }
  }

  function getParentLink() {
    const sel = window.getSelection()
    if (!sel.rangeCount) return null
    let node = sel.anchorNode
    while (node && node !== editorRef.current) {
      if (node.tagName === 'A') return node
      node = node.parentNode
    }
    return null
  }

  function getParentImage() {
    const sel = window.getSelection()
    if (!sel.rangeCount) return null
    const node = sel.anchorNode
    if (node.tagName === 'IMG') return node
    if (node.nodeType === 1) {
      const img = node.querySelector('img')
      if (img) return img
    }
    if (node.parentNode) {
      const prev = sel.getRangeAt(0).startContainer
      if (prev.tagName === 'IMG') return prev
    }
    return null
  }

  function handleContextMenu(e) {
    saveSelection()

    const sel = window.getSelection()
    const hasSelection = sel.toString().trim().length > 0
    const existingLink = getParentLink()
    const existingImage = getParentImage() || (e.target.tagName === 'IMG' ? e.target : null)

    // Only show custom menu when relevant — otherwise let browser menu through for spellcheck
    if (!hasSelection && !existingLink && !existingImage) return

    e.preventDefault()

    setMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection,
      existingLink,
      existingImage,
    })
    setInputMode(null)
    setInputUrl('')
  }

  function closeMenu() {
    setMenu(null)
    setInputMode(null)
    setInputUrl('')
  }

  function handleAddLink() {
    setInputUrl(menu.existingLink ? menu.existingLink.href : '')
    setInputMode('link')
  }

  function handleAddImage() {
    setInputUrl(menu.existingImage ? menu.existingImage.src : '')
    setInputMode('image')
  }

  function handleRemoveLink() {
    if (menu.existingLink) {
      const text = menu.existingLink.textContent
      menu.existingLink.replaceWith(document.createTextNode(text))
      handleInput()
    }
    closeMenu()
  }

  function handleRemoveImage() {
    if (menu.existingImage) {
      menu.existingImage.remove()
      handleInput()
    }
    closeMenu()
  }

  function handleSubmit(e) {
    e.preventDefault()
    const url = inputUrl.trim()
    if (!url) return

    restoreSelection()

    if (inputMode === 'image') {
      if (menu.existingImage) {
        menu.existingImage.src = url
      } else {
        const img = document.createElement('img')
        img.src = url
        img.alt = ''
        const sel = window.getSelection()
        if (sel.rangeCount > 0) {
          sel.getRangeAt(0).insertNode(img)
        }
      }
    } else {
      if (menu.existingLink) {
        menu.existingLink.href = url
      } else {
        const sel = window.getSelection()
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0)
          const selectedText = range.toString()
          const a = document.createElement('a')
          a.href = url
          a.target = '_blank'
          a.rel = 'noopener'
          a.textContent = selectedText || url
          range.deleteContents()
          range.insertNode(a)
        }
      }
    }

    handleInput()
    closeMenu()
  }

  const handleClickOutside = useCallback((e) => {
    if (menu && !e.target.closest('.context-menu')) {
      closeMenu()
    }
  }, [menu])

  useEffect(() => {
    if (menu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menu, handleClickOutside])

  return (
    <div className="rich-editor-wrap">
      <div
        ref={editorRef}
        className="editor-body"
        contentEditable
        onInput={handleInput}
        onPaste={handlePaste}
        onContextMenu={handleContextMenu}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {inputMode ? (
            <form onSubmit={handleSubmit} className="context-link-form">
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                placeholder={inputMode === 'image' ? '/image.svg' : 'https://'}
                className="context-link-input"
                autoFocus
              />
              <button type="submit" className="context-link-btn">ok</button>
            </form>
          ) : (
            <>
              {menu.hasSelection && (
                <>
                  <button className="context-menu-item" onClick={() => applyFormat('h2')}>heading</button>
                  <button className="context-menu-item" onClick={() => applyFormat('h3')}>subheading</button>
                  <button className="context-menu-item" onClick={() => applyFormat('p')}>body text</button>
                  <button className="context-menu-item" onClick={() => applyFormat('italic')}>italic</button>
                  <button className="context-menu-item" onClick={() => applyFormat('clear')}>clear formatting</button>
                  <hr className="context-menu-rule" />
                </>
              )}
              {(menu.hasSelection || menu.existingLink) && (
                <button className="context-menu-item" onClick={handleAddLink}>
                  {menu.existingLink ? 'edit link' : 'add link'}
                </button>
              )}
              {menu.existingLink && (
                <button className="context-menu-item" onClick={handleRemoveLink}>
                  remove link
                </button>
              )}
              {menu.existingImage ? (
                <>
                  <button className="context-menu-item" onClick={handleAddImage}>
                    edit image
                  </button>
                  <button className="context-menu-item" onClick={handleRemoveImage}>
                    remove image
                  </button>
                </>
              ) : (
                <button className="context-menu-item" onClick={handleAddImage}>
                  add image
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
