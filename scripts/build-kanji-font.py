#!/usr/bin/env python3
"""Recorta Klee One (SIL OFL) a los caracteres del catálogo de kanji.

Uso:  pip install fonttools brotli
      python scripts/build-kanji-font.py path/a/KleeOne-Regular.ttf
Salida: public/fonts/KleeOne-kanji.woff2
Fuente: https://github.com/fontworks-fonts/Klee (incluir su licencia OFL en public/fonts/).
Repetir al añadir kanji nuevos a src/app/core/learning/kanji-composition.ts.
"""
import re, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = (root / 'src/app/core/learning/kanji-composition.ts').read_text(encoding='utf-8')
chars = set(re.findall(r'[぀-ヿ㐀-鿿＀-￯]', src))
chars |= {chr(c) for c in range(0x3041, 0x3097)} | {chr(c) for c in range(0x30a1, 0x30fb)}
chars |= {'ー', '々', '・', '、', '。', '=', '+'} | {chr(c) for c in range(0x20, 0x7f)}
if len(sys.argv) != 2:
    sys.exit(__doc__)
out = root / 'public/fonts/KleeOne-kanji.woff2'
out.parent.mkdir(parents=True, exist_ok=True)
subprocess.run(['pyftsubset', sys.argv[1], f'--text={"".join(sorted(chars))}',
                '--flavor=woff2', f'--output-file={out}', '--layout-features=*'], check=True)
print(f'{len(chars)} caracteres -> {out} ({out.stat().st_size} bytes)')
