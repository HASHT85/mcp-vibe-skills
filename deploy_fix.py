import paramiko
import os

print("Connecting to VPS...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
host = os.environ.get('VPS_HOST')
password = os.environ.get('VPS_PASS')
if not host or not password:
    print("Error: VPS_HOST and VPS_PASS environment variables must be set.")
    exit(1)
client.connect(host, username='root', password=password, timeout=30)

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
