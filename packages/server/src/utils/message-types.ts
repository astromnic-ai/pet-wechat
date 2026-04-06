export const MESSAGE_TYPES = [
  "system",
  "authorization",
  "activity",
  "health",
  "device",
  "community",
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export function isMessageType(value: unknown): value is MessageType {
  return (
    typeof value === "string" &&
    MESSAGE_TYPES.includes(value as MessageType)
  );
}
