import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / 'frontend' / 'public' / 'data'


def main() -> None:
    analog_sites = json.loads((DATA_DIR / 'analog-sites.json').read_text(encoding='utf-8'))
    planetary_zones = json.loads((DATA_DIR / 'planetary-zones.json').read_text(encoding='utf-8'))

    summary = {
        'totalAnalogSites': len(analog_sites),
        'totalTargetZones': len(planetary_zones),
        'dataStatus': 'catalog-only',
        'note': 'Catalog coordinates are reference locations; elevation measurements are sampled from public DEM services at comparison time.',
    }

    (DATA_DIR / 'summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    print('Processed data summary written to frontend/public/data/summary.json')


if __name__ == '__main__':
    main()
