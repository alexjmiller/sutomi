// Thinking Machine — answer inputs. Each gets a value and onChange; some get extra context.
import { useEffect, useRef, useState } from 'react'
import { ROUTES, STATES, newId, today } from './flow'

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

export function TextInput({ value, onChange, label, onContinue }) {
  return <AutoTextarea value={value} onChange={onChange} placeholder="your answer" ariaLabel={label} onContinue={onContinue} autoFocus />
}

export function ChoiceInput({ value, onChange, options, label, onContinue, column }) {
  return (
    <div className={`tm-choices${column ? ' tm-choices-col' : ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`tm-choice${value === o.value ? ' active' : ''}`}
          onClick={() => { onChange(o.value); if (onContinue) onContinue(o.value) }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function RouteInput({ value, onChange, label, onContinue }) {
  return <ChoiceInput value={value} onChange={onChange} options={ROUTES.map((r) => ({ value: r.id, label: r.label }))} label={label} onContinue={onContinue} column />
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
  return (
    <div className="tm-list">
      {label && <span className="tm-list-label">{label}</span>}
      <ul className="tm-items">
        {value.map((item, i) => (
          <li key={i} className="tm-item">
            <input className="tm-item-input" value={item} aria-label={`${label || 'item'} ${i + 1}`}
              onChange={(e) => { const n = value.slice(); n[i] = e.target.value; onChange(n) }} />
            <button type="button" className="tm-x" aria-label="remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <input className="tm-add" value={draft} placeholder={placeholder} aria-label={`add ${label || 'item'}`}
        onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
    </div>
  )
}

export function PairInput({ fields, values, onChangeField }) {
  return (
    <div className="tm-pair">
      {fields.map((f) => (
        <ListInput key={f.key} label={f.label} placeholder={f.placeholder} value={values[f.key] || []} onChange={(v) => onChangeField(f, v)} />
      ))}
    </div>
  )
}

export function HmwInput({ value, onChange, template, onContinue }) {
  return (
    <div className="tm-hmw">
      <AutoTextarea value={value} onChange={onChange} placeholder={template} ariaLabel="How might we question" onContinue={onContinue} autoFocus rows={2} />
      <div className="tm-inline-actions">
        <button type="button" className="tm-text-btn" onClick={() => onChange(template)}>use the template</button>
        {value && <button type="button" className="tm-text-btn" onClick={() => onChange('')}>clear</button>}
      </div>
    </div>
  )
}

/** Cards: short title + optional description. Used for ideas and options. */
export function CardsInput({ value = [], onChange, noun = 'idea' }) {
  const add = () => onChange([...value, { id: newId(), title: '', description: '' }])
  const update = (id, patch) => onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  return (
    <div className="tm-cards">
      {value.map((c, i) => (
        <div key={c.id} className="tm-card">
          <div className="tm-card-row">
            <input className="tm-card-title" value={c.title} placeholder={noun} aria-label={`${noun} ${i + 1} title`}
              autoFocus={!c.title && i === value.length - 1}
              onChange={(e) => update(c.id, { title: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
            <button type="button" className="tm-x" aria-label={`remove ${noun}`} onClick={() => onChange(value.filter((x) => x.id !== c.id))}>×</button>
          </div>
          <input className="tm-card-desc" value={c.description || ''} placeholder="description (optional)" aria-label={`${noun} ${i + 1} description`}
            onChange={(e) => update(c.id, { description: e.target.value })} />
        </div>
      ))}
      <button type="button" className="tm-add-btn" onClick={add}>+ add an {noun}</button>
    </div>
  )
}

export function SelectInput({ items = [], value, onChange, emptyText, onEmptyAction, emptyActionLabel }) {
  const list = items.filter((i) => (i.title || '').trim())
  if (!list.length) {
    return (
      <p className="tm-empty">
        {emptyText} {onEmptyAction && <button type="button" className="tm-text-btn" onClick={onEmptyAction}>{emptyActionLabel}</button>}
      </p>
    )
  }
  return (
    <div className="tm-choices tm-choices-col" role="radiogroup">
      {list.map((i) => (
        <button key={i.id} type="button" role="radio" aria-checked={value === i.id}
          className={`tm-choice${value === i.id ? ' active' : ''}`} onClick={() => onChange(i.id)}>
          <span>{i.title}</span>
          {i.description && <span className="tm-choice-desc">{i.description}</span>}
        </button>
      ))}
    </div>
  )
}

/** Reorderable task list with an optional owner/date note. */
export function TasksInput({ value = [], onChange }) {
  const add = () => onChange([...value, { id: newId(), text: '', note: '' }])
  const update = (id, patch) => onChange(value.map((t) => (t.id === id ? { ...t, ...patch } : t)))
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
          <input className="tm-task-text" value={t.text} placeholder="task" aria-label={`task ${i + 1}`}
            autoFocus={!t.text && i === value.length - 1}
            onChange={(e) => update(t.id, { text: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          <input className="tm-task-note" value={t.note || ''} placeholder="who / when" aria-label={`task ${i + 1} owner or date`}
            onChange={(e) => update(t.id, { note: e.target.value })} />
          <span className="tm-task-ctl">
            <button type="button" className="tm-x" aria-label="move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
            <button type="button" className="tm-x" aria-label="move down" disabled={i === value.length - 1} onClick={() => move(i, 1)}>↓</button>
            <button type="button" className="tm-x" aria-label="remove task" onClick={() => onChange(value.filter((x) => x.id !== t.id))}>×</button>
          </span>
        </div>
      ))}
      <button type="button" className="tm-add-btn" onClick={add}>+ add a task</button>
    </div>
  )
}

/** Dated learning entries. */
export function LogInput({ value = [], onChange }) {
  const [draft, setDraft] = useState('')
  function add() {
    const t = draft.trim()
    if (!t) return
    onChange([...value, { id: newId(), date: today(), text: t }])
    setDraft('')
  }
  return (
    <div className="tm-log-input">
      <ul className="tm-items">
        {value.map((e, i) => (
          <li key={e.id || i} className="tm-item tm-log-entry">
            <span className="tm-log-date">{e.date}</span>
            <input className="tm-item-input" value={e.text} aria-label={`learning ${i + 1}`}
              onChange={(ev) => onChange(value.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))} />
            <button type="button" className="tm-x" aria-label="remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>×</button>
          </li>
        ))}
      </ul>
      <AutoTextarea value={draft} onChange={setDraft} placeholder="what you learned" ariaLabel="add learning" onContinue={add} rows={2} />
      <span className="tm-kbd">enter to add an entry</span>
    </div>
  )
}

/** Collect supporting questions, or go straight on to the aim. */
export function QuestionsInput({ questions, onChange, onDirect }) {
  const [draft, setDraft] = useState('')
  function add() {
    const t = draft.trim()
    if (!t) return
    onChange([...questions, { id: newId(), text: t }])
    setDraft('')
  }
  return (
    <div className="tm-list">
      <ul className="tm-items">
        {questions.map((q, i) => (
          <li key={q.id} className="tm-item">
            <input className="tm-item-input" value={q.text} aria-label={`question ${i + 1}`}
              onChange={(e) => onChange(questions.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)))} />
            {q.state && q.state !== 'open' ? <span className="tm-muted">{STATES[q.state]}</span>
              : <button type="button" className="tm-x" aria-label="remove question" onClick={() => onChange(questions.filter((x) => x.id !== q.id))}>×</button>}
          </li>
        ))}
      </ul>
      <input className="tm-add" value={draft} placeholder="a question to work out" aria-label="add question" autoFocus
        onChange={(e) => setDraft(e.target.value)} onBlur={add}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
      {!questions.length && (
        <div className="tm-inline-actions">
          <button type="button" className="tm-text-btn" onClick={onDirect}>nothing — I know what I want to try, go straight on</button>
        </div>
      )}
    </div>
  )
}

/** Pick the next focus: an open question, the aim itself, a new question, or stop. */
export function PickInput({ brief, value, onPick, onAdd, onStop, allowStop }) {
  const [draft, setDraft] = useState('')
  const aim = brief.questions.find((q) => q.isAim)
  const open = brief.questions.filter((q) => !q.isAim && q.state === 'open')
  const others = brief.questions.filter((q) => !q.isAim && q.state !== 'open')
  const picked = brief.questions.find((q) => q.id === value)
  return (
    <div className="tm-pick">
      {picked && <p className="tm-muted">chosen: {picked.text}</p>}
      <div className="tm-choices tm-choices-col" role="radiogroup" aria-label="next question">
        {open.map((q) => (
          <button key={q.id} type="button" role="radio" aria-checked={value === q.id}
            className={`tm-choice${value === q.id ? ' active' : ''}`} onClick={() => onPick(q.id)}>
            <span>{q.text}</span>
            {q.from && <span className="tm-choice-desc">from: {brief.questions.find((x) => x.id === q.from)?.text || 'the aim'}</span>}
          </button>
        ))}
        {(!aim || aim.order === 0) && (
          <button type="button" role="radio" aria-checked={value === 'aim'} className={`tm-choice${value === 'aim' ? ' active' : ''}`} onClick={() => onPick('aim')}>
            <span>the aim itself</span>
            <span className="tm-choice-desc">{brief.aim.aim}</span>
          </button>
        )}
      </div>
      {others.length > 0 && (
        <ul className="tm-qstates">
          {others.map((q) => <li key={q.id}><span className="tm-muted">{STATES[q.state]}:</span> {q.text}</li>)}
        </ul>
      )}
      <div className="tm-pick-add">
        <input className="tm-add" value={draft} placeholder="or add a new question" aria-label="add a new question"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); onAdd(draft.trim()); setDraft('') } }} />
      </div>
      {allowStop && (
        <div className="tm-inline-actions">
          <button type="button" className="tm-text-btn" onClick={onStop}>stop for now and see the brief</button>
        </div>
      )}
    </div>
  )
}
