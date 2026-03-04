import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    return out

with open('debug_frontend_health.txt', 'w', encoding='utf-8') as f:
    f.write("=== DASHBOARD STATE ===\n")
    f.write(run("docker inspect mcp-vibe-dashboard | jq '.[0].State'"))
    
    f.write("\n\n=== BACKEND STATE ===\n")
    f.write(run("docker inspect mcp-vibe-skills | jq '.[0].State'"))

client.close()
