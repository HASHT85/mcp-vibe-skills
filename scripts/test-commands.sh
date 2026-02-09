#!/bin/bash
# Test commands for mcp-vibe-skills orchestrator
# Usage: bash scripts/test-commands.sh

BASE_URL="${BASE_URL:-http://localhost:3000}"
echo "Testing against: $BASE_URL"
echo ""

echo "=== Health Check ==="
curl -s "$BASE_URL/health" | jq .
echo ""

echo "=== List Agents ==="
curl -s "$BASE_URL/agents" | jq .
echo ""

echo "=== Create Agent ==="
AGENT_RESPONSE=$(curl -s -X POST "$BASE_URL/agents" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-agent"}')
echo "$AGENT_RESPONSE" | jq .
AGENT_ID=$(echo "$AGENT_RESPONSE" | jq -r '.agent.id')
echo "Created agent: $AGENT_ID"
echo ""

echo "=== Assign Skill ==="
curl -s -X POST "$BASE_URL/agents/$AGENT_ID/skills" \
  -H "Content-Type: application/json" \
  -d '{
    "owner": "vercel-labs",
    "repo": "agent-skills",
    "skill": "web-design",
    "href": "https://skills.sh/vercel-labs/agent-skills/web-design",
    "title": "Web Design"
  }' | jq .
echo ""

echo "=== List Agent Skills ==="
curl -s "$BASE_URL/agents/$AGENT_ID/skills" | jq .
echo ""

echo "=== Create Project ==="
PROJECT_RESPONSE=$(curl -s -X POST "$BASE_URL/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "test-project", "templateId": "mcp-orchestrator"}')
echo "$PROJECT_RESPONSE" | jq .
PROJECT_ID=$(echo "$PROJECT_RESPONSE" | jq -r '.project.id')
echo "Created project: $PROJECT_ID"
echo ""

echo "=== Get Project Full ==="
curl -s "$BASE_URL/projects/$PROJECT_ID/full" | jq .
echo ""

echo "=== Add Agent to Project ==="
curl -s -X POST "$BASE_URL/projects/$PROJECT_ID/agents" \
  -H "Content-Type: application/json" \
  -d '{"name": "added-agent", "role": "backend"}' | jq .
echo ""

echo "=== Tail Events ==="
curl -s "$BASE_URL/events?limit=20" | jq '.events | length' 
echo " events found"
echo ""

echo "=== List Profiles ==="
curl -s "$BASE_URL/profiles" | jq '.profiles | length'
echo " profiles available"
echo ""

echo "=== List Templates ==="
curl -s "$BASE_URL/templates" | jq '.templates | length'
echo " templates available"
echo ""

echo "✅ All manual tests complete!"
