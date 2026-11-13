'use strict';
const os = require('os');

function ipToInt(ip) { return ip.split('.').reduce((a, b) => ((a << 8) + Number(b)) >>> 0, 0); }
function intToIp(n) { return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'); }

/* Adapters made by virtual machines, containers and VPNs are the wrong address to give another laptop.
   The names catch most of them; the address ranges catch VirtualBox, Docker and similar that are named "Ethernet 2". */
const VIRTUAL_NAME = /vethernet|virtualbox|vbox|vmware|vmnet|hyper-v|docker|wsl|\bveth|^br-|^virbr|bridge|\btap\b|^tun\d|utun|awdl|llw|anpi|isatap|teredo|pseudo|bluetooth/i;
const VIRTUAL_IP = /^(192\.168\.56\.|192\.168\.99\.|10\.0\.2\.|172\.17\.|172\.18\.|192\.168\.122\.)/;
const VPN_NAME = /tailscale|zerotier|wireguard|^wg\d|openvpn|vpn|hamachi/i;
const CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;       /* Tailscale and similar */

function rank(ip, name) {
  name = name || '';
  let r = 5;
  if (/^192\.168\./.test(ip)) r = 0;
  else if (/^10\./.test(ip)) r = 1;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) r = 2;
  else if (/^169\.254\./.test(ip)) r = 9;                       /* link-local, last resort */
  if (/^wi-?fi|^wlan|^wl\w|^en0$|wireless/i.test(name)) r -= 0.5;
  if (VPN_NAME.test(name) || CGNAT.test(ip)) r += 20;
  if (VIRTUAL_NAME.test(name) || VIRTUAL_IP.test(ip)) r += 30;
  return r;
}

/* The IPv4 addresses of this computer on real networks, best first, with the broadcast address of each. */
function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family !== 'IPv4' || a.internal || !a.netmask) continue;
      const ip = ipToInt(a.address), mask = ipToInt(a.netmask);
      out.push({ name, ip: a.address, rank: rank(a.address, name), broadcast: intToIp(((ip & mask) | (~mask >>> 0)) >>> 0) });
    }
  }
  out.sort((x, y) => x.rank - y.rank);
  return out;
}

module.exports = { lanAddresses, ipToInt, intToIp, rank };
