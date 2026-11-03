#!/usr/bin/env bash
# Flags migration statements that break the version of the app still running.
#
#   check-migrations.sh <migration.sql>...
#
# A deploy migrates the database while the previous version may still be
# serving, and a rollback runs the previous version against the new schema.
# Both work only while a migration leaves the old code working. Adding tables
# and nullable columns, or columns with a default, is fine. Dropping, renaming,
# retyping or tightening something the old code uses is not: stop using it in
# one release, and change it in a later one.
#
# Prints GitHub annotations, and exits 1 when it finds any of the errors.
set -uo pipefail

S='[[:space:]]'
errors=0
warnings=0

flag() { # level file line title message
  echo "::$1 file=$2,line=$3,title=$4::$5"
  if [ "$1" = "error" ]; then errors=$((errors + 1)); else warnings=$((warnings + 1)); fi
}

for file in "$@"; do
  [ -f "$file" ] || continue
  n=0
  while IFS= read -r raw || [ -n "$raw" ]; do
    n=$((n + 1))
    line="${raw%%--*}" # drop comments
    up="${line^^}"

    if [[ $up =~ DROP$S+TABLE ]]; then
      flag error "$file" "$n" "Drops a table" "The version still running may read or write this table."
    fi
    if [[ $up =~ DROP$S+COLUMN ]]; then
      flag error "$file" "$n" "Drops a column" "The version still running selects this column; Prisma reads every column it knows, so every query on the table fails."
    fi
    if [[ $up =~ RENAME$S+COLUMN ]]; then
      flag error "$file" "$n" "Renames a column" "The version still running uses the old name. Add the new column, write both, and drop the old one in a later release."
    fi
    if [[ $up =~ ALTER$S+(TABLE|TYPE)$S.*RENAME$S+TO ]]; then
      flag error "$file" "$n" "Renames a table or type" "The version still running uses the old name. For an enum, this is usually a value being removed or renamed."
    fi
    if [[ $up =~ ALTER$S+COLUMN$S+[^[:space:]]+$S+(SET$S+DATA$S+)?TYPE ]]; then
      flag error "$file" "$n" "Changes a column type" "The version still running reads and writes the old type."
    fi
    if [[ $up =~ SET$S+NOT$S+NULL ]]; then
      flag error "$file" "$n" "Makes a column required" "The version still running may insert rows without it."
    fi
    if [[ $up =~ ADD$S+COLUMN ]] && [[ $up =~ NOT$S+NULL ]] && ! [[ $up =~ DEFAULT ]]; then
      flag error "$file" "$n" "Adds a required column with no default" "The version still running inserts rows without it. Give it a default, or add it nullable and require it in a later release."
    fi
    if [[ $up =~ DROP$S+DEFAULT ]]; then
      flag error "$file" "$n" "Removes a column default" "The version still running leaves the column out of inserts and relies on the default."
    fi
    if [[ $up =~ ALTER$S+TYPE$S.*ADD$S+VALUE ]]; then
      flag warning "$file" "$n" "Adds an enum value" "The version still running cannot read rows that hold the new value. Fine as long as nothing writes it before the deploy is done, and nothing needs a rollback after."
    fi
  done < "$file"
done

if [ "$errors" -gt 0 ]; then
  echo
  echo "$errors statement(s) would break the version still running during a deploy, and the one a rollback puts back."
  echo "Split the change across releases. If it is safe anyway (nothing uses what is dropped, say), add the"
  echo "allow-breaking-migration label to the pull request and say why in its description."
  exit 1
fi
note=""
[ "$warnings" -gt 0 ] && note=" ($warnings warning(s) above)"
echo "Checked $# migration file(s): nothing that breaks the running version$note."
