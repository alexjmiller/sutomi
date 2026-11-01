import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseWhen, speakDate, speakTime, todayIn, instantOf, localOf, addDays, weekday } from '../dates.js'

const T = '2026-11-04' // a Wednesday
const when = (s) => parseWhen(s, T)

test('relative days and weekdays', () => {
  assert.equal(when('tomorrow').date, '2026-11-05')
  assert.equal(when('the day after tomorrow').date, '2026-11-06')
  assert.equal(when('today').date, T)
  assert.equal(when('on friday').date, '2026-11-06')
  assert.equal(when('this wednesday').date, T)
  assert.equal(when('wednesday').date, '2026-11-11')
  assert.equal(when('next monday').date, '2026-11-09')
  assert.equal(when('in 3 days').date, '2026-11-07')
  assert.equal(when('in two weeks').date, '2026-11-18')
  assert.equal(when('in a week').date, '2026-11-11')
})

test('spoken and numeric dates, year rolls forward', () => {
  assert.equal(when('3rd of march').date, '2027-03-03')
  assert.equal(when('march 3').date, '2027-03-03')
  assert.equal(when('25 dec').date, '2026-12-25')
  assert.equal(when('12/5').date, '2027-05-12')
  assert.equal(when('12/5/26').date, '2026-05-12')
  assert.equal(when('2027-01-02').date, '2027-01-02')
  assert.equal(when('31st of february').invalid, true)
  assert.equal(when('buy 10 eggs'), null)
  assert.equal(when('the cat sat on the mat'), null)
})

test('times attach to the date, before or after it', () => {
  const a = when('call the dentist tomorrow at 2.30pm')
  assert.equal(a.date, '2026-11-05'); assert.equal(a.time, '14:30')
  assert.equal('call the dentist tomorrow at 2.30pm'.slice(0, a.start).trim(), 'call the dentist')
  const b = when('call mum at 10 on friday')
  assert.equal(b.time, '10:00'); assert.equal('call mum at 10 on friday'.slice(0, b.start).trim(), 'call mum')
  assert.equal(when('tomorrow at 3').time, '15:00')
  assert.equal(when('tomorrow at 7').time, '07:00')
  assert.equal(when('tomorrow at noon').time, '12:00')
  assert.equal(when('tomorrow at 12am').time, '00:00')
  assert.equal(when('tomorrow at 8am').time, '08:00')
  assert.equal(when('tomorrow').time, null)
})

test('ranges', () => {
  assert.deepEqual(when('this week').range, { from: T, to: '2026-11-08', label: 'this week' })
  assert.deepEqual(when('next week').range, { from: '2026-11-09', to: '2026-11-15', label: 'next week' })
  assert.deepEqual(when('the weekend').range, { from: '2026-11-07', to: '2026-11-08', label: 'the weekend' })
  assert.deepEqual(when('next 3 days').range, { from: T, to: '2026-11-06', label: 'the next 3 days' })
  assert.deepEqual(when("what's coming up").range, { from: T, to: '2026-11-10', label: 'the next 7 days' })
  assert.deepEqual(when('next month').range, { from: '2026-12-01', to: '2026-12-31', label: 'next month' })
  assert.deepEqual(parseWhen('the weekend', '2026-11-08').range, { from: '2026-11-08', to: '2026-11-08', label: 'the weekend' })
})

test('speaking', () => {
  assert.equal(speakDate('2026-11-05', T), 'tomorrow')
  assert.equal(speakDate('2026-11-06', T), 'Friday')
  assert.equal(speakDate('2026-11-11', T), 'Wednesday 11 November')
  assert.equal(speakDate('2027-03-03', T), 'Wednesday 3 March 2027')
  assert.equal(speakDate('2026-11-06', T, { weekdayOnly: false }), 'Friday 6 November')
  assert.equal(speakTime('14:30'), '2:30pm'); assert.equal(speakTime('09:00'), '9am'); assert.equal(speakTime('12:00'), 'noon')
})

test('zone maths across DST', () => {
  assert.equal(todayIn(Date.UTC(2026, 10, 4, 23, 30)), '2026-11-04')
  assert.equal(todayIn(Date.UTC(2026, 6, 4, 23, 30)), '2026-07-05')
  assert.equal(instantOf('2026-07-05', '10:00').toISOString(), '2026-07-05T09:00:00.000Z')
  assert.equal(instantOf('2026-11-05', '10:00').toISOString(), '2026-11-05T10:00:00.000Z')
  assert.deepEqual(localOf('2026-07-05T09:00:00Z'), { date: '2026-07-05', time: '10:00' })
  assert.equal(addDays('2026-12-31', 1), '2027-01-01'); assert.equal(weekday(T), 3)
})

test('time spans and dictated apostrophes', () => {
  const a = when("UX Brighton on Friday at 9 o’clock till 7 o'clock")
  assert.deepEqual([a.date, a.time, a.end_time], ['2026-11-06', '09:00', '19:00'])
  assert.equal("UX Brighton on Friday at 9 o’clock till 7 o'clock".slice(0, a.start).trim(), 'UX Brighton')
  assert.deepEqual([when('lunch on friday from 12 to 1').time, when('lunch on friday from 12 to 1').end_time], ['12:00', '13:00'])
  const b = when('conference friday 9am to 5.30pm')
  assert.deepEqual([b.time, b.end_time], ['09:00', '17:30'])
  const c = when('from 9 until 11 on friday call mum')
  assert.deepEqual([c.date, c.time, c.end_time, 'from 9 until 11 on friday call mum'.slice(c.end).trim()], ['2026-11-06', '09:00', '11:00', 'call mum'])
  assert.deepEqual([when('go to the gym tomorrow at 7').time, when('go to the gym tomorrow at 7').end_time], ['07:00', null])
  assert.equal(when('add tea at 4 to shopping tomorrow').end_time, null)
})
