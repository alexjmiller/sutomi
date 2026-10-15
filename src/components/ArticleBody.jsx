export default function ArticleBody({ preview, html, mode }) {
  const isOpen = mode === 'expanding' || mode === 'open'

  return (
    <div className={`article-body-container ${mode}`}>
      <div className={`body-preview ${isOpen ? 'fade-out' : 'fade-in'}`}>
        {preview}
      </div>
      <div
        className={`body-full ${isOpen ? 'fade-in' : 'fade-out'}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
