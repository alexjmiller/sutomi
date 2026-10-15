import { useRef, useState, useEffect, useCallback } from 'react'

export default function RichEditor({ value, onChange, placeholder }) {
  const editorRef = useRef(null)
  const [menu, setMenu] = useState(null)
  const [linkInput, setLinkInput] = useState(null)
  const savedSelection = useRef(null)

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || ''
    }
  }, [value])

  function handleInput() {
    onChange(editorRef.current.innerHTML)
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

  function handleContextMenu(e) {
    e.preventDefault()
    saveSelection()

    const sel = window.getSelection()
    const hasSelection = sel.toString().trim().length > 0
    const existingLink = getParentLink()

    setMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection,
      existingLink,
    })
    setLinkInput(null)
  }

  function closeMenu() {
    setMenu(null)
    setLinkInput(null)
  }

  function handleAddLink() {
    setLinkInput({ url: menu.existingLink ? menu.existingLink.href : '' })
  }

  function handleRemoveLink() {
    if (menu.existingLink) {
      const text = menu.existingLink.textContent
      menu.existingLink.replaceWith(document.createTextNode(text))
      handleInput()
    }
    closeMenu()
  }

  function handleLinkSubmit(e) {
    e.preventDefault()
    const url = linkInput.url.trim()
    if (!url) return

    restoreSelection()

    if (menu.existingLink) {
      menu.existingLink.href = url
    } else {
      const sel = window.getSelection()
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0)
        const selectedText = range.toString()
        if (selectedText) {
          const a = document.createElement('a')
          a.href = url
          a.target = '_blank'
          a.rel = 'noopener'
          a.textContent = selectedText
          range.deleteContents()
          range.insertNode(a)
        } else {
          const a = document.createElement('a')
          a.href = url
          a.target = '_blank'
          a.rel = 'noopener'
          a.textContent = url
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
        onContextMenu={handleContextMenu}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />
      {menu && (
        <div
          className="context-menu"
          style={{ left: menu.x, top: menu.y }}
        >
          {linkInput ? (
            <form onSubmit={handleLinkSubmit} className="context-link-form">
              <input
                type="url"
                value={linkInput.url}
                onChange={(e) => setLinkInput({ url: e.target.value })}
                placeholder="https://"
                className="context-link-input"
                autoFocus
              />
              <button type="submit" className="context-link-btn">ok</button>
            </form>
          ) : (
            <>
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
              {!menu.hasSelection && !menu.existingLink && (
                <span className="context-menu-item disabled">select text to add link</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
