import { execFileSync } from 'node:child_process';
import dns from 'node:dns';
import { isIP } from 'node:net';

/**
 * Some Windows Node.js environments expose a loopback resolver to c-ares even
 * though no local DNS proxy is listening. MongoDB SRV discovery uses c-ares,
 * so use the active adapter's configured IPv4 resolvers in local development.
 */
export function configureLocalWindowsDns(): boolean {
  if (process.platform !== 'win32' || process.env.NODE_ENV === 'production') return false;

  const currentServers = dns.getServers();
  const allLoopback = currentServers.length > 0 && currentServers.every(isLoopbackAddress);
  if (!allLoopback) return false;

  try {
    const output = execFileSync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$activeIndexes = @(Get-NetAdapter -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' } | Select-Object -ExpandProperty InterfaceIndex); Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction Stop | Where-Object { $activeIndexes -contains $_.InterfaceIndex } | ForEach-Object { $_.ServerAddresses } | Where-Object { $_ } | Select-Object -Unique",
      ],
      { encoding: 'utf8', timeout: 30_000, windowsHide: true },
    );

    const windowsServers = [...new Set(output.split(/\r?\n/).map((server) => server.trim()).filter((server) => isIP(server) === 4))];
    if (windowsServers.length === 0) return false;

    dns.setServers(windowsServers);
    return true;
  } catch {
    // Preserve startup behavior; MongoDB will report a normal connection error.
    return false;
  }
}

function isLoopbackAddress(address: string): boolean {
  return address === '::1' || address.startsWith('127.');
}
