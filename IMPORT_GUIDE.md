# Medicine CSV Bulk Import Guide

## Overview
This guide explains how to efficiently import 250k+ medicines from a CSV file into your MedPrice database.

## Prerequisites

1. **CSV file** with these columns (in any order):
   - `product_name` (required) — full medicine name
   - `sub_category` — therapeutic category (e.g., "Human Insulin Basal")
   - `salt_composition` — active ingredients (e.g., "Insulin Isophane (40IU)")
   - `product_manufactured` — manufacturer name
   - `medicine_desc` — product description
   - `side_effects` — comma-separated side effects list
   - `drug_interactions` — interactions data (currently unused)
   - `product_price` — price data (currently unused; for reference only)

2. **Dependencies installed**:
   ```bash
   npm install
   ```

## How to Run

### Option 1: Quick Start (from project root)
```bash
npm run import-csv -- /path/to/your/medicines.csv
```

**Example:**
```bash
npm run import-csv -- ~/Downloads/medicines.csv
npm run import-csv -- ./data/medicines_250k.csv
```

### Option 2: With npm script (if you created a local symlink)
```bash
npm run import-csv -- medicines.csv
```

## What Happens During Import

### Processing Steps
1. **CSV streaming** — Reads file line-by-line (memory-efficient)
2. **Validation** — Skips rows missing `product_name`
3. **Normalization** — Converts names to lowercase, removes special chars
4. **Deduplication** — Merges duplicate medicines within CSV, keeping the most complete data
5. **Batching** — Groups into 500-record batches for efficient DB inserts
6. **Insert** — Uses `Prisma.createMany()` for bulk inserts (much faster than row-by-row)
7. **Verification** — Reports count and checks for duplicates

### Expected Performance
- **250,000 medicines**: 2–8 minutes (depending on CSV size and disk speed)
- **Memory usage**: ~20–50MB peak
- **Database size growth**: ~100–200MB

### Progress Output
You'll see logs like:
```
📋 Starting import from: medicines.csv

📖 Read 250000 rows from CSV
🚫 Skipped 0 invalid rows (missing name)

📦 Processing 248500 unique medicines (after merge)

✓ Batch 1: Inserted 500/500 medicines
⏳ Progress: 500/248500 (0.2%)
✓ Batch 2: Inserted 500/500 medicines
⏳ Progress: 1000/248500 (0.4%)
...
✅ Import complete!
   Total medicines inserted: 248500
   Skipped (duplicates): 0

📊 Database now contains 248500 medicines total
```

## Data Mapping

The import script maps CSV columns to Medicine database fields:

| CSV Column | Database Field | Handling |
|---|---|---|
| `product_name` | `name` | Required; used to generate `normalizedName` |
| `sub_category` | `category` | Stored as-is |
| `salt_composition` | `saltComposition` | Stored as-is |
| `product_manufactured` | `manufacturer` | Stored as-is |
| `medicine_desc` | `description` | Stored as long text |
| `side_effects` | `sideEffects` | Comma-separated list, trimmed |
| *(inferred)* | `dosageForm` | Extracted from `product_name` (Tablet, Injection, Capsule, etc.) |
| *(auto)* | `isCatalog` | Set to `true` for all bulk imports |
| *(auto)* | `soldOnline` | Set to `true` for all |
| *(auto)* | `prescriptionRequired` | Set to `false` for all |

## Duplicate Handling

### Within CSV
If the same medicine appears twice (after name normalization):
- **Merge strategy**: Keeps the version with more complete data
- **Example**: If "Crocin 500mg" appears in rows 100 and 5000:
  - Row 100: has description, no side effects
  - Row 5000: has side effects, no description
  - **Result**: Merged record with both fields

### In Database
- Uses `skipDuplicates: true` in Prisma
- Skips any medicines already in the database (by `normalizedName`)
- No existing records are overwritten

## Before You Import

### 1. Backup Your Database
```bash
cp prisma/dev.db prisma/dev.db.backup
```

### 2. Validate CSV Format
Check the first few lines of your CSV:
```bash
head -5 medicines.csv
```

Make sure it has the expected columns and no obvious corruption.

### 3. Check Available Disk Space
250k medicines + indexes will add ~200MB:
```bash
df -h
```

## After Import

### Verify Success
```bash
# Count total medicines
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Medicine;"

# Verify uniqueness on normalizedName
sqlite3 prisma/dev.db "SELECT COUNT(DISTINCT normalizedName) FROM Medicine;"

# Sample a medicine
sqlite3 prisma/dev.db "SELECT name, manufacturer FROM Medicine WHERE category = 'Human Insulin Basal' LIMIT 3;"
```

### Test the Search Endpoint
```bash
curl "http://localhost:3000/api/medicines/search?q=crocin"
```

You should see imported medicines in the autocomplete results.

### Check Search Performance
The search should be instant (<100ms) due to the `normalizedName` index.

## Troubleshooting

### "File not found: ..."
- Make sure the path to your CSV is correct
- Use absolute paths or relative paths from the project root
- **Example**: `npm run import-csv -- /Users/yourname/Downloads/medicines.csv`

### "UNIQUE constraint failed: normalizedName"
- **Cause**: CSV has duplicate medicines (same normalized name)
- **Solution**: The script should handle this automatically with the merge logic
- **Workaround**: Pre-deduplicate your CSV manually

### Slow import (taking >30 minutes)
- **Check**: Is `medicine_desc` extremely long (megabytes)? This slows inserts.
- **Solution**: Truncate descriptions to <10,000 chars
- **Optimization**: Try increasing batch size in the script (change `BATCH_SIZE` from 500 to 1000)

### Database locked / "database is locked" error
- **Cause**: Other processes accessing the database
- **Solution**:
  1. Stop `npm run dev` (close the Next.js dev server)
  2. Stop any other database connections
  3. Retry the import
  4. Restart dev server after import completes

### Out of memory during import
- **Cause**: CSV is extremely large or rows are very wide
- **Solution**: Reduce batch size in the script (change `BATCH_SIZE` from 500 to 250)

## Performance Tips

1. **Disable other services** while importing:
   - Stop `npm run dev`
   - Stop any workers or background tasks
   - Close other apps using disk I/O

2. **Use SSD** for database file
   - SQLite on HDD is much slower
   - Consider moving `prisma/dev.db` to SSD temporarily

3. **Monitor during import**:
   ```bash
   # In another terminal, watch disk I/O
   iostat -x 1
   ```

4. **Increase batch size** if you have >8GB RAM:
   - Edit `scripts/import-medicines-from-csv.ts`
   - Change `const BATCH_SIZE = 500;` to `1000` or `2000`

## After Successful Import

1. **Verify search works**: Test the search autocomplete in the UI
2. **Run other seeds**: If needed, you can run other seed scripts now
3. **Test basket comparison**: Try the basket view with imported medicines
4. **Clean up**: Delete the CSV file if you no longer need it

## Example: Full Workflow

```bash
# 1. Prepare CSV at ~/medicines.csv

# 2. Backup database
cp prisma/dev.db prisma/dev.db.backup

# 3. Stop dev server (if running)
# Ctrl+C in the dev terminal

# 4. Install dependencies (if not done)
npm install

# 5. Run import
npm run import-csv -- ~/medicines.csv

# Expected output:
# ✅ Import complete!
#    Total medicines inserted: 248500

# 6. Verify
sqlite3 prisma/dev.db "SELECT COUNT(*) FROM Medicine;"
# Output: 248500

# 7. Restart dev server
npm run dev

# 8. Test in browser
# Visit http://localhost:3000/search?q=crocin
# Should see imported medicines in results
```

## Questions?

Check the script logs for detailed error messages. Each batch reports:
- ✓ Success: "Inserted X/500 medicines"
- ✗ Failure: Error message with details

If you see failures, it's usually due to:
- Invalid CSV format (check columns)
- Disk space (unlikely but possible)
- Duplicate constraints (handled by merge logic)

---

**Happy importing! 🚀**
