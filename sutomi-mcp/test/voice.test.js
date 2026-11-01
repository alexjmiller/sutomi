import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVoice, OPENING } from '../voice.js'

const NOW = Date.UTC(2026, 10, 4, 12, 0) // Wednesday 4 November 2026, midday London
function fakeTools(lists, calendar = []) {
  const calls = []
  const store = lists.map((l) => ({ ...l, items: [] }))
  const call = async (name, args = {}) => {
    calls.push({ name, args })
    if (name === 'list_tasklists') return { lists: store.map((l) => ({ id: l.id, name: l.name, open: l.items.length, parked: 0 })) }
    if (name === 'get_tasklist') { const l = store.find((l) => l.id === args.list_id); return { id: l.id, name: l.name, open: l.items.map((it) => ({ ...it, done: false })), parked: [] } }
    if (name === 'list_calendar') return { from: args.from, to: args.to, items: calendar.filter((it) => it.date >= args.from && it.date <= args.to) }
    if (name === 'add_calendar_task') {
      const existing = calendar.find((it) => it.key === args.request_key)
      if (existing) return { created: false, item: existing }
      const item = { id: String(calendar.length + 1), title: args.title, date: args.date, ...(args.time ? { time: args.time } : {}), key: args.request_key }
      calendar.push(item)
      return { created: true, item }
    }
    if (name === 'add_task') {
      const list = store.find((l) => l.id === args.list_id)
      const existing = list.items.find((it) => it.key === args.request_key)
      if (existing) return { created: false, list: { id: list.id, name: list.name }, item: existing }
      const item = { id: String(list.items.length + 1), text: args.text, key: args.request_key }
      list.items.push(item)
      return { created: true, list: { id: list.id, name: list.name }, item }
    }
    throw new Error(`unknown tool ${name}`)
  }
  return { call, calls, store }
}
const LISTS = [{ id: 'shop', name: 'Shopping' }, { id: 'house', name: 'House' }, { id: 'jobs', name: 'House jobs' }]

test('one-shot add with confirmation', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'add milk to shopping' })
  assert.equal(a.reply, 'Add milk to Shopping. Is that correct?'); assert.equal(a.finished, false); assert.equal(a.next, 'listen')
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'yes' })
  assert.equal(b.reply, 'Added milk to Shopping.'); assert.equal(b.finished, true); assert.equal(b.next, 'stop')
  assert.deepEqual(t.store[0].items.map((i) => i.text), ['milk'])
  // a retry of the lost final reply gets the same answer and adds nothing
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'yes' })
  assert.equal(c.reply, b.reply); assert.equal(t.store[0].items.length, 1)
  assert.equal(t.calls.filter((c) => c.name === 'add_task').length, 1)
})

test('empty start asks the opening question, then needs a list', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: '' })
  assert.equal(a.reply, OPENING)
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'buy stamps' })
  assert.equal(b.reply, 'Which list: Shopping, House or House jobs?')
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'the shopping one' })
  assert.equal(c.reply, 'Add buy stamps to Shopping. Is that correct?')
  const d = await v.handle({ conversation_id: a.conversation_id, text: 'yep' })
  assert.equal(d.reply, 'Added buy stamps to Shopping.')
})

test('ambiguous list name narrows down', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'add fix the gate to hous' })
  assert.equal(a.reply, 'Which list: House or House jobs?')
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'jobs' })
  assert.equal(b.reply, 'Add fix the gate to House jobs. Is that correct?')
})

test('no cancels; unknown list twice gives up; nothing is added', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'add milk to shopping' })
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'no' })
  assert.equal(b.reply, 'OK, nothing added.'); assert.equal(b.finished, true)
  const c = await v.handle({ text: 'milk' })
  const d = await v.handle({ conversation_id: c.conversation_id, text: 'garden' })
  assert.match(d.reply, /^I don't have a list called garden\. Your lists are Shopping, House or House jobs\. Which one\?$/)
  const e = await v.handle({ conversation_id: c.conversation_id, text: 'garage' })
  assert.equal(e.finished, true); assert.match(e.reply, /Nothing was added/)
  assert.equal(t.calls.filter((c) => c.name === 'add_task').length, 0)
})

test('restating during confirmation makes a new draft', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'add milk to shopping' })
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'add oat milk to shopping' })
  assert.equal(b.reply, 'Add oat milk to Shopping. Is that correct?')
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'ok' })
  assert.equal(c.reply, 'Added oat milk to Shopping.')
  assert.deepEqual(t.store[0].items.map((i) => i.text), ['oat milk'])
})

test('a single list needs no question', async () => {
  const t = fakeTools([LISTS[0]])
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'eggs' })
  assert.equal(a.reply, 'Add eggs to Shopping. Is that correct?')
})

test('unknown or expired conversation is not resumed blindly', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ conversation_id: 'deadbeef', text: 'yes' })
  assert.match(a.reply, /^I lost track of that conversation, so nothing was added\./)
  assert.equal(a.finished, false)
  assert.equal(t.calls.filter((c) => c.name === 'add_task').length, 0)
})

test('idle conversations expire, finished ones are kept for replay', async () => {
  let t0 = 1_000_000
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => t0, ttlMs: 1000, keepFinishedMs: 5000 })
  const a = await v.handle({ text: 'add milk to shopping' })
  t0 += 2000
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'yes' })
  assert.match(b.reply, /lost track/)
  assert.equal(t.calls.filter((c) => c.name === 'add_task').length, 0)
})

test('tool failure ends the conversation honestly', async () => {
  const v = createVoice({ call: async () => { throw new Error('boom') } })
  const a = await v.handle({ text: 'add milk to shopping' })
  assert.equal(a.finished, true); assert.match(a.reply, /couldn't reach sutomi/)
})

test('calendar: a task on a day, confirmed, idempotent', async () => {
  const cal = []
  const t = fakeTools(LISTS, cal)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'add call the dentist tomorrow at 2.30pm' })
  assert.equal(a.reply, 'Add call the dentist for tomorrow at 2:30pm. Is that correct?')
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'yes' })
  assert.equal(b.reply, 'Added call the dentist for tomorrow at 2:30pm.'); assert.equal(b.finished, true)
  assert.deepEqual(cal.map((i) => [i.title, i.date, i.time]), [['call the dentist', '2026-11-05', '14:30']])
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'yes' })
  assert.equal(c.reply, b.reply); assert.equal(cal.length, 1)
})

test('calendar: no day given → asked; a range is not a day; the calendar can be chosen at the list question', async () => {
  const t = fakeTools(LISTS, [])
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: 'add book the car in to the calendar' })
  assert.equal(a.reply, 'Which day?')
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'next week' })
  assert.equal(b.reply, 'Which day next week?')
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'the 12th of march' })
  assert.equal(c.reply, 'Add book the car in for Friday 12 March 2027. Is that correct?')
  const d = await v.handle({ text: 'add put the bins out' })
  assert.equal(d.reply, 'Which list: Shopping, House or House jobs?')
  const e = await v.handle({ conversation_id: d.conversation_id, text: 'the calendar' })
  assert.equal(e.reply, 'Which day?')
  const f = await v.handle({ conversation_id: d.conversation_id, text: 'sunday' })
  assert.equal(f.reply, 'Add put the bins out for Sunday. Is that correct?')
})

test('reading the calendar: one day, a span, nothing', async () => {
  const cal = [
    { id: '1', title: 'Dentist', date: '2026-11-05', time: '14:30' },
    { id: '2', title: 'Post the card', date: '2026-11-05' },
    { id: '3', title: 'Call the plumber', date: '2026-11-06' },
  ]
  const t = fakeTools(LISTS, cal)
  const v = createVoice({ call: t.call, now: () => NOW })
  const a = await v.handle({ text: "what's on tomorrow" })
  assert.equal(a.reply, 'Tomorrow, 2 things: Dentist at 2:30pm and Post the card.'); assert.equal(a.finished, true)
  const b = await v.handle({ text: "what's coming up" })
  assert.equal(b.reply, 'In the next 7 days, 3 things. Tomorrow: Dentist at 2:30pm and Post the card. Friday: Call the plumber.')
  const c = await v.handle({ text: 'anything on saturday' })
  assert.equal(c.reply, 'Nothing on Saturday.')
  const d = await v.handle({ text: 'what do i have next week' })
  assert.equal(d.reply, 'Nothing next week.')
  assert.deepEqual(t.calls.filter((c) => c.name === 'list_calendar').map((c) => [c.args.from, c.args.to]), [['2026-11-05', '2026-11-05'], ['2026-11-04', '2026-11-10'], ['2026-11-07', '2026-11-07'], ['2026-11-09', '2026-11-15']])
})

test('reading a list, and asking what to read', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call, now: () => NOW })
  t.store[0].items.push({ id: 'x', text: 'milk' }, { id: 'y', text: 'eggs' }, { id: 'z', text: 'bread' })
  const a = await v.handle({ text: "what's on the shopping list" })
  assert.equal(a.reply, 'Shopping, 3 open: milk, eggs and bread.'); assert.equal(a.finished, true)
  const b = await v.handle({ text: 'read house' })
  assert.equal(b.reply, 'House is empty.')
  const c = await v.handle({ text: "what's on" })
  assert.equal(c.reply, 'Read a list, or the calendar?')
  const d = await v.handle({ conversation_id: c.conversation_id, text: 'shopping' })
  assert.equal(d.reply, a.reply)
  const e = await v.handle({ text: "what's on" })
  const f = await v.handle({ conversation_id: e.conversation_id, text: 'the calendar' })
  assert.equal(f.reply, 'Nothing in the next 7 days.')
})

test('modes: each Shortcut opens with its own question and keeps to its job', async () => {
  const cal = [{ id: '1', title: 'Dentist', date: '2026-11-09', time: '14:30' }]
  const t = fakeTools(LISTS, cal)
  const v = createVoice({ call: t.call, now: () => NOW })
  t.store[0].items.push({ id: 'x', text: 'milk' })
  const open = async (mode) => (await v.handle({ text: '', mode })).reply
  assert.equal(await open('task'), 'What would you like to add?')
  assert.equal(await open('event'), "What's the event, and when?")
  assert.equal(await open('tasks'), 'Which list?')
  assert.equal(await open('events'), 'For which day?')
  // events: the day is asked, then answered
  const a = await v.handle({ text: '', mode: 'events' })
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'next monday' })
  assert.equal(b.reply, 'On Monday, one thing: Dentist at 2:30pm.'); assert.equal(b.finished, true)
  const c = await v.handle({ text: '', mode: 'events' })
  const d = await v.handle({ conversation_id: c.conversation_id, text: 'erm' })
  assert.equal(d.reply, 'Which day? Say today, tomorrow, a weekday, next week, or a date.')
  const e = await v.handle({ conversation_id: c.conversation_id, text: 'next week' })
  assert.equal(e.reply, 'Next week, one thing. Monday: Dentist at 2:30pm.')
  // event: creates an event, not a task; a time is optional
  const f = await v.handle({ text: 'dentist on the 10th of november at 3', mode: 'event' })
  assert.equal(f.reply, 'Add dentist for Tuesday at 3pm. Is that correct?')
  const g = await v.handle({ conversation_id: f.conversation_id, text: 'yes' })
  assert.equal(g.reply, 'Added dentist for Tuesday at 3pm.')
  assert.equal(t.calls.find((c) => c.name === 'add_calendar_task').args.kind, 'event')
  const h = await v.handle({ text: 'parents evening', mode: 'event' })
  assert.equal(h.reply, 'Which day?')
  // tasks: a list name reads it; task: a day at the end stays in the task text
  const i = await v.handle({ text: 'shopping', mode: 'tasks' })
  assert.equal(i.reply, 'Shopping, 1 open: milk.')
  const j = await v.handle({ text: 'milk tomorrow', mode: 'task' })
  assert.equal(j.reply, 'Which list: Shopping, House or House jobs?')
  const k = await v.handle({ text: 'nonsense', mode: 'nonsense' })
  assert.equal(k.reply, 'Which list: Shopping, House or House jobs?') // an unknown mode is the mixed script
})
