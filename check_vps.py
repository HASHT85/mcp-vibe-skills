import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)

def run(cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    return (stdout.read().decode() + stderr.read().decode()).strip()

print("=== DOCKER PS ===")
print(run('docker ps'))

print("\n=== HEALTH ===")
print(run('curl -s http://localhost:8080/health'))

print("\n=== TRAEFIK ROUTES ===")
print(run('curl -s http://localhost:8080/ 2>&1 | head -5'))

print("\n=== LOGS (last 10) ===")
print(run('docker logs mcp-vibe-skills --tail 10 2>&1'))

client.close()
