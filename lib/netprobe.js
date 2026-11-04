/**
 * Loopback port probe: answers "is a local proxy client listening here?" so the
 * tool can warn when it enables a proxy pointing at a dead port.
 */

import net from 'node:net';

export function probePort(port, host = '127.0.0.1', timeoutMs = 200) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function probePorts(ports) {
  const unique = [...new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))];
  const results = await Promise.all(
    unique.map(async (port) => ({ port, open: await probePort(port) })),
  );
  return results.filter((item) => item.open).map((item) => item.port);
}
