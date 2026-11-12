import test from 'node:test';
import assert from 'node:assert/strict';
import { isUserMutedByHost, setUserMutePolicy } from '../src/moderation.js';

function createPolicy() {
  return { muteAll: false, mutedUsers: new Set(), allowedUsers: new Set() };
}

test('individual mute applies until the host explicitly allows the participant', () => {
  const policy = createPolicy();

  setUserMutePolicy(policy, 'student-1', true);
  assert.equal(isUserMutedByHost(policy, 'student-1'), true);

  setUserMutePolicy(policy, 'student-1', false);
  assert.equal(isUserMutedByHost(policy, 'student-1'), false);
});

test('mute-all blocks new participants but the host can allow one participant', () => {
  const policy = createPolicy();
  policy.muteAll = true;

  assert.equal(isUserMutedByHost(policy, 'new-student'), true);
  setUserMutePolicy(policy, 'student-1', false);
  assert.equal(isUserMutedByHost(policy, 'student-1'), false);

  setUserMutePolicy(policy, 'student-1', true);
  assert.equal(isUserMutedByHost(policy, 'student-1'), true);
});

test('turning off mute-all allows participants with no individual restriction', () => {
  const policy = createPolicy();
  policy.muteAll = true;
  setUserMutePolicy(policy, 'student-1', true);
  policy.muteAll = false;

  assert.equal(isUserMutedByHost(policy, 'student-1'), true);
  assert.equal(isUserMutedByHost(policy, 'student-2'), false);
});
