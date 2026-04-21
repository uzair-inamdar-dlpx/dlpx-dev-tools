# SSH Key Setup for Delphix Hosts

Sets up passwordless SSH access to the three hosts`:

| Short name | Hostname |
| --- | --- |
| `dcol1` | `dcol1.delphix.com` |
| `dcol2` | `dcol2.delphix.com` |
| `dlpxdc` | `dlpxdc.co` |

## 1. Generate a key

```
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_delphix -C "you@delphix"
```

## 2. Copy the key to each host

Run these one at a time — each will prompt for your Delphix LDAP password.

```
ssh-copy-id -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password \
  -i ~/.ssh/id_ed25519_delphix.pub <ldap-username>@dcol1.delphix.com

ssh-copy-id -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password \
  -i ~/.ssh/id_ed25519_delphix.pub <ldap-username>@dcol2.delphix.com

ssh-copy-id -o StrictHostKeyChecking=accept-new -o PreferredAuthentications=password \
  -i ~/.ssh/id_ed25519_delphix.pub <ldap-username>@dlpxdc.co
```

Replace `<ldap-username>` with your Delphix LDAP username (e.g. `jane.smith`).

The `-o PreferredAuthentications=password` flag skips publickey attempts during copy, avoiding
"Too many authentication failures" on servers with a low `MaxAuthTries`.

## 3. Add SSH config shortcuts

Append to `~/.ssh/config` (substitute your LDAP username):

```
Host dcol1
  HostName dcol1.delphix.com
  User <ldap-username>
  IdentityFile ~/.ssh/id_ed25519_delphix
  IdentitiesOnly yes
  AddKeysToAgent yes

Host dcol2
  HostName dcol2.delphix.com
  User <ldap-username>
  IdentityFile ~/.ssh/id_ed25519_delphix
  IdentitiesOnly yes
  AddKeysToAgent yes

Host dlpxdc
  HostName dlpxdc.co
  User <ldap-username>
  IdentityFile ~/.ssh/id_ed25519_delphix
  IdentitiesOnly yes
  AddKeysToAgent yes
```

## 4. Load the key into your SSH agent

```
ssh-add ~/.ssh/id_ed25519_delphix
```

To survive reboots (macOS):

```
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_delphix
```

## 5. Verify

```
ssh dcol1 dc version
ssh dcol2 dc version
ssh dlpxdc dc version
```

Each should respond without a password prompt.

## Troubleshooting

**"Host key verification failed"** — the host was reprovisioned. Remove the stale entry and retry
the `ssh-copy-id`:

```
ssh-keygen -R dcol1.delphix.com   # or dcol2.delphix.com / dlpxdc.co
```
