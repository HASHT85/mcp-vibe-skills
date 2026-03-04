import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    return out

with open('debug_frontend.txt', 'w', encoding='utf-8') as f:
    f.write("=== DASHBOARD LABELS ===\n")
    f.write(run("docker inspect mcp-vibe-dashboard | jq '.[0].Config.Labels'"))
    
    f.write("\n\n=== BACKEND LABELS ===\n")
    f.write(run("docker inspect mcp-vibe-skills | jq '.[0].Config.Labels'"))

    f.write("\n\n=== DASHBOARD LOGS ===\n")
    f.write(run("docker logs mcp-vibe-dashboard --tail 20 2>&1"))
    
    f.write("\n\n=== TRAEFIK LOGS ===\n")
    f.write(run("docker logs traefik-traefik-1 --tail 50 2>&1 | grep -i 'vibecraft' || true"))

client.close()
