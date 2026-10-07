#!/usr/bin/env python3
"""Ajouter les voisins aux contours existants (Python + Shapely, hors application)."""
import argparse
import json
from itertools import combinations
from pathlib import Path

from shapely import make_valid
from shapely.geometry import shape


def prepare(collection):
    features = collection['features']
    boundaries = {
        f['properties']['code']: make_valid(shape(f['geometry'])).boundary for f in features
    }
    neighbors = {code: set() for code in boundaries}
    for first, second in combinations(boundaries, 2):
        # Une frontière commune, pas une distance entre centres ni un simple point.
        if boundaries[first].intersection(boundaries[second]).length > 0:
            neighbors[first].add(second)
            neighbors[second].add(first)
    for feature in features:
        feature['properties']['neighbors'] = sorted(neighbors[feature['properties']['code']])
    return collection


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, default=Path('data/geography/departments.geojson'))
    args = parser.parse_args()
    collection = prepare(json.loads(args.file.read_text()))
    args.file.write_text(json.dumps(collection, ensure_ascii=False, separators=(',', ':')) + '\n')
    count = sum(len(f['properties']['neighbors']) for f in collection['features']) // 2
    print(f"{len(collection['features'])} départements, {count} frontières communes.")
