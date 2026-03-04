import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    return out

with open('debug_acme.txt', 'w', encoding='utf-8') as f:
    f.write("=== TRAEFIK ACME LOGS (Full) ===\n")
    logs = run("docker logs traefik-traefik-1 --tail 1000 2>&1 | grep -i 'acme' || true")
    f.write(logs)
    
    f.write("\n\n=== DOCKER LOGS TRAEFIK (Last 100 Errors) ===\n")
    error_logs = run("docker logs traefik-traefik-1 --tail 1000 2>&1 | grep -i 'error' || true")
    f.write(error_logs)

    f.write("\n\n=== ACME.JSON CONTENTS ===\n")
    acme = run("cat /docker/traefik/letsencrypt/acme.json || cat /var/lib/docker/volumes/traefik-letsencrypt/_data/acme.json || true")
    f.write(acme[:2000] if len(acme) > 2000 else acme)

client.close()
