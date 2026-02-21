let activeCustomerId: string | null = null;

export function setActiveSmsCustomerId(id: string | null) {
  activeCustomerId = id;
}

export function getActiveSmsCustomerId(): string | null {
  return activeCustomerId;
}
