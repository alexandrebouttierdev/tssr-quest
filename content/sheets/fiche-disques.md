# Disques, partitions et LVM

- **Voir** : `lsblk` (arbre des disques), `sudo blkid` (UUID, type), `df -h` (occupation), `sudo fdisk -l`.
- **Partitionner** : `sudo fdisk /dev/sdb` - `n` nouvelle, `p` primaire, `t` type (`lvm`), `p` afficher, `w` écrire, `q` quitter sans écrire.
- **LVM** : disque → `pvcreate /dev/sdb1` → `vgcreate vg_data /dev/sdb1` → `lvcreate -L 10G -n lv_partage vg_data`. Voir avec `pvs`, `vgs`, `lvs`.
- **Formater** : `sudo mkfs.ext4 /dev/vg_data/lv_partage`.
- **Monter** : `sudo mkdir /srv/partage`, `sudo mount /dev/vg_data/lv_partage /srv/partage` ; `umount` pour démonter.
- **Permanent** : ligne dans `/etc/fstab` - `/dev/mapper/vg_data-lv_partage /srv/partage ext4 defaults 0 2` ; tester avec `sudo mount -a`.
- **Agrandir** : `sudo lvextend -r -L +5G /dev/vg_data/lv_partage` (-r agrandit aussi le système de fichiers) ; `vgextend` pour ajouter un disque au groupe.

**À retenir** : `w` dans fdisk efface la table de partitions précédente. Vérifier deux fois le nom du disque.
