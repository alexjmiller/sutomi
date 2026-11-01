import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAdd, parseUtterance, matchLists, isYes, isNo, joinNames, normalise } from '../script.js'

const lists = [{ id: 'a', name: 'Shopping' }, { id: 'b', name: 'House' }, { id: 'c', name: 'House jobs' }, { id: 'd', name: 'Work' }]

test('normalise drops filler', () => {
  assert.equal(normalise('the Shopping list'), 'shopping')
  assert.equal(normalise("my House-jobs' list!"), 'house jobs')
})

test('matchLists: exact beats partial', () => {
  assert.deepEqual(matchLists('house', lists).map((l) => l.id), ['b'])
  assert.deepEqual(matchLists('the house list', lists).map((l) => l.id), ['b'])
  assert.deepEqual(matchLists('jobs', lists).map((l) => l.id), ['c'])
  assert.deepEqual(matchLists('hous', lists).map((l) => l.id), ['b', 'c'])
  assert.deepEqual(matchLists('garden', lists), [])
})

test('parseAdd: task and list', () => {
  assert.deepEqual(parseAdd('Add milk to the shopping list.', lists), { task: 'milk', listName: 'shopping list', matches: [lists[0]] })
  assert.deepEqual(parseAdd('please put call the plumber on house', lists).task, 'call the plumber')
  const gym = parseAdd('add go to the gym to work', lists)
  assert.equal(gym.task, 'go to the gym'); assert.equal(gym.matches[0].id, 'd')
})

test('parseAdd: no list keeps the whole task', () => {
  assert.deepEqual(parseAdd('add go to the gym', lists), { task: 'go to the gym', listName: null, matches: [] })
  assert.deepEqual(parseAdd('Milk', lists), { task: 'Milk', listName: null, matches: [] })
  assert.equal(parseAdd('add', lists).task, '')
})

test('parseAdd: ambiguous list gives several matches', () => {
  const r = parseAdd('add paint the fence to hous', lists)
  assert.equal(r.matches.length, 2)
})

test('yes / no', () => {
  for (const s of ['yes', 'Yes.', 'yeah go on', 'OK', 'do it', "that's right"]) assert.ok(isYes(s), s)
  for (const s of ['no', 'No thanks', 'cancel', 'never mind', 'nevermind', "don't"]) assert.ok(isNo(s), s)
  assert.ok(!isYes('milk')); assert.ok(!isNo('milk'))
})

test('joinNames', () => {
  assert.equal(joinNames(['A']), 'A')
  assert.equal(joinNames(['A', 'B']), 'A or B')
  assert.equal(joinNames(['A', 'B', 'C']), 'A, B or C')
})

test('parseUtterance: lists, calendar adds and reads', () => {
  const T = '2026-11-04'
  const u = (s) => parseUtterance(s, lists, T)
  assert.equal(u('add milk to shopping').kind, 'add_list')
  assert.deepEqual(u('add call mum on friday at 10'), { kind: 'add_calendar', task: 'call mum', date: '2026-11-06', time: '10:00', end_time: null })
  assert.deepEqual(u('tomorrow add call the plumber'), { kind: 'add_calendar', task: 'call the plumber', date: '2026-11-05', time: null, end_time: null })
  assert.deepEqual(u('add dentist on the 3rd of march to the calendar'), { kind: 'add_calendar', task: 'dentist', date: '2027-03-03', time: null, end_time: null })
  assert.deepEqual(u('add book the car in to the calendar'), { kind: 'add_calendar', task: 'book the car in', date: null, time: null, end_time: null })
  assert.equal(u('add 10 eggs to shopping').task, '10 eggs')
  assert.equal(u('add plan the holiday next week').kind, 'add_list') // a span is not a day
  assert.deepEqual(u("what's on tomorrow").range, { from: '2026-11-05', to: '2026-11-05', date: '2026-11-05' })
  assert.equal(u("what's coming up").range.label, 'the next 7 days')
  assert.equal(u('what do i have next week').range.label, 'next week')
  assert.deepEqual(u("what's on the shopping list").matches.map((l) => l.id), ['a'])
  assert.equal(u('read my house jobs').kind, 'read_list')
  assert.deepEqual(u("what's on"), { kind: 'read', target: null })
  assert.equal(u('buy stamps').kind, 'add_list')
})
