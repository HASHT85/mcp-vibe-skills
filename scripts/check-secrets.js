import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

// Patterns to block, split so the scanner doesn't flag itself!
const SECRETS_PATTERNS = [
    { name: 'Anthropic API Key', regex: new RegExp('sk-' + 'ant-api03-[a-zA-Z0-9_-]{80,}') },
    { name: 'OpenAI API Key', regex: new RegExp('sk-' + 'proj-[a-zA-Z0-9_-]+') },
    { name: 'GitHub Token', regex: new RegExp('(ghp|gho|ghu|ghs|ghr)_' + '[a-zA-Z0-9]{36}') },
    { name: 'Google API Key', regex: new RegExp('AIza' + '[0-9A-Za-z_-]{35}') },
    { name: 'AWS Access Key', regex: new RegExp('(A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)' + '[A-Z0-9]{16}') },
    // SEC-39: Generic high-entropy token detector (catches long base64-like secrets)
    { name: 'Generic Long Token', regex: new RegExp('["''][a-zA-Z0-9_/+\\-]{40,}["'']') },
];

try {
    // Get list of staged files
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf-8' })
        .split('\n')
        .filter(file => file.trim() !== '');

    if (stagedFiles.length === 0) {
        process.exit(0);
    }

    console.log(`${YELLOW}🔍 Moteur de sécurité interne: Scanning ${stagedFiles.length} fichiers pour des secrets...${RESET}`);

    let secretsFound = false;

    for (const file of stagedFiles) {
        if (file === 'scripts/check-secrets.js') continue; // Don't scan the scanner

        try {
            const content = readFileSync(file, 'utf-8');
            const lines = content.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];

                for (const pattern of SECRETS_PATTERNS) {
                    if (pattern.regex.test(line)) {
                        console.error(`\n${RED}🚨 FUITES DETECTEES ! SECRET TROUVÉ 🚨${RESET}`);
                        console.error(`${RED}Fichier:${RESET} ${file}:${i + 1}`);
                        console.error(`${RED}Type:${RESET} ${pattern.name}`);
                        console.error(`${RED}Ligne:${RESET} ${line.substring(0, 50).trim()}...`);
                        secretsFound = true;
                    }
                }
            }
        } catch (e) {
            // Ignore if file is binary or can't be read easily
        }
    }

    if (secretsFound) {
        console.error(`\n${RED}❌ Le commit a été bloqué car il contient des secrets.${RESET}`);
        console.error(`${YELLOW}Pour outrepasser cette sécurité (NON RECOMMANDÉ), utilisez git commit --no-verify${RESET}`);
        process.exit(1);
    }

    console.log(`${GREEN}✅ Aucun secret testé détecté en clair.${RESET}`);
    process.exit(0);
} catch (error) {
    console.error(`${RED}Erreur lors du scan de sécurité: ${error.message}${RESET}`);
    process.exit(1);
}
