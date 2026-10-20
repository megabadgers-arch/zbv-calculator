#!/usr/bin/env python3
"""Prepare a separate GitHub Pages preview; no GitHub/network operations."""
import argparse
import re
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=Path('/workspace/zbv-v2-preview-pages.zip'))
args = parser.parse_args()
original = (ROOT / 'index.html').read_text(encoding='utf-8')
old_key = 'key = "zbv-calculator-v2"'
new_key = 'key = "zbv-calculator-v2-preview"'
if original.count(old_key) != 1:
    raise SystemExit('Expected exactly one storage key; inspect HTML before packaging.')
preview = original.replace(old_key, new_key)
preview = preview.replace('<main>', '<main>\n<p class="badge">ТЕСТОВИЙ ПЕРЕГЛЯД 2.0 — окрема копія, дані лише в цьому браузері</p>', 1)
# The only JavaScript change is the isolated preview storage key.
script = lambda html: re.search(r'<script>([\s\S]*?)</script>', html).group(1)
assert script(preview).replace(new_key, old_key) == script(original)
readme = '''# ZBV Calculator 2.0 — окремий тестовий сайт

Цей архів — статична версія для GitHub Pages. Розрахункові формули не змінено.
Файли index.html, styles.css і .nojekyll мають лежати в корені нового репозиторію.

1. На GitHub створіть ОКРЕМИЙ публічний репозиторій zbv-calculator-v2-preview.
   Не змінюйте megabadgers-arch/zbv-calculator та його налаштування Pages.
2. Розпакуйте архів і завантажте його вміст у новий репозиторій:
   Add file → Upload files → Commit changes. Завантажуйте файли, не сам ZIP.
3. У НОВОМУ репозиторії відкрийте Settings → Pages → Build and deployment.
   Source: Deploy from a branch. Виберіть гілку з завантаженими файлами,
   папку / (root), натисніть Save.
4. Дочекайтеся успішного розгортання. Відкрийте точну HTTPS-адресу,
   показану GitHub у Settings → Pages (Visit site). localhost не потрібен.
   Для власника megabadgers-arch і назви вище очікувана адреса:
   https://megabadgers-arch.github.io/zbv-calculator-v2-preview/
   Адреса почне працювати лише після створення репозиторію та розгортання.

Перевірка: бетон 1, арматура 100, електроенергія 20, праця 5;
інші обсяги 0, ПДВ 20%. Разом без ПДВ 11269, ПДВ 2253,80,
разом з ПДВ 13522,80 грн. Збережіть знімок, додайте й затвердьте
пропозицію бетону з іншою ціною: поточний підсумок зміниться, знімок — ні.
Перевірте CSV-перегляд і експорт/відновлення JSON.

Тестовий сайт використовує окремий ключ localStorage
zbv-calculator-v2-preview. Збереження робиться лише у вашому браузері.
Початкові ціни навчальні; реальні комерційні джерела не підключено.

Після перевірки: у тестовому репозиторії Settings → Pages вимкніть
публікацію (Unpublish site, якщо доступно). Для повернення до тесту
скористайтеся локальною JSON-копією. Видалення сайту не очищає браузерні дані.
'''
args.output.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(args.output, 'w', ZIP_DEFLATED) as archive:
    archive.writestr('index.html', preview)
    archive.writestr('styles.css', (ROOT / 'styles.css').read_bytes())
    archive.writestr('.nojekyll', '')
    archive.writestr('README.md', readme)
with ZipFile(args.output) as archive:
    assert archive.testzip() is None
print(args.output)
print('Verified: JavaScript unchanged except preview storage key; ZIP integrity OK.')
