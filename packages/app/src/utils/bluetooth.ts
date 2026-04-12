import Taro from "@tarojs/taro";

export interface BluetoothScanDevice {
  id: string;
  name: string;
  localName: string;
  macAddress: string | null;
  signal: number | null;
}

interface RawBluetoothDevice {
  deviceId: string;
  localName?: string;
  name?: string;
  RSSI?: number;
}

interface BluetoothDeviceFoundResult {
  devices: RawBluetoothDevice[];
}

interface CreateBluetoothScannerOptions {
  scanDurationMs?: number;
}

export interface BluetoothScanner {
  start(onDevicesFound: (devices: BluetoothScanDevice[]) => void): Promise<void>;
  stop(): Promise<void>;
  cleanup(): Promise<void>;
}

const DEFAULT_SCAN_DURATION_MS = 10_000;

function normalizeBluetoothDevice(device: RawBluetoothDevice): BluetoothScanDevice {
  const localName = typeof device.localName === "string" ? device.localName.trim() : "";
  const name = typeof device.name === "string" ? device.name.trim() : "";
  const displayName = localName || name || device.deviceId;

  return {
    id: device.deviceId,
    name: displayName,
    localName: localName || displayName,
    macAddress: device.deviceId || null,
    signal: typeof device.RSSI === "number" ? device.RSSI : null,
  };
}

export function createBluetoothScanner(options: CreateBluetoothScannerOptions = {}): BluetoothScanner {
  const scanDurationMs = options.scanDurationMs ?? DEFAULT_SCAN_DURATION_MS;
  const discoveredDevices = new Map<string, BluetoothScanDevice>();
  let onDevicesFound: ((devices: BluetoothScanDevice[]) => void) | null = null;
  let stopTimer: ReturnType<typeof setTimeout> | null = null;
  let listenerRegistered = false;
  let discovering = false;
  let destroyed = false;

  const handleBluetoothDeviceFound = (result: BluetoothDeviceFoundResult) => {
    result.devices.forEach((device) => {
      const normalizedDevice = normalizeBluetoothDevice(device);
      discoveredDevices.set(normalizedDevice.id, normalizedDevice);
    });

    onDevicesFound?.(Array.from(discoveredDevices.values()));
  };

  const clearStopTimer = () => {
    if (!stopTimer) return;
    clearTimeout(stopTimer);
    stopTimer = null;
  };

  const unregisterListener = () => {
    if (!listenerRegistered) return;

    try {
      Taro.offBluetoothDeviceFound(handleBluetoothDeviceFound);
    } catch {}

    listenerRegistered = false;
  };

  const stopDiscovery = async () => {
    clearStopTimer();

    if (!discovering) return;

    try {
      await Taro.stopBluetoothDevicesDiscovery();
    } catch {}

    discovering = false;
  };

  return {
    async start(nextOnDevicesFound) {
      destroyed = false;
      onDevicesFound = nextOnDevicesFound;
      discoveredDevices.clear();
      onDevicesFound([]);

      await Taro.openBluetoothAdapter();
      if (destroyed) {
        await Taro.closeBluetoothAdapter().catch(() => undefined);
        return;
      }

      unregisterListener();
      Taro.onBluetoothDeviceFound(handleBluetoothDeviceFound);
      listenerRegistered = true;

      await Taro.startBluetoothDevicesDiscovery({
        allowDuplicatesKey: true,
        interval: 0,
      });
      discovering = true;

      if (destroyed) {
        await stopDiscovery();
        await Taro.closeBluetoothAdapter().catch(() => undefined);
        return;
      }

      stopTimer = setTimeout(() => {
        void stopDiscovery();
      }, scanDurationMs);
    },

    async stop() {
      await stopDiscovery();
    },

    async cleanup() {
      destroyed = true;
      clearStopTimer();
      unregisterListener();
      await stopDiscovery();

      try {
        await Taro.closeBluetoothAdapter();
      } catch {}

      onDevicesFound = null;
      discoveredDevices.clear();
    },
  };
}
