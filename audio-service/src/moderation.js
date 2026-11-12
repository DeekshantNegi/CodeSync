export function isUserMutedByHost(policy, userId) {
  return policy.mutedUsers.has(userId) || (policy.muteAll && !policy.allowedUsers.has(userId));
}

export function setUserMutePolicy(policy, userId, muted) {
  if (muted) {
    policy.allowedUsers.delete(userId);
    policy.mutedUsers.add(userId);
  } else {
    policy.mutedUsers.delete(userId);
    policy.allowedUsers.add(userId);
  }
}
