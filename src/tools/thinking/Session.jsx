// Thinking Machine — one brief as a running conversation: past questions and
// answers stay visible above, the current question sits at the bottom.
import { useState, useEffect, useRef, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  STEPS, STAGES, resolve, isAnswered, displayValue, buildBrief, briefToText, sessionTitle,
} from './flow'
import { getBrief, saveBrief } from './api'
import { TextInput, ChoiceInput, ListInput, PairInput, HmwInput, CardsInput, SelectInput, TasksInput } from './inputs'

const stepIndex = (id) => Math.max(0, STEPS.findIndex((s) => s.id === id))
const stageLabel = (id) => STAGES.find((s) => s.id === id)?.label || id

export default function Session({ id }) {
  const navigate = useNavigate()
  const [loaded, setLoaded] = useState(false)
  const [missing, setMissing] = useState(false)
  const [answers, setAnswers] = useState(null)
  const [current, setCurrent] = useState(0) // index of the step with the open input
  const [reached, setReached] = useState(0) // furthest step index shown; STEPS.length = brief
  const [skipped, setSkipped] = useState([])
  const [hmwStale, setHmwStale] = useState(false)
  const [saveState, setSaveState] = useState('saved') // saved | saving | error
  const [helpOpen, setHelpOpen] = useState(false)
  const [includeOpen, setIncludeOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const dirty = useRef(false)
  const timer = useRef(null)
  const bottomRef = useRef(null)

  // Load
  useEffect(() => {
    getBrief(id)
      .then((b) => {
        setAnswers(b.answers)
        const idx = b.step === 'brief' ? STEPS.length : stepIndex(b.step)
        setCurrent(Math.min(idx, STEPS.length))
        setReached(b.reached ?? idx)
        setSkipped(b.skipped || [])
        setHmwStale(Boolean(b.hmwStale))
        setLoaded(true)
      })
      .catch(() => setMissing(true))
  }, [id])

  // Autosave (debounced), retry on failure
  const persist = useCallback(async () => {
    if (!answers) return
    setSaveState('saving')
    try {
      await saveBrief(id, {
        answers,
        step: current >= STEPS.length ? 'brief' : STEPS[current].id,
        reached,
        skipped,
        hmwStale,
      })
      dirty.current = false
      setSaveState('saved')
    } catch {
      setSaveState('error')
      timer.current = setTimeout(persist, 5000)
    }
  }, [id, answers, current, reached, skipped, hmwStale])

  useEffect(() => {
    if (!loaded || !dirty.current) return
    clearTimeout(timer.current)
    timer.current = setTimeout(persist, 600)
    return () => clearTimeout(timer.current)
  }, [loaded, persist])

  // Keep the active question in view
  useEffect(() => {
    if (loaded) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [current, loaded])

  useEffect(() => { setHelpOpen(false) }, [current])

  function mark() { dirty.current = true }

  function setAnswer(key, value) {
    // Changing who/outcome after writing a "How might we" question: invite a review
    if ((key === 'who' || key === 'outcome') && answers.hmw && value !== answers[key]) setHmwStale(true)
    if (key === 'hmw') setHmwStale(false)
    setAnswers((prev) => ({ ...prev, [key]: value }))
    setSkipped((s) => s.filter((x) => x !== key))
    mark()
  }

  function goTo(idx) {
    setCurrent(idx)
    setReached((r) => Math.max(r, idx))
    mark()
  }

  function next() {
    const step = STEPS[current]
    if (step && !isAnswered(step, answers)) setSkipped((s) => (s.includes(step.id) ? s : [...s, step.id]))
    goTo(current + 1)
  }

  function back() { if (current > 0) goTo(current - 1) }

  if (missing) {
    return (
      <main className="page">
        <Link to="/tools/thinking" className="back-link">&lt; back</Link>
        <p className="tm-empty">That brief doesn't exist any more.</p>
      </main>
    )
  }
  if (!loaded) return <main className="page"><p className="tm-muted">loading…</p></main>

  const visible = STEPS.slice(0, Math.min(reached, STEPS.length - 1) + 1)
  const showBrief = reached >= STEPS.length

  return (
    <main className="page tm">
      <div className="tm-top">
        <Link to="/tools/thinking" className="back-link">&lt; all briefs</Link>
        <span className={`tm-save ${saveState}`} aria-live="polite">
          {saveState === 'saved' ? 'saved' : saveState === 'saving' ? 'saving…' : 'not saved — retrying'}
        </span>
      </div>

      <ol className="tm-log">
        {visible.map((step, i) => {
          const stageStart = i === 0 || STEPS[i - 1].stage !== step.stage
          const isCurrent = i === current
          const answered = isAnswered(step, answers)
          return (
            <li key={step.id} className={`tm-entry${isCurrent ? ' current' : ''}`}>
              {stageStart && <span className="tm-stage">{stageLabel(step.stage)}</span>}
              {isCurrent ? (
                <ActiveStep
                  step={step}
                  answers={answers}
                  setAnswer={setAnswer}
                  helpOpen={helpOpen}
                  setHelpOpen={setHelpOpen}
                  hmwStale={hmwStale}
                  onJump={(sid) => goTo(stepIndex(sid))}
                  onBack={i > 0 ? back : null}
                  onNext={next}
                  isLast={i === STEPS.length - 1}
                />
              ) : (
                <button type="button" className="tm-past" onClick={() => goTo(i)} aria-label={`edit: ${resolve(step.question, answers)}`}>
                  <span className="tm-past-q">{resolve(step.question, answers)}</span>
                  <span className={`tm-past-a${answered ? '' : ' open'}`}>
                    {answered ? displayValue(step, answers) : 'to explore'}
                    {step.id === 'hmw' && hmwStale && answered && <span className="tm-flag"> · worth a re-read</span>}
                  </span>
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {showBrief && current >= STEPS.length && (
        <BriefView
          answers={answers}
          includeOpen={includeOpen}
          setIncludeOpen={setIncludeOpen}
          copied={copied}
          setCopied={setCopied}
          onBack={() => goTo(STEPS.length - 1)}
          onDone={() => navigate('/tools/thinking')}
        />
      )}
      {showBrief && current < STEPS.length && (
        <button type="button" className="tm-text-btn tm-to-brief" onClick={() => goTo(STEPS.length)}>see the brief ↓</button>
      )}
      <div ref={bottomRef} />
    </main>
  )
}

function ActiveStep({ step, answers, setAnswer, helpOpen, setHelpOpen, hmwStale, onJump, onBack, onNext, isLast }) {
  const value = answers[step.id]
  const question = resolve(step.question, answers)
  const hint = resolve(step.hint, answers)
  const help = (step.help || []).map((h) => resolve(h, answers))
  const onChange = (v) => setAnswer(step.id, v)

  let input
  switch (step.type) {
    case 'choice': input = <ChoiceInput step={step} value={value} onChange={onChange} onContinue={onNext} />; break
    case 'list': input = <ListInput value={value} onChange={onChange} placeholder={step.placeholder} />; break
    case 'pair': input = <PairInput step={step} answers={answers} onChangeField={setAnswer} />; break
    case 'hmw': input = <HmwInput value={value} onChange={onChange} answers={answers} stale={hmwStale} onContinue={onNext} />; break
    case 'cards': input = <CardsInput value={value} onChange={onChange} />; break
    case 'select': input = <SelectInput answers={answers} value={value} onChange={onChange} onJump={onJump} />; break
    case 'tasks': input = <TasksInput value={value} onChange={onChange} />; break
    default: input = <TextInput step={step} value={value} onChange={onChange} onContinue={onNext} />
  }

  const answered = isAnswered(step, answers)
  return (
    <div className="tm-active">
      <h2 className="tm-q" id={`q-${step.id}`}>{question}</h2>
      {hint && <p className="tm-hint">{hint}</p>}
      <div className="tm-answer" aria-labelledby={`q-${step.id}`}>{input}</div>
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
        <button type="button" className="tm-btn primary" onClick={onNext}>
          {isLast ? 'finish' : answered ? 'continue' : 'come back to this'}
        </button>
        {(step.type === 'text' || step.type === 'hmw') && <span className="tm-kbd">enter to continue · shift+enter for a new line</span>}
      </div>
    </div>
  )
}

function BriefView({ answers, includeOpen, setIncludeOpen, copied, setCopied, onBack, onDone }) {
  const md = buildBrief(answers, { includeOpen })
  const title = sessionTitle(answers)
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'brief'

  async function copy() {
    try {
      await navigator.clipboard.writeText(md)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable: user can select the text */ }
  }
  function download(ext) {
    const body = ext === 'md' ? md : briefToText(md)
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }))
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
          <button type="button" className="tm-text-btn" onClick={onBack}>edit answers</button>
          <button type="button" className="tm-text-btn" onClick={onDone}>done</button>
        </div>
      </div>
    </section>
  )
}

/** Tiny renderer for the brief's own markdown: headings, bullets, bold, "To explore". */
function renderMarkdown(md) {
  const out = []
  let list = null
  const inline = (t) => t.split(/(\*\*[^*]+\*\*|_To explore_)/).map((part, i) => {
    if (part.startsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part === '_To explore_') return <em key={i} className="tm-open">To explore</em>
    return part
  })
  const flush = () => { if (list) { out.push(<ul key={out.length}>{list}</ul>); list = null } }
  md.split('\n').forEach((line, i) => {
    if (line.startsWith('# ')) { flush(); out.push(<h2 key={i} className="article-heading">{line.slice(2)}</h2>) }
    else if (line.startsWith('## ')) { flush(); out.push(<h3 key={i}>{line.slice(3)}</h3>) }
    else if (line.startsWith('- ')) { list = list || []; list.push(<li key={i}>{inline(line.slice(2))}</li>) }
    else if (line.trim()) { flush(); out.push(<p key={i}>{inline(line)}</p>) }
    else flush()
  })
  flush()
  return out
}
