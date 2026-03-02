$path = "c:\Projet\mcp-vibe-skills\mcp-vibe-skills\src\orchestrator.ts"
$lines = Get-Content $path

# Keep lines 0 to 566, and lines 1623 to end
# In PS, array is 0-indexed.
# Line 567 in file is index 566.
# We want to keep lines 1 to 567 (index 0 to 566).
# We want to delete lines 568 to 1623 (index 567 to 1622).
# We want to keep line 1624 onwards (index 1623 to end).

$part1 = $lines[0..566]
$part2 = $lines[1623..($lines.Count - 1)]

$newLines = $part1 + $part2
$newLines | Set-Content $path
Write-Host "Fixed orchestrator.ts"
