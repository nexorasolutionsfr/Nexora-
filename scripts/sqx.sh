#!/bin/bash
# Lecture seule. $1 = project-ref, $2 = fichier SQL.
supabase db query --linked --project-ref "$1" -f "$2" -o json 2>/dev/null | python3 -c "
import sys
s=sys.stdin.read(); i=s.find('{')
print(s[i:] if i>=0 else '[]')
"
