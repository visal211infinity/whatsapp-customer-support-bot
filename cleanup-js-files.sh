#!/bin/bash

# Cleanup script to remove old JavaScript files after TypeScript conversion
# Run this only after you've confirmed the TypeScript version works!

echo "🧹 WhatsApp-Telegram Bot - JavaScript Cleanup Script"
echo "=================================================="
echo ""
echo "⚠️  WARNING: This will delete all .js files in src/ and config/"
echo "Make sure the TypeScript version works before running this!"
echo ""
read -p "Are you sure you want to continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ Cleanup cancelled"
    exit 1
fi

echo ""
echo "🗑️  Removing JavaScript files..."

# Count files before deletion
JS_COUNT=$(find src config -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "Found $JS_COUNT JavaScript files to remove"

if [ "$JS_COUNT" -eq 0 ]; then
    echo "✅ No JavaScript files found. Already clean!"
    exit 0
fi

# Remove JavaScript files
find src config -name "*.js" -type f -delete 2>/dev/null

# Verify deletion
REMAINING=$(find src config -name "*.js" -type f 2>/dev/null | wc -l | tr -d ' ')

if [ "$REMAINING" -eq 0 ]; then
    echo "✅ Successfully removed $JS_COUNT JavaScript files"
    echo ""
    echo "📦 Your project is now fully TypeScript!"
    echo "Run 'pnpm run dev' to start the TypeScript version"
else
    echo "⚠️  Some files couldn't be deleted. Check permissions."
fi

echo ""
echo "Done! 🎉"

