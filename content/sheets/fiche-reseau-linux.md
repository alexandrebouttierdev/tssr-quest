# Configurer le réseau sous Debian

- `ip a` : adresses ; `ip r` : routes (passerelle = `default via`) ; `cat /etc/resolv.conf` : DNS.
- **Temporaire** (perdu au redémarrage) : `sudo ip addr add 192.168.10.30/24 dev ens33`, `sudo ip route add default via 192.168.10.254`.
- **Permanent** : `/etc/network/interfaces`
  ```
  allow-hotplug ens33
  iface ens33 inet static
      address 192.168.10.30/24
      gateway 192.168.10.254
  ```
  (`iface ens33 inet dhcp` pour le DHCP).
- **Appliquer** : `sudo ifdown ens33 && sudo ifup ens33`, ou `sudo systemctl restart networking`.
- **DNS** : `/etc/resolv.conf` - `nameserver 192.168.10.1`, `search lab.local`.
- **Tester** : `ping -c 2 192.168.10.254`, `ping -c 2 srv-dc01`, `ss -tlnp` (ports en écoute).

**À retenir** : modifier le réseau d'un serveur à distance, c'est risquer de couper sa propre session SSH. Avoir un accès console de secours.
