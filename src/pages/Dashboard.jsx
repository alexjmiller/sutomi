import { Link } from 'react-router-dom'

const tools = [
  { name: 'Edit articles', description: 'write about the future and the past', path: '/articles' },
  { name: 'QR Creator', description: 'create a quick qr code' },
  { name: 'Thinking machine', description: 'guided thinking - problem framing & hypothesis testing' },
  { name: 'projects', description: 'manage and view my projects' },
  { name: 'tasks', description: 'create tasklists' },
  { name: 'event horizon', description: 'control the future - become a master of time' },
]

export default function Dashboard() {
  return (
    <main className="page">
      <ul className="article-list">
        {tools.map((tool) => (
          <li key={tool.name} className="article-item">
            {tool.path ? (
              <Link to={tool.path} className="article-title">{tool.name}</Link>
            ) : (
              <span className="article-title">{tool.name}</span>
            )}
            <span className="article-summary">{tool.description}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
