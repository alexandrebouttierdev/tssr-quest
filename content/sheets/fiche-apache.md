# Apache sous Debian

- Installer : `sudo apt install apache2` ; pages dans `/var/www/`.
- **Sites** : un fichier par site dans `/etc/apache2/sites-available/`, activé par un lien dans `sites-enabled/` :
  ```
  <VirtualHost *:80>
      ServerName intranet.lab.local
      DocumentRoot /var/www/intranet
  </VirtualHost>
  ```
- `sudo a2ensite intranet`, `sudo a2dissite 000-default` ; modules : `a2enmod`, `a2dismod`.
- **Toujours** `sudo apache2ctl configtest` (« Syntax OK ») avant `sudo systemctl reload apache2`.
- Journaux : `/var/log/apache2/error.log` et `access.log`, `journalctl -u apache2`.

**À retenir** : reload recharge la configuration sans couper les connexions ; un configtest raté évite de casser le site en production.
