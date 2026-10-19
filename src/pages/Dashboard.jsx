import { Link } from 'react-router-dom'

const tools = [
  { name: 'Edit articles', description: 'write about the future and the past', path: '/articles' },
  { name: 'QR Creator', description: 'create a quick qr code', path: '/tools/qr' },
  { name: 'Thinking machine', description: 'guided thinking - problem framing & hypothesis testing', path: '/tools/thinking' },
  { name: 'projects', description: 'manage and view my projects' },
  { name: 'tasks', description: 'create tasklists' },
  { name: 'event horizon', description: 'control the future - become a master of time', path: '/tools/eventhorizon' },
]

export default function Dashboard() {
  return (
    <main className="page">
      <ul className="dashboard-list">
        {tools.map((tool) => (
          <li key={tool.name} className="dashboard-item">
            {tool.path ? (
              <Link to={tool.path} className="dashboard-title">{tool.name}</Link>
            ) : (
              <span className="dashboard-title">{tool.name}</span>
            )}
            <span className="dashboard-desc">{tool.description}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
