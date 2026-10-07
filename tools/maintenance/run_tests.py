#!/usr/bin/env python3
"""Exécute chaque suite existante dans son propre processus, sans service distant réel."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

REPO = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--unit', action='store_true', help='Moteurs et contrats Node uniquement.')
    group.add_argument('--browser', action='store_true', help='Parcours Chromium uniquement.')
    parser.add_argument(
        '--jobs',
        type=int,
        default=2,
        choices=range(1, 5),
        help='Suites simultanées (2 par défaut).',
    )
    parser.add_argument('--report', type=Path, default=Path('/tmp/jdd-test-results.json'))
    args = parser.parse_args()
    suites = []
    if not args.browser:
        suites.extend(
            (file, ['node', str(file)])
            for file in sorted((REPO / 'tests/unit').iterdir())
            if file.suffix in {'.cjs', '.mjs'}
        )
    if not args.unit:
        missing = [
            name
            for name in ['playwright', 'PIL', 'openpyxl']
            if importlib.util.find_spec(name) is None
        ]
        if missing or not (os.environ.get('PWA_TEST_CHROMIUM') or shutil.which('chromium')):
            parser.error(
                'Installer requirements-test.txt et Chromium avant les tests navigateur ; dépendances manquantes : '
                + ', '.join(missing)
            )
        suites.extend(
            (file, [sys.executable, str(file)])
            for file in sorted((REPO / 'tests/browser').glob('*_smoke.py'))
        )
    environment = {**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
    environment.setdefault(
        'JDD_PGLITE_MODULE', str(REPO / 'node_modules/@electric-sql/pglite/dist/index.js')
    )
    log_directory = Path('/tmp/jdd-test-logs')
    log_directory.mkdir(exist_ok=True)

    def run(suite):
        file, command = suite
        label = str(file.relative_to(REPO))
        started = time.monotonic()
        log = log_directory / (file.stem + '.log')
        print('RUN  ' + label, flush=True)
        with log.open('w') as output:
            result = subprocess.run(
                command, cwd=REPO, env=environment, stdout=output, stderr=subprocess.STDOUT
            )
        row = {
            'suite': label,
            'passed': result.returncode == 0,
            'exitCode': result.returncode,
            'seconds': round(time.monotonic() - started, 2),
            'log': str(log),
        }
        print(
            ('PASS ' if row['passed'] else 'FAIL ') + label + f" ({row['seconds']} s)", flush=True
        )
        if not row['passed']:
            print(log.read_text()[-10000:], flush=True)
        return row

    results = []
    with ThreadPoolExecutor(max_workers=args.jobs) as pool:
        for job in as_completed([pool.submit(run, suite) for suite in suites]):
            results.append(job.result())
    results.sort(key=lambda row: row['suite'])
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
    failed = [row for row in results if not row['passed']]
    print(
        f'{len(results) - len(failed)}/{len(results)} suites réussies. Rapport : {args.report}',
        flush=True,
    )
    return int(bool(failed))


if __name__ == '__main__':
    raise SystemExit(main())
