#!/usr/bin/env bash
# opencode pre-task hook - checks and installs skills

set -e

SKILLS_DIRS=(
    "$HOME/.config/opencode/skills"
    ".opencode/skills"
    ".agents/skills"
    ".claude/skills"
)

# Check for skills
echo "🔍 Checking available skills..."
for dir in "${SKILLS_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "  📁 $dir:"
        ls -1 "$dir" 2>/dev/null | sed 's/^/    /'
    fi
done

# Auto-install mattpocock skills if missing (most common)
MATTPOCOCK_DIRS=(
    "$HOME/.config/opencode/skills/mattpocock"
    ".agents/skills/mattpocock"
    ".claude/skills/mattpocock"
)

HAS_MATTPOCOCK=false
for dir in "${MATTPOCOCK_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        HAS_MATTPOCOCK=true
        break
    fi
done

if [ "$HAS_MATTPOCOCK" = false ]; then
    echo "⚠️  mattpocock skills not found, installing..."
    mkdir -p "$HOME/.config/opencode/skills"
    git clone --depth 1 https://github.com/mattpocock/skills.git "$HOME/.config/opencode/skills/mattpocock" 2>/dev/null || true
    echo "✅ mattpocock skills installed"
fi

# Check for caveman
CAVEMAN_DIRS=(
    "$HOME/.config/opencode/skills/caveman"
    ".agents/skills/caveman"
)

HAS_CAVEMAN=false
for dir in "${CAVEMAN_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        HAS_CAVEMAN=true
        break
    fi
done

if [ "$HAS_CAVEMAN" = false ]; then
    echo "⚠️  caveman skills not found, installing..."
    mkdir -p "$HOME/.config/opencode/skills"
    git clone --depth 1 https://github.com/JuliusBrussee/caveman.git "$HOME/.config/opencode/skills/caveman" 2>/dev/null || true
    echo "✅ caveman skills installed"
fi

echo "✅ Skill check complete"