import paramiko
import json

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

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
