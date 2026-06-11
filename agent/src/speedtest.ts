const TEST_BYTES = 2 * 1024 * 1024;

function mbps(bytes: number, seconds: number) {
  if (seconds <= 0) return 0;
  return Math.round((bytes * 8) / seconds / 1_000_000);
}

export async function measureNetworkSpeed(apiUrl: string, agentToken: string) {
  const headers = { Authorization: `Bearer ${agentToken}` };

  const downloadStart = performance.now();
  const downloadRes = await fetch(`${apiUrl}/api/agents/speed-test/download`, { headers });
  if (!downloadRes.ok) {
    throw new Error(`Speed test download failed (${downloadRes.status})`);
  }
  const downloadBuf = await downloadRes.arrayBuffer();
  const downloadSeconds = (performance.now() - downloadStart) / 1000;
  const downloadBytes = downloadBuf.byteLength || TEST_BYTES;

  const uploadBody = new Uint8Array(TEST_BYTES);
  const uploadStart = performance.now();
  const uploadRes = await fetch(`${apiUrl}/api/agents/speed-test/upload`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/octet-stream",
      "Content-Length": String(TEST_BYTES),
    },
    body: uploadBody,
  });
  if (!uploadRes.ok) {
    throw new Error(`Speed test upload failed (${uploadRes.status})`);
  }
  const uploadSeconds = (performance.now() - uploadStart) / 1000;

  return {
    downloadMbps: mbps(downloadBytes, downloadSeconds),
    uploadMbps: mbps(TEST_BYTES, uploadSeconds),
  };
}
