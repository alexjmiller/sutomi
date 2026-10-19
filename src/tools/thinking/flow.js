// Thinking Machine v2 — the question flow. Pure data + helpers, no React, no AI.
//
// A brief has one overall AIM and a list of QUESTIONS. The aim itself is a question
// (isAim). Each question can be worked on in a LOOP: what you know, what's in the way
// (the route), the route's own prompts, then learning, what it means for the aim, and
// an exit. Steps are generated from the brief state by buildSteps(); each has a stable
// key and a path into the brief. Conversation position is brief.current + brief.visited.

export const STATES = {
  open: 'to explore',
  active: 'in progress',
  answered: 'answered for now',
  parked: 'parked',
  superseded: 'became another question',
}

// "What's in the way right now?" — plain words, no framework vocabulary.
export const ROUTES = [
  { id: 'clarify', label: "I don't know what I actually want", output: 'criteria' },
  { id: 'find', label: "I don't know enough yet", output: 'tasks' },
  { id: 'explore', label: "I can't see the options", output: 'ideas' },
  { id: 'decide', label: "I can't choose", output: 'a choice' },
  { id: 'test', label: "I'm not sure it'll work", output: 'a test' },
  { id: 'do', label: 'I know what to do', output: 'tasks' },
  { id: 'open', label: 'not sure yet', output: '' },
]

export const START_OPTIONS = [
  { value: 'new', label: 'a new idea' },
  { value: 'existing', label: 'an existing problem' },
  { value: 'question', label: 'a question I need to answer' },
]

export const EXIT_OPTIONS = [
  { value: 'answered', label: 'answered for now' },
  { value: 'parked', label: 'park it' },
  { value: 'superseded', label: "it's become a different question" },
]

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function emptyBrief() {
  return {
    version: 2,
    aim: { start: '', aim: '', who: '', now: '', outcome: '', signs: [], discovery: '' },
    questions: [], // [{ id, text, isAim, from, state, order, helps, loop }]
    criteria: [], // shared output of "clarify" loops, used by "decide"
    picks: {}, // pick-step key -> question id | 'stop'
    loopCount: 0,
    current: 'aim.start',
    visited: ['aim.start'],
  }
}

export function emptyLoop() {
  return {
    know: '',
    route: '',
    reflect: '',
    need: '',
    how: '',
    hmw: '',
    ideas: [],
    selected: '',
    options: [],
    choice: '',
    reasons: '',
    assumptions: [],
    questions: [],
    test: '',
    expect: '',
    evidence: '',
    decide: '',
    forward: '',
    tasks: [],
    learning: [], // [{ date, text }]
    meaning: '',
    exit: '',
    supersede: '',
  }
}

export function newQuestion(text, extra = {}) {
  return { id: newId(), text, isAim: false, from: null, state: 'open', order: 0, helps: '', loop: emptyLoop(), ...extra }
}

// ---------- path helpers ----------

export function getIn(obj, path) {
  return path.reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

export function setIn(obj, path, value) {
  if (!path.length) return value
  const [k, ...rest] = path
  const base = Array.isArray(obj) ? obj.slice() : { ...obj }
  base[k] = setIn(obj ? obj[k] : undefined, rest, value)
  return base
}

/** Path to a question object inside the brief (questions are an array, so find the index). */
export function qPath(brief, qid) {
  const i = brief.questions.findIndex((q) => q.id === qid)
  return ['questions', i]
}

export function resolve(field, brief) {
  return typeof field === 'function' ? field(brief) : field
}

const who = (b) => (b.aim.who || 'them').trim().replace(/\.$/, '')
const outcome = (b) => (b.aim.outcome || 'what you want').trim().replace(/\.$/, '')

export const aimQuestion = (b) => b.questions.find((q) => q.isAim) || null
export const question = (b, id) => b.questions.find((q) => q.id === id) || null
export const startedQuestions = (b) => b.questions.filter((q) => q.order > 0).sort((a, c) => a.order - c.order)
export const openQuestions = (b) => b.questions.filter((q) => q.state === 'open')
export const inProgress = (b) => b.questions.filter((q) => q.state === 'active')

export function defaultHmw(b, q) {
  const target = q && !q.isAim && q.helps ? q.helps.trim().replace(/\.$/, '') : outcome(b)
  return `How might we help ${who(b)} to ${target}?`
}

export function briefTitle(b) {
  const t = (b.aim?.aim || '').trim()
  if (!t) return 'untitled thinking'
  return t.length > 60 ? t.slice(0, 57).trimEnd() + '…' : t
}

// ---------- steps ----------

const step = (key, path, def) => ({ key, path, ...def })

function aimSteps(b) {
  const s = b.aim.start
  return [
    step('aim.start', ['aim', 'start'], {
      section: 'aim',
      type: 'choice',
      options: START_OPTIONS,
      question: 'What do you want to work on?',
      why: 'The wording of a few early questions changes slightly depending on your starting point.',
    }),
    step('aim.aim', ['aim', 'aim'], {
      section: 'aim',
      type: 'text',
      question: s === 'new' ? "What's the idea?" : s === 'question' ? "What's the question?" : "What's the problem?",
      hint: 'In plain language, as you would say it to a friend. This becomes the title of your brief.',
      example: s === 'question' ? 'How do I find a job that suits me?' : 'Our onboarding could be better.',
      help: ['What prompted this?', 'If you had to say it in one sentence, what would it be?', "What's the simplest version of this?"],
    }),
    step('aim.who', ['aim', 'who'], {
      section: 'aim',
      type: 'text',
      question: 'Who is it for?',
      hint: 'Who would benefit or experience the change? It could be you.',
      example: s === 'question' ? 'Me.' : 'New team members.',
      help: ['Who notices this most?', 'Who would be the first to try it?', 'Who else is affected?'],
    }),
    step('aim.now', ['aim', 'now'], {
      section: 'aim',
      type: 'text',
      question: s === 'new' ? 'What opportunity do you see?' : s === 'question' ? 'Where are you with it at the moment?' : "What's difficult or missing at the moment?",
      hint: "What's happening now? What do you know for certain, and what are you assuming?",
      example: s === 'question' ? "I've been applying to anything that looks vaguely right and getting nowhere." : 'They struggle to find information and are unsure whom to ask.',
      help: ['What have you already tried?', 'What happens if nothing changes?', 'What have you learned from previous experience?'],
    }),
    step('aim.outcome', ['aim', 'outcome'], {
      section: 'aim',
      type: 'text',
      question: 'What would you like to be true once this is sorted?',
      hint: `Describe the change for ${who(b)}, not the thing you'll make. "Write a welcome guide" is an activity; "new starters find what they need" is an outcome.`,
      example: s === 'question' ? "I'm in a job that fits how I like to work and pays enough." : 'New team members feel confident getting started in their first week.',
      help: ["Describe a day when it's working well.", `What would be different for ${who(b)}?`, 'What would stop happening?'],
    }),
    step('aim.signs', ['aim', 'signs'], {
      section: 'aim',
      type: 'list',
      placeholder: 'a sign of success',
      question: 'How would you know?',
      hint: 'Signs you could see, hear, or count. Add as many as you like.',
      example: 'They can find essential information and know where to get support.',
      help: ['What would you see or hear?', 'What could you count?', 'What would people say?'],
    }),
    step('aim.discovery', ['aim', 'discovery'], {
      section: 'aim',
      type: 'questions',
      question: 'To make progress on this, what do you need to work out first?',
      hint: 'Collect the smaller questions. Or, if you already know what you want to try, go straight on and work on the aim itself.',
      example: 'What do I need from a job? What kinds of jobs might meet those needs? Where can I find them?',
      why: 'A broad aim often hides smaller questions that need answering first. Naming them lets you pick a useful focus and come back to the aim with what you learn.',
      help: ['What is unclear at the moment?', 'What would you need to know before choosing what to do?', 'What needs deciding?', 'What have you already learned from previous experience?'],
    }),
  ]
}

function routeSteps(b, q) {
  const p = (...k) => [...qPath(b, q.id), 'loop', ...k]
  const k = (f) => `q.${q.id}.${f}`
  const sec = q.id
  switch (q.loop.route) {
    case 'clarify':
      return [
        step(k('reflect'), p('reflect'), {
          section: sec, type: 'text',
          question: 'Think back over your experience of this. What was good, difficult, or missing?',
          hint: 'Specific moments are more useful than general impressions.',
          example: 'The last job paid well but I never saw the result of my work. The one before was chaotic but I liked the people.',
          help: ['When did it go well? What was different?', 'What do you keep coming back to?', 'What would you refuse next time?'],
        }),
        step(k('criteria'), ['criteria'], {
          section: sec, type: 'list', placeholder: 'something you need',
          question: 'What does that tell you that you need?',
          hint: 'Essentials first, then nice-to-haves. These criteria stay with the brief and help you choose later.',
          example: 'Seeing the result of my work. People I can learn from. At least £X.',
          help: ['Which of these are essential, and which are preferences?', 'What would you give up to get the others?'],
        }),
      ]
    case 'find':
      return [
        step(k('need'), p('need'), {
          section: sec, type: 'text',
          question: 'What exactly do you need to find out?',
          hint: 'What is missing that stops you deciding or acting?',
          example: 'Which roles actually involve the kind of work I want, and what they pay.',
        }),
        step(k('how'), p('how'), {
          section: sec, type: 'text',
          question: 'Where would you look, or who would you ask?',
          example: 'Job listings for three roles, and two people who do that work.',
          help: ['Who already knows this?', "What's the quickest way to a rough answer?"],
        }),
        step(k('tasks'), p('tasks'), {
          section: sec, type: 'tasks',
          question: 'What are the first few tasks?',
          hint: 'Just enough to get going. Come back to record what you found.',
        }),
      ]
    case 'explore':
      return [
        step(k('hmw'), p('hmw'), {
          section: sec, type: 'hmw',
          question: 'How might we…',
          hint: 'One open question to invite several answers. Start from the template or write your own.',
          example: 'How might we help new team members find what they need and feel supported in their first week?',
        }),
        step(k('ideas'), p('ideas'), {
          section: sec, type: 'cards',
          question: 'What could we try?',
          hint: 'Collect first, judge later. One idea is fine if that is all you have.',
          help: ['What is the simplest thing we could try?', 'What is a different way to approach this?', 'What could we do with what we already have?', 'What else might achieve the same outcome?'],
        }),
        step(k('selected'), p('selected'), {
          section: sec, type: 'select', from: p('ideas'),
          question: 'Which idea would you like to explore first?',
          hint: 'The others stay in the brief for later.',
          help: ['Which could make a useful difference?', 'Which is practical to try?', 'Which would help you learn something important?'],
        }),
      ]
    case 'decide':
      return [
        step(k('options'), p('options'), {
          section: sec, type: 'cards',
          question: 'What are the options?',
          hint: 'Each as a card. A short note on each is optional.',
        }),
        step(k('criteria'), ['criteria'], {
          section: sec, type: 'list', placeholder: 'something that matters',
          question: 'What matters in choosing?',
          hint: 'Your criteria. Anything you worked out earlier is already here; edit freely.',
          help: ['Which of these are essential?', 'What would you regret ignoring?'],
        }),
        step(k('choice'), p('choice'), {
          section: sec, type: 'select', from: p('options'),
          question: 'Which option, for now?',
          hint: 'Compare each against the criteria above. "For now" is fine.',
        }),
        step(k('reasons'), p('reasons'), {
          section: sec, type: 'text',
          question: 'What tipped it?',
          hint: 'Your reasoning, in a sentence or two, so you can revisit it later.',
        }),
      ]
    case 'test':
      return [
        step(k('assumptions'), null, {
          section: sec, type: 'pair',
          fields: [
            { key: 'assumptions', path: p('assumptions'), label: 'assumptions', placeholder: 'something that needs to be true' },
            { key: 'questions', path: p('questions'), label: 'open questions', placeholder: "something you don't know yet" },
          ],
          question: 'What needs to be true for this to work?',
          hint: '"I don’t know yet" is a fine answer: capture it as an open question.',
          example: 'Assuming: access to a named person will help starters get useful answers.',
          help: ['What are you taking for granted?', 'What would you want to find out first?', 'What would make it fail?'],
        }),
        step(k('test'), p('test'), {
          section: sec, type: 'text',
          question: 'What is the smallest useful test you could run?',
          hint: 'Something you could try soon that still tells you something.',
          example: 'Try the buddy approach with the next two starters.',
          help: ['What could you try this week?', "What's the smallest version that still tells you something?", 'Who needs to be involved?'],
        }),
        step(k('expect'), p('expect'), {
          section: sec, type: 'text',
          question: 'What do you expect to happen?',
          hint: 'Specific enough that you could be wrong.',
          example: 'Starters feel more confident and know whom to ask for help.',
        }),
        step(k('evidence'), p('evidence'), {
          section: sec, type: 'text',
          question: 'What will you observe or collect to see what happened?',
          example: 'Ask what helped, what remained confusing, and whether they knew where to get support.',
          help: ['Look back at your signs of success. Which could you check after the test?', 'What could you ask people?', 'What could you count or compare?'],
        }),
        step(k('decide'), p('decide'), {
          section: sec, type: 'text',
          question: 'What result would suggest you should continue, change the idea, or reconsider it?',
          example: 'If starters felt supported, continue and widen it. If not, adapt or try the next idea.',
        }),
        step(k('tasks'), p('tasks'), {
          section: sec, type: 'tasks',
          question: 'What do you need to do to run the test?',
          hint: 'Owners and dates are optional.',
        }),
      ]
    case 'do':
      return [
        step(k('tasks'), p('tasks'), {
          section: sec, type: 'tasks',
          question: 'What needs doing?',
          hint: 'The practical steps, in order. Owners and dates are optional.',
          help: ["What's the very first thing?", 'What could you do today?', 'Who else is involved?'],
        }),
      ]
    default:
      return [
        step(k('forward'), p('forward'), {
          section: sec, type: 'text',
          question: 'How could you move forward on this?',
          hint: "Any way at all. If it's unclear, write what you would try first.",
          help: ['Who could you talk to?', 'What would make it a bit clearer?', 'What would you do if you had to start today?'],
        }),
      ]
  }
}

function loopSteps(b, q) {
  const p = (...k) => [...qPath(b, q.id), ...k]
  const k = (f) => `q.${q.id}.${f}`
  const sec = q.id
  const steps = []
  if (!q.isAim) {
    steps.push(step(k('helps'), p('helps'), {
      section: sec, type: 'text',
      question: 'What would answering this help you decide or do?',
      why: 'This is the outcome for this question. It keeps the work tied to the overall aim.',
      example: 'Decide which kinds of jobs to look at, instead of applying to everything.',
    }))
    steps.push(step(k('know'), p('loop', 'know'), {
      section: sec, type: 'text',
      question: 'What do you already know about this?',
      hint: 'Facts you are sure of, and anything from previous experience.',
      help: ['What have you tried before?', 'What are you assuming rather than knowing?'],
    }))
  }
  steps.push(step(k('route'), p('loop', 'route'), {
    section: sec, type: 'route',
    question: "What's in the way right now?",
    hint: 'Pick the one that fits best. It decides which questions come next.',
    why: 'Different kinds of stuck need different kinds of help: clarifying what you want, finding things out, generating options, choosing, testing, or simply doing.',
  }))
  steps.push(...routeSteps(b, q))
  steps.push(step(k('learning'), p('loop', 'learning'), {
    section: sec, type: 'log',
    question: 'What did you learn?',
    hint: "Come back to this after you've done the work. Each entry is dated. Leave it for now if there's nothing yet.",
    example: 'Two of the three roles pay less than I need. The third looks promising.',
  }))
  steps.push(step(k('meaning'), p('loop', 'meaning'), {
    section: sec, type: 'text',
    question: 'What does this mean for your overall aim?',
    hint: 'Does it change what you want, who it is for, or what to work on next?',
  }))
  steps.push(step(k('exit'), p('loop', 'exit'), {
    section: sec, type: 'choice', options: EXIT_OPTIONS,
    question: 'Where does that leave this question?',
    hint: 'A useful partial answer counts.',
  }))
  if (q.loop.exit === 'superseded') {
    steps.push(step(k('supersede'), p('loop', 'supersede'), {
      section: sec, type: 'text',
      question: "What's the question now?",
      hint: 'The new question joins your list, linked to this one.',
    }))
  }
  steps.push(step(k('next'), ['picks', k('next')], {
    section: sec, type: 'pick',
    question: 'What do you need to work out next?',
    hint: 'Pick a question, add a new one, or stop for now and see the brief.',
    allowStop: true,
  }))
  return steps
}

/** The ordered steps for this brief's current state. */
export function buildSteps(b) {
  const steps = aimSteps(b)
  if (b.aim.discovery === 'questions') {
    steps.push(step('pick.aim', ['picks', 'pick.aim'], {
      section: 'aim', type: 'pick',
      question: 'Which question would help you move forward most if you answered it now?',
      hint: 'You can come back for the others.',
    }))
  }
  for (const q of startedQuestions(b)) steps.push(...loopSteps(b, q))
  return steps
}

export function stepByKey(b, key) {
  return buildSteps(b).find((s) => s.key === key) || null
}

/** Read a step's value. */
export function valueOf(b, s) {
  if (s.type === 'pair') return Object.fromEntries(s.fields.map((f) => [f.key, getIn(b, f.path) || []]))
  if (s.type === 'questions') return b.questions.filter((q) => !q.isAim)
  return s.path ? getIn(b, s.path) : undefined
}

export function isAnswered(b, s) {
  switch (s.type) {
    case 'pair': return s.fields.some((f) => (getIn(b, f.path) || []).length > 0)
    case 'questions': return b.aim.discovery === 'direct' || b.questions.some((q) => !q.isAim)
    case 'select': return Boolean((getIn(b, s.from) || []).find((i) => i.id === getIn(b, s.path)))
    case 'pick': return Boolean(getIn(b, s.path))
    case 'log': return (getIn(b, s.path) || []).length > 0
    case 'cards': case 'tasks': return (getIn(b, s.path) || []).some((i) => (i.title || i.text || '').trim())
    default: {
      const v = getIn(b, s.path)
      if (Array.isArray(v)) return v.length > 0
      return Boolean(v && String(v).trim())
    }
  }
}

/** Compact value for a past entry in the conversation. */
export function displayValue(b, s) {
  const v = s.path ? getIn(b, s.path) : undefined
  switch (s.type) {
    case 'choice': return s.options.find((o) => o.value === v)?.label || ''
    case 'route': return ROUTES.find((r) => r.id === v)?.label || ''
    case 'pair': return s.fields.filter((f) => (getIn(b, f.path) || []).length).map((f) => `${f.label}: ${getIn(b, f.path).join('; ')}`).join(' — ')
    case 'cards': return (v || []).map((i) => i.title).filter(Boolean).join('; ')
    case 'select': return (getIn(b, s.from) || []).find((i) => i.id === v)?.title || ''
    case 'tasks': return (v || []).map((t) => t.text).filter(Boolean).join('; ')
    case 'list': return (v || []).join('; ')
    case 'log': return (v || []).map((e) => `${e.date}: ${e.text}`).join('\n')
    case 'questions': {
      const qs = b.questions.filter((q) => !q.isAim && !q.from)
      if (!qs.length) return b.aim.discovery === 'direct' ? 'nothing — went straight on' : ''
      return qs.map((q) => q.text).join('; ')
    }
    case 'pick': return v === 'stop' ? 'stop for now' : question(b, v)?.text || ''
    default: return v || ''
  }
}

// ---------- the brief ----------

export const TO_EXPLORE = '_To explore_'

export function allTasks(b) {
  return startedQuestions(b).flatMap((q) => (q.loop.tasks || []).filter((t) => t.text).map((t) => ({ ...t, q })))
}

export function buildBrief(b, { includeOpen = true } = {}) {
  const out = []
  const push = (...l) => out.push(...l)
  const section = (heading, body, level = 2) => {
    const empty = !body || (Array.isArray(body) && !body.length)
    if (empty && !includeOpen) return
    push(`${'#'.repeat(level)} ${heading}`, '')
    if (empty) push(TO_EXPLORE)
    else if (Array.isArray(body)) body.forEach((x) => push(`- ${x}`))
    else push(body)
    push('')
  }
  const a = b.aim
  push(`# ${briefTitle(b)}`, '')
  section(a.start === 'existing' ? 'The problem' : a.start === 'question' ? 'The question' : 'The idea', a.aim)
  section('Who it is for', a.who)
  section(a.start === 'new' ? 'The opportunity' : 'Where things are', a.now)
  section('Intended outcome', a.outcome)
  section('Signs of success', a.signs)

  const meanings = startedQuestions(b).filter((q) => q.loop.meaning).map((q) => `${q.loop.meaning} _(from: ${q.text})_`)
  if (meanings.length) section('What we have learned about the aim', meanings)

  const qs = b.questions.filter((q) => !q.isAim)
  if (qs.length || includeOpen) {
    section('Questions', qs.map((q) => `${q.text} — ${STATES[q.state]}${q.from ? ` _(from: ${question(b, q.from)?.text || 'the aim'})_` : ''}`))
  }
  if (b.criteria.length) section('Criteria', b.criteria)

  for (const q of startedQuestions(b)) {
    push(`## ${q.isAim ? 'Working on the aim' : q.text}`, '')
    push(`_${STATES[q.state]}_`, '')
    if (q.helps) push(`**Answering this helps:** ${q.helps}`, '')
    if (q.loop.know) push(`**Already known:** ${q.loop.know}`, '')
    const L = q.loop
    const route = ROUTES.find((r) => r.id === L.route)
    if (route) push(`**In the way:** ${route.label}`, '')
    if (L.reflect) push(`**Looking back:** ${L.reflect}`, '')
    if (L.need) push(`**To find out:** ${L.need}`, '')
    if (L.how) push(`**Where to look:** ${L.how}`, '')
    if (L.hmw) push(`**How might we:** ${L.hmw}`, '')
    const ideas = (L.ideas || []).filter((i) => i.title)
    if (ideas.length) section('Ideas', ideas.map((i) => (i.description ? `${i.title} — ${i.description}` : i.title)), 3)
    const sel = ideas.find((i) => i.id === L.selected)
    if (sel) push(`**Selected idea:** ${sel.title}`, '')
    const options = (L.options || []).filter((i) => i.title)
    if (options.length) section('Options', options.map((i) => (i.description ? `${i.title} — ${i.description}` : i.title)), 3)
    const choice = options.find((i) => i.id === L.choice)
    if (choice) push(`**Choice for now:** ${choice.title}`, '')
    if (L.reasons) push(`**Reasoning:** ${L.reasons}`, '')
    if (L.assumptions?.length) section('Assumptions', L.assumptions, 3)
    if (L.questions?.length) section('Open questions', L.questions, 3)
    if (L.route === 'test') {
      const parts = [['What we will do', L.test], ['What we expect', L.expect], ['Evidence we will collect', L.evidence], ['How we will decide', L.decide]]
      if (parts.some(([, v]) => v) || includeOpen) {
        push('### Test', '')
        parts.forEach(([label, v]) => {
          if (v) push(`**${label}:** ${v}`, '')
          else if (includeOpen) push(`**${label}:** ${TO_EXPLORE}`, '')
        })
      }
    }
    if (L.forward) push(`**Way forward:** ${L.forward}`, '')
    const learning = (L.learning || []).filter((e) => e.text)
    if (learning.length) section('Learning', learning.map((e) => `${e.date}: ${e.text}`), 3)
    else if (includeOpen && q.state === 'active') push(`**Learning:** ${TO_EXPLORE}`, '')
    if (L.supersede) push(`**Became:** ${L.supersede}`, '')
  }

  const unresolved = qs.filter((q) => q.state === 'open' || q.state === 'active').map((q) => `${q.text} — ${STATES[q.state]}`)
  if (unresolved.length) section('Unresolved questions', unresolved)
  const tasks = allTasks(b)
  section('Next steps', tasks.map((t) => `[ ] ${t.text}${t.note ? ` (${t.note})` : ''}${t.q.isAim ? '' : ` — ${t.q.text}`}`))
  return out.join('\n').trim() + '\n'
}

export function briefToText(md) {
  return md
    .replace(/^# (.*)$/gm, (_, t) => `${t.toUpperCase()}\n${'='.repeat(t.length)}`)
    .replace(/^## (.*)$/gm, (_, t) => `${t}\n${'-'.repeat(t.length)}`)
    .replace(/^### (.*)$/gm, '$1:')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/_\(from: (.*?)\)_/g, '(from: $1)')
    .replace(/^_(.*)_$/gm, '$1')
    .replace(/^- \[ \] /gm, '[ ] ')
    .replace(/^- /gm, '• ')
    .replace(/_To explore_/g, 'To explore')
}

// ---------- migration from v1 (flat answers) ----------

export function migrateV1(old) {
  const a = old.answers || {}
  const b = emptyBrief()
  b.aim = { start: a.start || '', aim: a.idea || '', who: a.who || '', now: a.now || '', outcome: a.outcome || '', signs: a.signs || [], discovery: 'direct' }

  const aimQ = newQuestion(a.idea || '', { isAim: true, state: 'active', order: 1 })
  aimQ.loop.route = 'explore'
  aimQ.loop.hmw = a.hmw || ''
  aimQ.loop.ideas = a.ideas || []
  aimQ.loop.selected = a.selected || ''
  b.questions.push(aimQ)
  b.loopCount = 1

  const selected = (a.ideas || []).find((i) => i.id === a.selected)
  const hasTest = ['assumptions', 'questions', 'test', 'expect', 'evidence', 'decide', 'tasks'].some((k) => (a[k] || []).length)
  const v1order = ['start', 'idea', 'who', 'now', 'outcome', 'signs', 'hmw', 'ideas', 'selected', 'assumptions', 'test', 'expect', 'evidence', 'decide', 'tasks']
  const reached = old.step === 'brief' ? v1order.length : Math.max(0, v1order.indexOf(old.step))

  let testQ = null
  if (selected || hasTest || reached > v1order.indexOf('selected')) {
    aimQ.state = selected ? 'answered' : 'active'
    aimQ.loop.exit = selected ? 'answered' : ''
    testQ = newQuestion(selected ? `Will "${selected.title}" work?` : 'Will the selected idea work?', { from: aimQ.id, state: 'active', order: 2 })
    Object.assign(testQ.loop, {
      route: 'test',
      assumptions: a.assumptions || [],
      questions: a.questions || [],
      test: a.test || '',
      expect: a.expect || '',
      evidence: a.evidence || '',
      decide: a.decide || '',
      tasks: a.tasks || [],
    })
    b.questions.push(testQ)
    b.loopCount = 2
    b.picks[`q.${aimQ.id}.next`] = testQ.id
  }

  // Visited: everything up to where the old brief had got to
  const keys = ['aim.start', 'aim.aim', 'aim.who', 'aim.now', 'aim.outcome', 'aim.signs', 'aim.discovery']
  const qk = (q, f) => `q.${q.id}.${f}`
  keys.push(qk(aimQ, 'route'), qk(aimQ, 'hmw'), qk(aimQ, 'ideas'), qk(aimQ, 'selected'))
  if (testQ) {
    keys.push(qk(aimQ, 'learning'), qk(aimQ, 'meaning'), qk(aimQ, 'exit'), qk(aimQ, 'next'))
    keys.push(qk(testQ, 'helps'), qk(testQ, 'know'), qk(testQ, 'route'), ...['assumptions', 'test', 'expect', 'evidence', 'decide', 'tasks'].map((f) => qk(testQ, f)))
  }
  const v1ToKey = { start: 'aim.start', idea: 'aim.aim', who: 'aim.who', now: 'aim.now', outcome: 'aim.outcome', signs: 'aim.signs', hmw: qk(aimQ, 'hmw'), ideas: qk(aimQ, 'ideas'), selected: qk(aimQ, 'selected') }
  if (testQ) Object.assign(v1ToKey, Object.fromEntries(['assumptions', 'test', 'expect', 'evidence', 'decide', 'tasks'].map((f) => [f, qk(testQ, f)])))
  let current
  if (old.step === 'brief') current = testQ ? qk(testQ, 'learning') : qk(aimQ, 'learning')
  else current = v1ToKey[old.step] || 'aim.start'
  const cut = keys.indexOf(current)
  b.visited = cut === -1 ? [...keys, current] : keys.slice(0, cut + 1)
  b.current = current
  return { id: old.id, createdAt: old.createdAt, updatedAt: old.updatedAt, ...b }
}
