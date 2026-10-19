// Thinking Machine — the question flow. Pure data + helpers, no React, no AI.
//
// Four stages: understand -> define -> explore -> test, one question at a time.
// Each step: id, stage, question, why (shown in help), hint, example, help prompts,
// and an input type. Branching is modest: `start` ('new' | 'existing') changes wording.
// Every step can be skipped ("come back to this"); skipped steps stay visible as open.

export const STAGES = [
  { id: 'understand', label: 'understand' },
  { id: 'define', label: 'define' },
  { id: 'explore', label: 'explore' },
  { id: 'test', label: 'test' },
]

const who = (a) => (a.who || 'them').trim().replace(/\.$/, '')
const outcome = (a) => (a.outcome || 'the outcome you want').trim().replace(/\.$/, '')

export const STEPS = [
  {
    id: 'start',
    stage: 'understand',
    question: 'What do you want to work on?',
    why: 'The wording of a few later questions changes slightly depending on your starting point.',
    type: 'choice',
    options: [
      { value: 'new', label: 'a new idea' },
      { value: 'existing', label: 'an existing idea or problem' },
    ],
  },
  {
    id: 'idea',
    stage: 'understand',
    question: (a) => (a.start === 'new' ? "What's the idea?" : "What's the idea or problem?"),
    why: 'A plain description is the anchor for everything that follows. It becomes the title of your brief.',
    hint: 'Describe it in plain language, as you would to a friend. A sentence or two is enough.',
    example: 'Our onboarding could be better.',
    help: [
      'What prompted this thought?',
      'If you had to say it in one sentence, what would it be?',
      "What's the simplest version of this?",
    ],
    type: 'text',
  },
  {
    id: 'who',
    stage: 'understand',
    question: 'Who is it for?',
    why: 'Knowing who experiences the change keeps the outcome and the ideas grounded. It feeds the "How might we" question.',
    hint: 'Who would use it, benefit from it, or experience the change? It could be you.',
    example: 'New team members.',
    help: [
      'Who notices the problem most?',
      'Who would be the first to try it?',
      'Who else is affected?',
    ],
    type: 'text',
  },
  {
    id: 'now',
    stage: 'understand',
    question: (a) => (a.start === 'new' ? 'What opportunity do you see?' : "What's difficult or missing at the moment?"),
    why: 'The current situation is what the outcome is measured against. Separating what you know from what you assume starts here.',
    hint: (a) => (a.start === 'new'
      ? "What's happening now that makes this worth doing?"
      : "What's happening now? What's missing, hard, or worth improving?"),
    example: 'They struggle to find information and are unsure whom to ask.',
    help: [
      'What do you know for certain, and what are you assuming?',
      'What have you already tried?',
      'What happens if nothing changes?',
    ],
    type: 'text',
  },
  {
    id: 'outcome',
    stage: 'define',
    question: "What would you like to happen once it's in place?",
    why: 'An outcome is a change for people, not a thing you build. "Create a welcome guide" is an activity; "new starters find what they need" is an outcome.',
    hint: (a) => `Describe the change for ${who(a)}, not the thing you'll make.`,
    example: 'New team members feel confident getting started in their first week.',
    help: [
      "Describe a day when it's working well.",
      (a) => `What would be different for ${who(a)}?`,
      'What would stop happening?',
      'Is this an activity or the change it should bring about?',
    ],
    type: 'text',
  },
  {
    id: 'signs',
    stage: 'define',
    question: 'How would you know it was working?',
    why: 'Observable signs turn the outcome into something you can check after a test.',
    hint: 'Signs you could see, hear, or count. Add as many as you like.',
    example: 'They can find essential information and know where to get support.',
    help: [
      'What would you see or hear?',
      'What could you count?',
      'What would people say?',
    ],
    type: 'list',
    placeholder: 'a sign of success',
  },
  {
    id: 'hmw',
    stage: 'explore',
    question: 'How might we…',
    why: 'One open question frames the brainstorm. It should invite several answers, not one.',
    hint: 'Start from the template, or write your own. Edit it until it feels right.',
    example: 'How might we help new team members find what they need and feel supported in their first week?',
    type: 'hmw',
  },
  {
    id: 'ideas',
    stage: 'explore',
    question: 'What could we try?',
    why: 'Collecting possibilities before judging them gives you something to choose between. One idea is fine if that is all you have.',
    hint: 'Add each idea as a card with a short title. A description is optional.',
    example: 'A buddy. A welcome checklist. Short introductory sessions.',
    help: [
      'What is the simplest thing we could try?',
      'What is a different way to approach this?',
      'What could we do with what we already have?',
      'What else might achieve the same outcome?',
    ],
    type: 'cards',
  },
  {
    id: 'selected',
    stage: 'test',
    question: 'Which idea would you like to explore first?',
    why: 'Choosing one idea lets you design a concrete test. The others stay in the brief for later.',
    hint: 'Pick one. You can come back and try another after the first test.',
    help: [
      'Which could make a useful difference?',
      'Which is practical to try?',
      'Which would help you learn something important?',
    ],
    type: 'select',
    from: 'ideas',
  },
  {
    id: 'assumptions',
    stage: 'test',
    question: 'What needs to be true for this idea to work?',
    why: 'Naming assumptions shows what the test should check. "I don’t know yet" is a fine answer: capture it as an open question.',
    example: 'Assuming: access to a named person will help starters get useful answers. Open question: do starters prefer one buddy or a small group?',
    help: [
      'What are you taking for granted?',
      'What would you want to find out first?',
      'What would make this idea fail?',
    ],
    type: 'pair',
    fields: [
      { key: 'assumptions', label: 'assumptions', placeholder: 'something that needs to be true' },
      { key: 'questions', label: 'open questions', placeholder: 'something you don’t know yet' },
    ],
  },
  {
    id: 'test',
    stage: 'test',
    question: 'What is the smallest useful test you could run?',
    why: 'A small test gives you evidence quickly, before you commit to a plan.',
    hint: 'Something you could try soon, that still tells you something.',
    example: 'Try the buddy approach with the next two starters.',
    help: [
      'What could you try this week?',
      "What's the smallest version that still tells you something?",
      'Who needs to be involved?',
    ],
    type: 'text',
  },
  {
    id: 'expect',
    stage: 'test',
    question: 'What do you expect to happen?',
    why: 'Writing down the expectation before the test is what makes the result meaningful.',
    hint: 'Be specific enough that you could be wrong.',
    example: 'Starters feel more confident and know whom to ask for help.',
    type: 'text',
  },
  {
    id: 'evidence',
    stage: 'test',
    question: 'What will you observe or collect to see what happened?',
    why: 'Deciding the evidence up front stops the result being read however you like afterwards.',
    example: 'Ask what helped, what remained confusing, and whether they knew where to get support.',
    help: [
      'Look back at your signs of success. Which could you check after the test?',
      'What could you ask people?',
      'What could you count or compare?',
    ],
    type: 'text',
  },
  {
    id: 'decide',
    stage: 'test',
    question: 'What result would suggest you should continue, change the idea, or reconsider it?',
    why: 'Agreeing the decision rule now makes the next step after the test easy.',
    example: 'If starters felt supported, continue and widen it. If not, adapt the approach or try the next idea.',
    type: 'text',
  },
  {
    id: 'tasks',
    stage: 'test',
    question: 'What do you need to do to run the test?',
    why: 'A short task list turns the test into something that will actually happen.',
    hint: 'Just enough to get the test going. Owners and dates are optional. Drag the arrows to reorder.',
    example: 'Recruit buddies. Explain the approach. Run the trial. Collect feedback. Review what to do next.',
    type: 'tasks',
  },
]

export const STEP_IDS = STEPS.map((s) => s.id)

export function emptyAnswers() {
  return {
    start: '',
    idea: '',
    who: '',
    now: '',
    outcome: '',
    signs: [],
    hmw: '',
    ideas: [], // [{ id, title, description }]
    selected: '', // idea id
    assumptions: [],
    questions: [],
    test: '',
    expect: '',
    evidence: '',
    decide: '',
    tasks: [], // [{ id, text, note }]
  }
}

export function newId() {
  return Math.random().toString(36).slice(2, 10)
}

/** Resolve a string-or-function field against the current answers. */
export function resolve(field, answers) {
  return typeof field === 'function' ? field(answers) : field
}

/** Default "How might we" sentence built from earlier answers. */
export function defaultHmw(answers) {
  return `How might we help ${who(answers)} to ${outcome(answers)}?`
}

export function selectedIdea(answers) {
  return (answers.ideas || []).find((i) => i.id === answers.selected) || null
}

/** Has this step been answered with something useful? */
export function isAnswered(step, answers) {
  if (step.type === 'pair') return step.fields.some((f) => (answers[f.key] || []).length > 0)
  if (step.type === 'select') return Boolean(selectedIdea(answers))
  const v = answers[step.id]
  if (Array.isArray(v)) return v.length > 0
  return Boolean(v && String(v).trim())
}

/** Compact value for the "so far" panel. */
export function displayValue(step, answers) {
  const v = answers[step.id]
  switch (step.type) {
    case 'choice': return step.options.find((o) => o.value === v)?.label || ''
    case 'pair':
      return step.fields
        .filter((f) => (answers[f.key] || []).length)
        .map((f) => `${f.label}: ${answers[f.key].join('; ')}`)
        .join(' — ')
    case 'cards': return (v || []).map((i) => i.title).filter(Boolean).join('; ')
    case 'select': return selectedIdea(answers)?.title || ''
    case 'tasks': return (v || []).map((t) => t.text).filter(Boolean).join('; ')
    case 'list': return (v || []).join('; ')
    default: return v || ''
  }
}

/** Title for the session list: the idea, trimmed. */
export function sessionTitle(answers) {
  const idea = (answers.idea || '').trim()
  if (!idea) return 'untitled thinking'
  return idea.length > 60 ? idea.slice(0, 57).trimEnd() + '…' : idea
}

export const TO_EXPLORE = '_To explore_'

/**
 * The brief as markdown, in the user's own words. Unanswered sections are marked
 * "To explore" unless `includeOpen` is false, in which case they are left out.
 */
export function buildBrief(answers, { includeOpen = true } = {}) {
  const a = answers
  const out = []
  const push = (...l) => out.push(...l)
  const section = (heading, body) => {
    const empty = !body || (Array.isArray(body) && !body.length)
    if (empty && !includeOpen) return
    push(`## ${heading}`, '')
    if (empty) push(TO_EXPLORE)
    else if (Array.isArray(body)) body.forEach((b) => push(`- ${b}`))
    else push(body)
    push('')
  }

  push(`# ${sessionTitle(a)}`, '')
  section(a.start === 'existing' ? 'The problem' : 'The idea', a.idea)
  section('Who it is for', a.who)
  section(a.start === 'new' ? 'The opportunity' : 'What is happening now', a.now)
  section('Intended outcome', a.outcome)
  section('Signs of success', a.signs)
  section('How might we', a.hmw)
  section('Ideas collected', (a.ideas || []).filter((i) => i.title).map((i) => (i.description ? `${i.title} — ${i.description}` : i.title)))
  section('Selected idea', selectedIdea(a)?.title || '')
  section('Assumptions', a.assumptions)
  section('Open questions', a.questions)

  const testParts = [
    ['What we will do', a.test],
    ['What we expect', a.expect],
    ['Evidence we will collect', a.evidence],
    ['How we will decide', a.decide],
  ]
  const anyTest = testParts.some(([, v]) => v)
  if (anyTest || includeOpen) {
    push('## First test', '')
    testParts.forEach(([label, v]) => {
      if (v) push(`**${label}:** ${v}`, '')
      else if (includeOpen) push(`**${label}:** ${TO_EXPLORE}`, '')
    })
  }
  const tasks = (a.tasks || []).filter((t) => t.text)
  section('Next steps', tasks.map((t) => (t.note ? `[ ] ${t.text} (${t.note})` : `[ ] ${t.text}`)))
  return out.join('\n').trim() + '\n'
}

/** Plain-text version of the brief: markdown markers stripped. */
export function briefToText(md) {
  return md
    .replace(/^# (.*)$/gm, (_, t) => `${t.toUpperCase()}\n${'='.repeat(t.length)}`)
    .replace(/^## (.*)$/gm, (_, t) => `${t}\n${'-'.repeat(t.length)}`)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/^- \[ \] /gm, '[ ] ')
    .replace(/^- /gm, '• ')
    .replace(/_To explore_/g, 'To explore')
}
