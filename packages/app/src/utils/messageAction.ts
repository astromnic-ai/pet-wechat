import type { Message } from "@pet-wechat/shared";

const ACTION_MARKER = "\n\n#action:";

export interface MessageAction {
  type: string;
  petId?: string;
  avatarId?: string;
}

export function parseMessageContent(content = "") {
  const markerIndex = content.indexOf(ACTION_MARKER);
  if (markerIndex < 0) {
    return { displayContent: content.trim(), action: null as MessageAction | null };
  }

  const displayContent = content.slice(0, markerIndex).trim();
  const actionText = content.slice(markerIndex + ACTION_MARKER.length).trim();
  const params = actionText.split("&").reduce<Record<string, string>>((result, pair) => {
    const [rawKey, ...rawValue] = pair.split("=");
    if (!rawKey) return result;
    const key = decodeURIComponent(rawKey);
    result[key] = decodeURIComponent(rawValue.join("=") || "");
    return result;
  }, {});
  const type = params.type || params.action || "";
  const action = type
    ? {
        type,
        petId: params.petId || undefined,
        avatarId: params.avatarId || undefined,
      }
    : null;

  return { displayContent, action };
}

export function isAvatarRetryMessage(message: Message) {
  const { action } = parseMessageContent(message.content);
  return action?.type === "avatar-retry" || message.title.includes("图像审核未通过");
}
