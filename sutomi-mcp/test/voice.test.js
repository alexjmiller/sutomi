import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createVoice, OPENING } from '../voice.js'

function fakeTools(lists) {
  const calls = []
  const store = lists.map((l) => ({ ...l, items: [] }))
  const call = async (name, args = {}) => {
    calls.push({ name, args })
    if (name === 'list_tasklists') return { lists: store.map((l) => ({ id: l.id, name: l.name, open: l.items.length, parked: 0 })) }
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
  const v = createVoice({ call: t.call })
  const a = await v.handle({ text: 'add milk to shopping' })
  assert.equal(a.reply, 'Add milk to Shopping?'); assert.equal(a.finished, false); assert.equal(a.next, 'listen')
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
  const v = createVoice({ call: t.call })
  const a = await v.handle({ text: '' })
  assert.equal(a.reply, OPENING)
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'buy stamps' })
  assert.equal(b.reply, 'Which list: Shopping, House or House jobs?')
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'the shopping one' })
  assert.equal(c.reply, 'Add buy stamps to Shopping?')
  const d = await v.handle({ conversation_id: a.conversation_id, text: 'yep' })
  assert.equal(d.reply, 'Added buy stamps to Shopping.')
})

test('ambiguous list name narrows down', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call })
  const a = await v.handle({ text: 'add fix the gate to hous' })
  assert.equal(a.reply, 'Which list: House or House jobs?')
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'jobs' })
  assert.equal(b.reply, 'Add fix the gate to House jobs?')
})

test('no cancels; unknown list twice gives up; nothing is added', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call })
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
  const v = createVoice({ call: t.call })
  const a = await v.handle({ text: 'add milk to shopping' })
  const b = await v.handle({ conversation_id: a.conversation_id, text: 'add oat milk to shopping' })
  assert.equal(b.reply, 'Add oat milk to Shopping?')
  const c = await v.handle({ conversation_id: a.conversation_id, text: 'ok' })
  assert.equal(c.reply, 'Added oat milk to Shopping.')
  assert.deepEqual(t.store[0].items.map((i) => i.text), ['oat milk'])
})

test('a single list needs no question', async () => {
  const t = fakeTools([LISTS[0]])
  const v = createVoice({ call: t.call })
  const a = await v.handle({ text: 'eggs' })
  assert.equal(a.reply, 'Add eggs to Shopping?')
})

test('unknown or expired conversation is not resumed blindly', async () => {
  const t = fakeTools(LISTS)
  const v = createVoice({ call: t.call })
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
