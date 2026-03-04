import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return f"{out}\n{err}" if err else out

with open('debug_output.txt', 'w', encoding='utf-8') as f:
    f.write("=== /docker/traefik/docker-compose.yml ===\n")
    f.write(run('cat /docker/traefik/docker-compose.yml || cat /etc/dokploy/traefik/docker-compose.yml'))
    f.write("\n\n")

    f.write("=== TRAEFIK ACME LOGS ===\n")
    container_name = run("docker ps --format '{{.Names}}' | grep traefik | head -n 1").strip()
    if container_name:
        f.write(f"Found Traefik container: {container_name}\n")
        f.write(run(f"docker logs {container_name} 2>&1 | grep -E 'acme|error|ERR|level=error' | tail -50"))
    else:
        f.write("Traefik container not found!\n")
    f.write("\n\n")

    f.write("=== VIBECRAFT LABELS ===\n")
    vc_container = run("docker ps -a --format '{{.Names}}' | grep -i vibecraft | head -n 1").strip()
    if vc_container:
        f.write(f"Found VibeCraft container: {vc_container}\n")
        f.write(run(f"docker inspect {vc_container} | jq '.[0].Config.Labels'"))
    else:
        f.write("VibeCraft container not found!\n")

client.close()
