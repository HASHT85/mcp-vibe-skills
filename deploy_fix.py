import paramiko
import os

print("Connecting to VPS...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

print("Uploading docker-compose.prod.yml...")
sftp = client.open_sftp()
sftp.put('docker-compose.prod.yml', '/opt/vibecraft/docker-compose.prod.yml')
sftp.close()

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    return out

print("Restarting the docker container in /opt/vibecraft...")
out = run("cd /opt/vibecraft && docker compose -f docker-compose.prod.yml up -d", timeout=60)
print(out)

print("Fetching container status...")
import time
time.sleep(10)
state = run("docker inspect mcp-vibe-skills | jq '.[0].State'")
print(state)

client.close()
