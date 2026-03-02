import paramiko
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect('72.61.101.24', username='root', password='GPL?root85420', timeout=30)
def run(cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    return (stdout.read().decode() + stderr.read().decode()).strip()

print("=== TRAEFIK LOGS (last 20) ===")
print(run('docker logs traefik-traefik-1 2>&1 | tail -20'))
print("\n=== VIBECRAFT STATUS ===")
print(run('docker ps | grep mcp'))
print("\n=== ACME CERTS ===")
print(run('ls /var/lib/docker/volumes/traefik_traefik-data/_data/ 2>/dev/null || docker inspect traefik-traefik-1 --format "{{range .Mounts}}{{.Source}}{{end}}"'))
client.close()
