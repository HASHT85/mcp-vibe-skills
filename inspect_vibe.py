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
    out = stdout.read().decode().strip()
    return out

with open('debug_vibe.txt', 'w', encoding='utf-8') as f:
    f.write("=== CONTAINER STATE ===\n")
    state = run("docker inspect mcp-vibe-skills | jq '.[0].State'")
    f.write(state)

    f.write("\n\n=== CONTAINER NETWORKS ===\n")
    networks = run("docker inspect mcp-vibe-skills | jq '.[0].NetworkSettings'")
    f.write(networks)
    
    f.write("\n\n=== CONTAINER LOGS ===\n")
    logs = run("docker logs mcp-vibe-skills --tail 50 2>&1")
    f.write(logs)

client.close()
