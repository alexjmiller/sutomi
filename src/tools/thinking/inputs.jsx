// Thinking Machine — answer inputs. Each receives (value, onChange) plus step/answers where needed.
import { useEffect, useRef, useState } from 'react'
import { defaultHmw, newId } from './flow'

function AutoTextarea({ value, onChange, placeholder, onContinue, autoFocus, rows = 3, ariaLabel }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      className="tm-textarea"
      value={value || ''}
      rows={rows}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Enter continues, shift+enter adds a line (conversational feel)
        if (e.key === 'Enter' && !e.shiftKey && onContinue) { e.preventDefault(); onContinue() }
      }}
    />
  )
}

export function TextInput({ value, onChange, step, onContinue }) {
  return (
    <AutoTextarea
      value={value}
      onChange={onChange}
      placeholder="your answer"
      ariaLabel={typeof step.question === 'string' ? step.question : 'your answer'}
      onContinue={onContinue}
      autoFocus
    />
  )
}

export function ChoiceInput({ value, onChange, step, onContinue }) {
  return (
    <div className="tm-choices" role="radiogroup" aria-label={step.question}>
      {step.options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`tm-choice${value === o.value ? ' active' : ''}`}
          onClick={() => { onChange(o.value); if (onContinue) onContinue() }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A list of short strings: add with Enter, edit in place, remove. */
export function ListInput({ value = [], onChange, placeholder, label }) {
  const [draft, setDraft] = useState('')
  function add() {
    const t = draft.trim()
    if (!t) return
    onChange([...value, t])
    setDraft('')
  }
  function update(i, t) {
    const next = value.slice()
    next[i] = t
    onChange(next)
  }
  function remove(i) {
    onChange(value.filter((_, j) => j !== i))
  }
  return (
    <div className="tm-list">
      {label && <span className="tm-list-label">{label}</span>}
      <ul className="tm-items">
        {value.map((item, i) => (
          <li key={i} className="tm-item">
            <input
              className="tm-item-input"
              value={item}
              aria-label={`${label || 'item'} ${i + 1}`}
              onChange={(e) => update(i, e.target.value)}
            />
            <button type="button" className="tm-x" aria-label="remove" onClick={() => remove(i)}>×</button>
          </li>
        ))}
      </ul>
      <input
        className="tm-add"
        value={draft}
        placeholder={placeholder}
        aria-label={`add ${label || 'item'}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
      />
    </div>
  )
}

export function PairInput({ answers, onChangeField, step }) {
  return (
    <div className="tm-pair">
      {step.fields.map((f) => (
        <ListInput
          key={f.key}
          label={f.label}
          placeholder={f.placeholder}
          value={answers[f.key] || []}
          onChange={(v) => onChangeField(f.key, v)}
        />
      ))}
    </div>
  )
}

export function HmwInput({ value, onChange, answers, stale, onContinue }) {
  const template = defaultHmw(answers)
  return (
    <div className="tm-hmw">
      {stale && (
        <p className="tm-note">You changed who it is for or the outcome since writing this. Worth a re-read.</p>
      )}
      <AutoTextarea
        value={value}
        onChange={onChange}
        placeholder={template}
        ariaLabel="How might we question"
        onContinue={onContinue}
        autoFocus
        rows={2}
      />
      <div className="tm-inline-actions">
        <button type="button" className="tm-text-btn" onClick={() => onChange(template)}>use the template</button>
        {value && <button type="button" className="tm-text-btn" onClick={() => onChange('')}>clear</button>}
      </div>
    </div>
  )
}

/** Idea cards: short title + optional description. */
export function CardsInput({ value = [], onChange }) {
  function add() {
    onChange([...value, { id: newId(), title: '', description: '' }])
  }
  function update(id, patch) {
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }
  function remove(id) {
    onChange(value.filter((c) => c.id !== id))
  }
  return (
    <div className="tm-cards">
      {value.map((c, i) => (
        <div key={c.id} className="tm-card">
          <div className="tm-card-row">
            <input
              className="tm-card-title"
              value={c.title}
              placeholder="idea"
              aria-label={`idea ${i + 1} title`}
              autoFocus={!c.title && i === value.length - 1}
              onChange={(e) => update(c.id, { title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            />
            <button type="button" className="tm-x" aria-label="remove idea" onClick={() => remove(c.id)}>×</button>
          </div>
          <input
            className="tm-card-desc"
            value={c.description || ''}
            placeholder="description (optional)"
            aria-label={`idea ${i + 1} description`}
            onChange={(e) => update(c.id, { description: e.target.value })}
          />
        </div>
      ))}
      <button type="button" className="tm-add-btn" onClick={add}>+ add an idea</button>
    </div>
  )
}

export function SelectInput({ answers, value, onChange, onJump }) {
  const ideas = (answers.ideas || []).filter((i) => i.title.trim())
  if (!ideas.length) {
    return (
      <p className="tm-empty">
        No ideas yet. <button type="button" className="tm-text-btn" onClick={() => onJump('ideas')}>Add some first</button>
      </p>
    )
  }
  return (
    <div className="tm-choices tm-choices-col" role="radiogroup" aria-label="ideas">
      {ideas.map((i) => (
        <button
          key={i.id}
          type="button"
          role="radio"
          aria-checked={value === i.id}
          className={`tm-choice${value === i.id ? ' active' : ''}`}
          onClick={() => onChange(i.id)}
        >
          <span>{i.title}</span>
          {i.description && <span className="tm-choice-desc">{i.description}</span>}
        </button>
      ))}
    </div>
  )
}

/** Reorderable task list with an optional owner/date note. */
export function TasksInput({ value = [], onChange }) {
  function add() {
    onChange([...value, { id: newId(), text: '', note: '' }])
  }
  function update(id, patch) {
    onChange(value.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  function remove(id) {
    onChange(value.filter((t) => t.id !== id))
  }
  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= value.length) return
    const next = value.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  return (
    <div className="tm-tasks">
      {value.map((t, i) => (
        <div key={t.id} className="tm-task">
          <span className="tm-task-n">{i + 1}.</span>
          <input
            className="tm-task-text"
            value={t.text}
            placeholder="task"
            aria-label={`task ${i + 1}`}
            autoFocus={!t.text && i === value.length - 1}
            onChange={(e) => update(t.id, { text: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          />
          <input
            className="tm-task-note"
            value={t.note || ''}
            placeholder="who / when"
            aria-label={`task ${i + 1} owner or date`}
            onChange={(e) => update(t.id, { note: e.target.value })}
          />
          <span className="tm-task-ctl">
            <button type="button" className="tm-x" aria-label="move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="tm-x" aria-label="move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="tm-x" aria-label="remove task" onClick={() => remove(t.id)}>×</button>
          </span>
        </div>
      ))}
      <button type="button" className="tm-add-btn" onClick={add}>+ add a task</button>
    </div>
  )
}
