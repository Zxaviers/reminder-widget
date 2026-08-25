# Opencode Rules - Skill Management

## Skill Discovery & Usage Rules

### 1. Check Installed Skills First
Before starting any task, check what skills are installed:
```bash
# Check opencode's built-in skills directory
ls ~/.config/opencode/skills/

# Check project-level skills
ls .opencode/skills/ 2>/dev/null || ls .agents/skills/ 2>/dev/null || ls .claude/skills/ 2>/dev/null
```

### 2. Skill Matching Rules
| Task Type | Skills to Use |
|-----------|--------------|
| Code review / refactoring | `code-review`, `diagnosing-bugs`, `improve-codebase-architecture` |
| New feature implementation | `implement`, `implement-spec`, `tdd` |
| Bug fixing | `diagnosing-bugs`, `code-review` |
| Codebase exploration | `codebase-design`, `wayfinder`, `graphify` |
| Writing / documentation | `writing-beats`, `writing-for-agents`, `writing-fragments` |
| Research / analysis | `research`, `codebase-design`, `domain-modeling` |
| Testing / TDD | `tdd`, `code-review` |
| Architecture decisions | `codebase-design`, `improve-codebase-architecture`, `domain-modeling` |
| Skill discovery | `setup-matt-pocock-skills`, `graphify` |

### 3. Auto-Install Missing Skills
If a needed skill is not installed:
```bash
# For mattpocock skills (most common)
git clone https://github.com/mattpocock/skills.git ~/.config/opencode/skills/mattpocock --depth 1

# For caveman skills
git clone https://github.com/JuliusBrussee/caveman.git ~/.config/opencode/skills/caveman --depth 1

# For graphify
git clone https://github.com/your-org/graphify ~/.config/opencode/skills/graphify --depth 1
```

Or use the skill setup scripts if available:
```bash
# If setup script exists
.opencode/skills/setup-matt-pocock-skills/install.sh
```

### 4. Skill Loading Priority
1. Project-level skills (`.opencode/skills/`, `.agents/skills/`, `.claude/skills/`)
2. User-level skills (`~/.config/opencode/skills/`)
3. Built-in skills

### 5. When to Use Skills
- **ALWAYS** check for relevant skills at task start
- **USE** the skill tool to load skill instructions
- **FOLLOW** the skill's workflow (e.g., TDD for implementation, code-review for review)
- **DON'T** reinvent patterns that skills already codify

### 6. Project-Specific Skills (this project)
This project has these skills available:
- `.agents/skills/` - mattpocock skills (implement, tdd, code-review, etc.)
- `.claude/skills/` - same skills mirrored for Claude
- `~/.config/opencode/skills/` - caveman, graphify, stitch-google

### 6. Quick Commands
```bash
# List all available skills
ls ~/.config/opencode/skills/ && ls .agents/skills/ 2>/dev/null

# Load a skill
skill <skill-name>

# Example: Load implement skill for feature work
skill implement

# Example: Load code-review for PR review
skill code-review
```

### 7. Emergency Skill Install
If a skill is needed but not found:
```bash
# Quick install mattpocock skills (most comprehensive)
cd /tmp && git clone https://github.com/mattpocock/skills.git --depth 1 && cp -r skills/* ~/.config/opencode/skills/mattpocock/
```

---

## Current Project Skills Status
- ✅ `caveman` - Ultra-compressed communication
- ✅ `graphify` - Knowledge graph from codebase
- ✅ `stitch-google` - Design to code translation
- ✅ `mattpocock/*` (via `.agents/skills/`) - implement, tdd, code-review, etc.

**Auto-install is enabled for missing skills from the above sources.**