import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { schemas } from '../shared/validation';

const patient = { name: 'ليان أحمد', dob: '1995-04-10', bedId: randomUUID() };

test('admission requires name, date of birth and bed while phone and sex are optional', () => {
  const parsed = schemas.admit.parse(patient);
  assert.equal(parsed.phone, '');
  assert.equal(parsed.sex, '');
  assert.equal(parsed.bedId, patient.bedId);
  assert.ok(schemas.admit.safeParse({ ...patient, phone: '', sex: '' }).success);
  for (const input of [
    { dob: patient.dob, bedId: patient.bedId },
    { name: patient.name, bedId: patient.bedId },
    { name: patient.name, dob: patient.dob },
    { ...patient, bedId: '' },
    { ...patient, name: '   ' },
    { ...patient, dob: '' },
    { ...patient, dob: '1995-02-30' },
    { ...patient, dob: '2999-01-01' },
  ]) {
    assert.equal(schemas.admit.safeParse(input).success, false);
  }
});

test('patient names accept letters and name punctuation but reject numbers and symbols', () => {
  for (const name of ['عَلِيّ أحمد', 'Anne-Marie O’Neill', "José D'Souza", '李明']) {
    assert.ok(schemas.admit.safeParse({ ...patient, name }).success, name);
  }
  for (const name of ['123', 'ليان 1', 'ليان ١', 'ليان ۱', 'ليان １', 'ليان ²', '@@@', 'ليان 🏥']) {
    assert.equal(schemas.admit.safeParse({ ...patient, name }).success, false, name);
  }
});

test('optional admission fields are still validated when provided', () => {
  for (const extra of [{ phone: 'abc' }, { sex: 'invalid' }, { bedId: 'invalid' }]) {
    assert.equal(schemas.admit.safeParse({ ...patient, ...extra }).success, false);
  }
  assert.equal(schemas.admit.parse({ ...patient, phone: ' ٠٩٩١٢٣٤٥٦٧ ' }).phone, '0991234567');
});
