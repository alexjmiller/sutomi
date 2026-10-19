// Thinking Machine — one brief as a running conversation. Past questions and answers
// stay visible above (grouped by aim / focus), the current question sits at the bottom.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  STATES, buildSteps, getIn, setIn, isAnswered, displayValue, defaultHmw, buildBrief, briefToText,
  briefTitle, question, newQuestion, migrateV1,
} from './flow'
import { getBrief, saveBrief } from './api'
import {
  TextInput, ChoiceInput, RouteInput, ListInput, PairInput, HmwInput, CardsInput, SelectInput,
  TasksInput, LogInput, QuestionsInput, PickInput, FlushContext,
} from './inputs'

export default function Session({ id }) {
  const navigate = useNavigate()
  const [brief, setBriefState] = useState(null)
  const [missing, setMissing] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const [helpOpen, setHelpOpen] = useState(false)
  const [includeOpen, setIncludeOpen] = useState(true)
  const [renaming, setRenaming] = useState(null)
  const dirty = useRef(false)
  const timer = useRef(null)
  const bottomRef = useRef(null)
  // Inputs with an unsent "add another" draft register a flush here; every move commits them first.
  const flushers = useRef(new Set())
  const registerFlush = useCallback((fn) => { flushers.current.add(fn); return () => flushers.current.delete(fn) }, [])
  const commitDrafts = () => flushers.current.forEach((fn) => fn())

  // Load (migrating v1 briefs on the way in)
  useEffect(() => {
    getBrief(id)
      .then((b) => {
        if (b.version !== 2) { b = migrateV1(b); dirty.current = true }
        setBriefState(b)
      })
      .catch(() => setMissing(true))
  }, [id])

  // Autosave, debounced, retry on failure
  const persist = useCallback(async () => {
    if (!brief) return
    setSaveState('saving')
    try {
      await saveBrief(id, brief)
      dirty.current = false
      setSaveState('saved')
    } catch {
      setSaveState('error')
      timer.current = setTimeout(persist, 5000)
    }
  }, [id, brief])

  useEffect(() => {
    if (!brief || !dirty.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 600)
    return () => clearTimeout(timer.current)
  }, [brief, persist])

  useEffect(() => {
    if (brief) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    setHelpOpen(false)
  }, [brief?.current]) // eslint-disable-line react-hooks/exhaustive-deps

  /** All state changes go through here so the brief stays one consistent object. */
  function update(fn) {
    dirty.current = true
    setBriefState((prev) => fn(prev))
  }

  // ---- helpers on a brief object (pure) ----
  const visit = (b, key) => ({ ...b, current: key, visited: b.visited.includes(key) ? b.visited : [...b.visited, key] })

  function ensureAim(b) {
    if (b.questions.some((q) => q.isAim)) return b
    return { ...b, questions: [...b.questions, newQuestion(b.aim.aim, { isAim: true })] }
  }

  function startQuestion(b, qid) {
    let n = { ...b }
    n.questions = n.questions.map((q) => (q.id === qid ? { ...q, state: 'active', order: q.order || n.loopCount + 1 } : q))
    if (!b.questions.find((q) => q.id === qid)?.order) n.loopCount = b.loopCount + 1
    const first = buildSteps(n).find((s) => s.section === qid)
    return first ? visit(n, first.key) : n
  }

  function advance(b) {
    const steps = buildSteps(b)
    const i = steps.findIndex((s) => s.key === b.current)
    const nxt = steps[i + 1]
    return nxt ? visit(b, nxt.key) : visit(b, 'brief')
  }

  // ---- actions ----
  function setValue(step, value) {
    update((b) => {
      let n = setIn(b, step.path, value)
      if (step.key === 'aim.aim') n.questions = n.questions.map((q) => (q.isAim ? { ...q, text: value } : q))
      if (step.key.endsWith('.exit')) {
        const qid = step.section
        n.questions = n.questions.map((q) => (q.id === qid ? { ...q, state: value || 'active' } : q))
      }
      return n
    })
  }

  function setQuestions(items) {
    update((b) => {
      const aim = b.questions.filter((q) => q.isAim)
      const kept = items.map((it) => {
        const existing = b.questions.find((q) => q.id === it.id)
        return existing ? { ...existing, text: it.text } : newQuestion(it.text)
      })
      const others = b.questions.filter((q) => !q.isAim && (q.from || q.order > 0) && !kept.some((k) => k.id === q.id))
      return { ...b, questions: [...aim, ...kept, ...others] }
    })
  }

  function goDirect() {
    commitDrafts()
    update((b) => {
      let n = ensureAim({ ...b, aim: { ...b.aim, discovery: 'direct' } })
      return startQuestion(n, n.questions.find((q) => q.isAim).id)
    })
  }

  function pick(step, choice) {
    update((b) => {
      let n = ensureAim(b)
      const qid = choice === 'aim' ? n.questions.find((q) => q.isAim).id : choice
      n = setIn(n, step.path, qid)
      return startQuestion(n, qid)
    })
  }

  function addQuestion(step, text) {
    update((b) => {
      const from = step.section === 'aim' ? null : step.section
      return { ...b, questions: [...b.questions, newQuestion(text, { from })] }
    })
  }

  function stop(step) {
    commitDrafts()
    update((b) => visit(setIn(b, step.path, 'stop'), 'brief'))
  }

  function next() {
    commitDrafts()
    update((b) => {
      let n = b
      const step = buildSteps(n).find((s) => s.key === n.current)
      if (!step) return visit(n, 'brief')
      if (step.type === 'questions' && n.aim.discovery !== 'direct') n = { ...n, aim: { ...n.aim, discovery: 'questions' } }
      if (step.key.endsWith('.supersede')) {
        const q = question(n, step.section)
        const text = (q.loop.supersede || '').trim()
        if (text) {
          const existing = q.loop.supersededBy && question(n, q.loop.supersededBy)
          if (existing) n = { ...n, questions: n.questions.map((x) => (x.id === existing.id ? { ...x, text } : x)) }
          else {
            const nq = newQuestion(text, { from: q.id })
            n = { ...n, questions: n.questions.map((x) => (x.id === q.id ? { ...x, loop: { ...x.loop, supersededBy: nq.id } } : x)).concat(nq) }
          }
        }
      }
      return advance(n)
    })
  }

  function goTo(key) { commitDrafts(); update((b) => visit(b, key)) }

  function back() {
    commitDrafts()
    update((b) => {
      const keys = buildSteps(b).filter((s) => b.visited.includes(s.key)).map((s) => s.key)
      const i = keys.indexOf(b.current)
      return i > 0 ? visit(b, keys[i - 1]) : b
    })
  }

  function rename(qid, text) {
    update((b) => ({ ...b, questions: b.questions.map((q) => (q.id === qid ? { ...q, text } : q)) }))
  }

  // ---- render ----
  if (missing) {
    return (
      <main className="page">
        <Link to="/tools/thinking" className="back-link">&lt; back</Link>
        <p className="tm-empty">That brief doesn't exist any more.</p>
      </main>
    )
  }
  if (!brief) return <main className="page"><p className="tm-muted">loading…</p></main>

  const steps = buildSteps(brief)
  const visible = steps.filter((s) => brief.visited.includes(s.key) || s.key === brief.current)
  const atBrief = brief.current === 'brief'
  const lastPick = [...visible].reverse().find((s) => s.type === 'pick')

  return (
    <FlushContext.Provider value={registerFlush}>
    <main className="page tm">
      <div className="tm-top">
        <Link to="/tools/thinking" className="back-link">&lt; all briefs</Link>
        <span className={`tm-save ${saveState}`} aria-live="polite">
          {saveState === 'saved' ? 'saved' : saveState === 'saving' ? 'saving…' : 'not saved — retrying'}
        </span>
      </div>

      <ol className="tm-log">
        {visible.map((step, i) => {
          const sectionStart = i === 0 || visible[i - 1].section !== step.section
          const isCurrent = step.key === brief.current
          const answered = isAnswered(brief, step)
          const q = step.section !== 'aim' ? question(brief, step.section) : null
          return (
            <li key={step.key} className={`tm-entry${isCurrent ? ' current' : ''}`}>
              {sectionStart && (step.section === 'aim'
                ? <span className="tm-stage">aim</span>
                : <FocusHeader brief={brief} q={q} renaming={renaming === q.id} onRename={(t) => rename(q.id, t)} onToggleRename={() => setRenaming(renaming === q.id ? null : q.id)} />)}
              {isCurrent ? (
                <ActiveStep
                  brief={brief} step={step} q={q}
                  setValue={setValue} setQuestions={setQuestions} goDirect={goDirect}
                  pick={pick} addQuestion={addQuestion} stop={stop}
                  helpOpen={helpOpen} setHelpOpen={setHelpOpen}
                  onBack={i > 0 ? back : null} onNext={next} goTo={goTo}
                />
              ) : (
                <button type="button" className="tm-past" onClick={() => goTo(step.key)} aria-label={`edit: ${step.question}`}>
                  <span className="tm-past-q">{step.question}</span>
                  <span className={`tm-past-a${answered ? '' : ' open'}`}>{answered ? displayValue(brief, step) : 'to explore'}</span>
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {atBrief ? (
        <BriefView
          brief={brief}
          includeOpen={includeOpen}
          setIncludeOpen={setIncludeOpen}
          onContinue={lastPick ? () => goTo(lastPick.key) : null}
          onDone={() => navigate('/tools/thinking')}
        />
      ) : (
        brief.questions.some((q) => q.order > 0) && (
          <button type="button" className="tm-text-btn tm-to-brief" onClick={() => goTo('brief')}>see the brief so far ↓</button>
        )
      )}
      <div ref={bottomRef} />
    </main>
    </FlushContext.Provider>
  )
}

function FocusHeader({ brief, q, renaming, onRename, onToggleRename }) {
  if (!q) return null
  const parent = q.from ? question(brief, q.from) : null
  return (
    <div className="tm-focus">
      <span className="tm-focus-label">{q.isAim ? 'working on the aim' : 'focus'}</span>
      <div className="tm-focus-title">
        {renaming && !q.isAim
          ? <input value={q.text} autoFocus aria-label="rename question" onChange={(e) => onRename(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onToggleRename() }} onBlur={onToggleRename} />
          : q.text}
      </div>
      <div className="tm-focus-meta">
        <span>{STATES[q.state]}</span>
        {parent && <span>from: {parent.text}</span>}
        {!q.isAim && !renaming && <button type="button" onClick={onToggleRename}>refine the wording</button>}
      </div>
    </div>
  )
}

function ActiveStep({ brief, step, q, setValue, setQuestions, goDirect, pick, addQuestion, stop, helpOpen, setHelpOpen, onBack, onNext, goTo }) {
  const value = step.path ? getIn(brief, step.path) : undefined
  const onChange = (v) => setValue(step, v)
  const label = step.question

  let input
  switch (step.type) {
    case 'choice': input = <ChoiceInput options={step.options} value={value} onChange={onChange} label={label} onContinue={onNext} />; break
    case 'route': input = <RouteInput value={value} onChange={onChange} label={label} onContinue={onNext} />; break
    case 'list': input = <ListInput value={value} onChange={onChange} placeholder={step.placeholder} />; break
    case 'pair': input = <PairInput fields={step.fields} values={Object.fromEntries(step.fields.map((f) => [f.key, getIn(brief, f.path)]))} onChangeField={(f, v) => setValue({ ...step, path: f.path, key: `${step.key}.${f.key}` }, v)} />; break
    case 'hmw': input = <HmwInput value={value} onChange={onChange} template={defaultHmw(brief, q)} onContinue={onNext} />; break
    case 'cards': input = <CardsInput value={value} onChange={onChange} noun={step.key.endsWith('.options') ? 'option' : 'idea'} />; break
    case 'select': {
      const sourceKey = step.key.replace(/\.(selected|choice)$/, step.key.endsWith('.choice') ? '.options' : '.ideas')
      input = <SelectInput items={getIn(brief, step.from)} value={value} onChange={onChange} emptyText="Nothing to choose from yet." onEmptyAction={() => goTo(sourceKey)} emptyActionLabel="Add some first" />
      break
    }
    case 'tasks': input = <TasksInput value={value} onChange={onChange} />; break
    case 'log': input = <LogInput value={value} onChange={onChange} />; break
    case 'questions': input = <QuestionsInput questions={brief.questions.filter((x) => !x.isAim && !x.from)} onChange={setQuestions} onDirect={goDirect} />; break
    case 'pick': input = <PickInput brief={brief} value={value} onPick={(c) => pick(step, c)} onAdd={(t) => addQuestion(step, t)} onStop={() => stop(step)} allowStop={step.allowStop} />; break
    default: input = <TextInput value={value} onChange={onChange} label={label} onContinue={onNext} />
  }

  const answered = isAnswered(brief, step)
  const help = step.help || []
  const isPick = step.type === 'pick'
  const isDirect = step.type === 'questions' && brief.aim.discovery === 'direct'
  return (
    <div className="tm-active">
      <h2 className="tm-q" id={`q-${step.key}`}>{step.question}</h2>
      {step.hint && <p className="tm-hint">{step.hint}</p>}
      <div className="tm-answer" aria-labelledby={`q-${step.key}`}>{input}</div>
      {step.example && <p className="tm-example">e.g. {step.example}</p>}
      {(help.length > 0 || step.why) && (
        <div className="tm-help">
          <button type="button" className="tm-text-btn" aria-expanded={helpOpen} onClick={() => setHelpOpen(!helpOpen)}>
            {helpOpen ? 'ok, thanks' : 'help me think about this'}
          </button>
          {helpOpen && (
            <div className="tm-help-body">
              {step.why && <p className="tm-why">{step.why}</p>}
              {help.length > 0 && <ul className="tm-prompts">{help.map((h) => <li key={h}>{h}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
      <div className="tm-controls">
        {onBack && <button type="button" className="tm-btn" onClick={onBack}>back</button>}
        {!isPick && !isDirect && (
          <button type="button" className="tm-btn primary" onClick={onNext}>{answered ? 'continue' : 'come back to this'}</button>
        )}
        {isDirect && <button type="button" className="tm-btn primary" onClick={goDirect}>continue</button>}
        {(step.type === 'text' || step.type === 'hmw') && <span className="tm-kbd">enter to continue · shift+enter for a new line</span>}
      </div>
    </div>
  )
}

function BriefView({ brief, includeOpen, setIncludeOpen, onContinue, onDone }) {
  const [copied, setCopied] = useState(false)
  const md = buildBrief(brief, { includeOpen })
  const slug = briefTitle(brief).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'brief'

  async function copy() {
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable: the text can be selected */ }
  }
  function download(ext) {
    const url = URL.createObjectURL(new Blob([ext === 'md' ? md : briefToText(md)], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.${ext}`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section className="tm-brief">
      <span className="tm-stage">brief</span>
      <div className="tm-brief-body">{renderMarkdown(md)}</div>
      <div className="tm-brief-actions">
        <label className="tm-check">
          <input type="checkbox" checked={includeOpen} onChange={(e) => setIncludeOpen(e.target.checked)} />
          include sections still to explore
        </label>
        <div className="tm-controls">
          <button type="button" className="tm-btn" onClick={copy}>{copied ? 'copied' : 'copy'}</button>
          <button type="button" className="tm-btn" onClick={() => download('md')}>download .md</button>
          <button type="button" className="tm-btn" onClick={() => download('txt')}>download .txt</button>
          {onContinue && <button type="button" className="tm-text-btn" onClick={onContinue}>keep working</button>}
          <button type="button" className="tm-text-btn" onClick={onDone}>done</button>
        </div>
      </div>
    </section>
  )
}

/** Tiny renderer for the brief's own markdown: headings, bullets, bold, italics, "To explore". */
function renderMarkdown(md) {
  const out = []
  let list = null
  const inline = (t) => t.split(/(\*\*[^*]+\*\*|_[^_]+_)/).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part === '_To explore_') return <em key={i} className="tm-open">To explore</em>
    if (part.startsWith('_') && part.endsWith('_') && part.length > 2) return <em key={i} className="tm-open">{part.slice(1, -1)}</em>
    return part
  })
  const flush = () => { if (list) { out.push(<ul key={out.length}>{list}</ul>); list = null } }
  md.split('\n').forEach((line, i) => {
    if (line.startsWith('# ')) { flush(); out.push(<h2 key={i} className="article-heading">{line.slice(2)}</h2>) }
    else if (line.startsWith('## ')) { flush(); out.push(<h3 key={i}>{line.slice(3)}</h3>) }
    else if (line.startsWith('### ')) { flush(); out.push(<h4 key={i}>{line.slice(4)}</h4>) }
    else if (line.startsWith('- ')) { list = list || []; list.push(<li key={i}>{inline(line.slice(2))}</li>) }
    else if (line.trim()) { flush(); out.push(<p key={i}>{inline(line)}</p>) }
    else flush()
  })
  flush()
  return out
}
