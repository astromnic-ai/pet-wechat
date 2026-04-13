import Taro from "@tarojs/taro";
import type { WsMessage } from "@pet-wechat/shared";
import { getToken } from "./request";

declare const API_BASE_URL: string;
declare const ENABLE_DEV_LOGIN: boolean;

type WsMessageType = WsMessage["type"];
type WsMessageHandler<T extends WsMessageType> = (message: Extract<WsMessage, { type: T }>) => void;

const HEARTBEAT_INTERVAL_MS = 30_000;
const RECONNECT_MAX_DELAY_MS = 30_000;
const listeners = new Map<WsMessageType, Set<(message: WsMessage) => void>>();

let socketTask: Taro.SocketTask | null = null;
let isConnecting = false;
let isConnected = false;
let shouldReconnect = true;
let reconnectDelay = 1_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function getWsUrl(token: string) {
  const wsBaseUrl = API_BASE_URL.replace(/^http/, "ws").replace(/\/$/, "");
  return `${wsBaseUrl}/ws?token=${encodeURIComponent(token)}`;
}

function clearHeartbeat() {
  if (!heartbeatTimer) return;
  clearInterval(heartbeatTimer);
  heartbeatTimer = null;
}

function clearReconnectTimer() {
  if (!reconnectTimer) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = null;
}

function parseMessage(data: string | ArrayBuffer): WsMessage | null {
  try {
    const text = typeof data === "string" ? data : new TextDecoder().decode(data);
    return JSON.parse(text) as WsMessage;
  } catch {
    return null;
  }
}

function dispatchMessage(message: WsMessage) {
  const handlers = listeners.get(message.type);
  if (!handlers) return;

  handlers.forEach((handler) => {
    handler(message);
  });
}

function sendMessage(message: WsMessage) {
  if (!socketTask || !isConnected) return;

  socketTask.send({
    data: JSON.stringify(message),
  });
}

function scheduleReconnect() {
  if (!shouldReconnect || reconnectTimer) return;

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWs();
  }, reconnectDelay);

  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_DELAY_MS);
}

function bindSocket(task: Taro.SocketTask) {
  task.onOpen(() => {
    socketTask = task;
    isConnecting = false;
    isConnected = true;
    reconnectDelay = 1_000;
    clearReconnectTimer();
    clearHeartbeat();
    heartbeatTimer = setInterval(() => {
      sendMessage({ type: "ping" });
    }, HEARTBEAT_INTERVAL_MS);
  });

  task.onMessage((event) => {
    const message = parseMessage(event.data);
    if (!message) return;

    if (message.type === "pong") {
      return;
    }

    dispatchMessage(message);
  });

  task.onClose(() => {
    if (socketTask === task) {
      socketTask = null;
    }
    isConnecting = false;
    isConnected = false;
    clearHeartbeat();
    scheduleReconnect();
  });

  task.onError(() => {
    if (socketTask === task) {
      socketTask = null;
    }
    isConnecting = false;
    isConnected = false;
    clearHeartbeat();
    scheduleReconnect();
  });
}

export async function connectWs() {
  if (ENABLE_DEV_LOGIN) return;

  const token = getToken();
  if (!token || isConnecting || isConnected) return;

  shouldReconnect = true;
  isConnecting = true;

  try {
    const task = await Taro.connectSocket({
      url: getWsUrl(token),
    });

    bindSocket(task);
  } catch {
    isConnecting = false;
    isConnected = false;
    scheduleReconnect();
  }
}

export function disconnectWs() {
  shouldReconnect = false;
  isConnecting = false;
  isConnected = false;
  clearReconnectTimer();
  clearHeartbeat();

  if (!socketTask) return;

  const task = socketTask;
  socketTask = null;
  task.close({
    code: 1000,
    reason: "manual disconnect",
  });
}

export function subscribe<T extends WsMessageType>(type: T, handler: WsMessageHandler<T>) {
  const handlers = listeners.get(type) ?? new Set<(message: WsMessage) => void>();
  handlers.add(handler as (message: WsMessage) => void);
  listeners.set(type, handlers);

  return () => {
    unsubscribe(type, handler);
  };
}

export function unsubscribe<T extends WsMessageType>(type: T, handler: WsMessageHandler<T>) {
  const handlers = listeners.get(type);
  if (!handlers) return;

  handlers.delete(handler as (message: WsMessage) => void);
  if (handlers.size === 0) {
    listeners.delete(type);
  }
}
