import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

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
