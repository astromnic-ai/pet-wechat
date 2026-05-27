import mqtt, { type IClientOptions, type MqttClient } from "mqtt";
import type { DesktopConfigMqttPayload, OtaCommandPayload, PetActionMqttPayload } from "shared";
import { handleOtaMqttMessage } from "./mqtt-handlers";

const STATUS_TOPIC = "pet/+/status";
const OTA_TOPIC = "pet/+/ota";

let client: MqttClient | null = null;

function getBrokerUrl() {
  return process.env.EMQX_BROKER_URL ?? "mqtts://lf2ebe1a.ala.cn-hangzhou.emqxsl.cn:8883";
}

function getOptions(): IClientOptions {
  return {
    username: process.env.EMQX_USERNAME ?? "thup",
    password: process.env.EMQX_PASSWORD,
    reconnectPeriod: 5000,
    clean: true,
  };
}

export async function initOtaMqtt() {
  if (client) return client;

  client = mqtt.connect(getBrokerUrl(), getOptions());

  client.on("connect", () => {
    console.log("[ota:mqtt] connected");
    client?.subscribe(
      {
        [STATUS_TOPIC]: { qos: 1 },
        [OTA_TOPIC]: { qos: 1 },
      },
      (error) => {
        if (error) {
          console.error("[ota:mqtt] subscribe failed:", error);
          return;
        }
        console.log("[ota:mqtt] subscribed pet/+/status pet/+/ota");
      },
    );
  });

  client.on("reconnect", () => {
    console.log("[ota:mqtt] reconnecting");
  });

  client.on("close", () => {
    console.log("[ota:mqtt] disconnected");
  });

  client.on("error", (error) => {
    console.error("[ota:mqtt] client error:", error);
  });

  client.on("message", (topic, payload, packet) => {
    void handleOtaMqttMessage(topic, payload, packet.retain).catch((error) => {
      console.error("[ota:mqtt] message handler failed:", error);
    });
  });

  // 等首次连接建立后再返回，确保启动后调度引擎的首发不会因 MQTT 未连接被跳过；
  // broker 不可达时最多等 10s 后继续启动，由 reconnectPeriod 重连与定时 tick 兜底。
  await new Promise<void>((resolve) => {
    if (client?.connected) return resolve();
    client?.once("connect", () => resolve());
    setTimeout(resolve, 10_000);
  });

  return client;
}

function requireClient() {
  if (!client) {
    throw new Error("OTA MQTT client is not initialized");
  }
  return client;
}

export function isConnected() {
  return client?.connected === true;
}

export async function publishOtaCommand(
  chipId: string,
  payload: OtaCommandPayload,
  opts: { retain?: boolean } = {},
) {
  const activeClient = requireClient();
  const topic = `pet/${chipId}/ota`;
  const body = JSON.stringify(payload);

  await new Promise<void>((resolve, reject) => {
    activeClient.publish(
      topic,
      body,
      { qos: 1, retain: opts.retain ?? true },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

export async function publishPetAction(
  petId: string,
  payload: PetActionMqttPayload,
) {
  const activeClient = requireClient();
  // 单机联调兼容固件当前硬编码设备 ID，关联 issue:
  // https://github.com/astromnic-ai/pet-tabletop-mini/issues/1
  const topicPetId = process.env.PET_ACTION_TOPIC_OVERRIDE?.trim() || petId;
  const topic = `pet/${topicPetId}/action`;
  const body = JSON.stringify(payload);

  await new Promise<void>((resolve, reject) => {
    activeClient.publish(topic, body, { qos: 1, retain: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function publishDesktopConfig(
  chipId: string,
  payload: DesktopConfigMqttPayload,
) {
  const activeClient = requireClient();
  const topic = `pet/${chipId}/config`;
  const body = JSON.stringify(payload);

  await new Promise<void>((resolve, reject) => {
    activeClient.publish(topic, body, { qos: 1, retain: true }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function clearRetainedDesktopConfig(chipId: string) {
  const activeClient = requireClient();
  await new Promise<void>((resolve, reject) => {
    activeClient.publish(
      `pet/${chipId}/config`,
      Buffer.alloc(0),
      { qos: 1, retain: true },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

export async function clearRetainedOtaCommand(chipId: string) {
  const activeClient = requireClient();
  await new Promise<void>((resolve, reject) => {
    activeClient.publish(
      `pet/${chipId}/ota`,
      Buffer.alloc(0),
      { qos: 1, retain: true },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

export async function closeOtaMqtt() {
  const activeClient = client;
  client = null;
  if (!activeClient) return;

  await new Promise<void>((resolve) => {
    activeClient.end(false, {}, () => resolve());
  });
}
