import os
import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ.get('VPS_HOST')
password = os.environ.get('VPS_PASS')
if not host or not password:
    print("Error: VPS_HOST and VPS_PASS environment variables must be set.")
    exit(1)
client.connect(host, username='root', password=password, timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    return (stdout.read().decode() + stderr.read().decode()).strip()

# Read Traefik compose
print("=== /docker/traefik/docker-compose.yml ===")
print(run('cat /docker/traefik/docker-compose.yml'))

print("\n=== TRAEFIK RECENT LOGS ===")
print(run('docker logs traefik-traefik-1 2>&1 | tail -20'))

client.close()
