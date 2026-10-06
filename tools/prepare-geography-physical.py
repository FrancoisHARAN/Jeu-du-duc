#!/usr/bin/env python3
"""Préparer les repères Natural Earth locaux (Python + Shapely, hors application)."""
import argparse
import hashlib
import json
from pathlib import Path

from shapely import make_valid
from shapely.geometry import MultiLineString, mapping, shape
from shapely.ops import unary_union


def rounded(value):
    if isinstance(value, (tuple, list)):
        return [rounded(item) for item in value]
    return round(value, 4)


def parts(geometry, kind):
    if geometry.is_empty:
        return
    if geometry.geom_type == kind:
        yield geometry
    elif hasattr(geometry, 'geoms'):
        for part in geometry.geoms:
            yield from parts(part, kind)


def feature(geometry, properties):
    geo = mapping(geometry)
    return {'type': 'Feature', 'properties': properties,
            'bbox': rounded(geometry.bounds),
            'geometry': {'type': geo['type'], 'coordinates': rounded(geo['coordinates'])}}


def prepare(rivers_path, regions_path, land_path):
    rivers_source = json.loads(rivers_path.read_text())['features']
    regions_source = json.loads(regions_path.read_text())['features']
    land_source = json.loads(land_path.read_text())['features']
    rivers = []
    for source in rivers_source:
        props = source['properties']
        rank = int(props.get('scalerank', 10))
        if rank > 8 or not props.get('name') or not source.get('geometry'):
            continue
        geometry = shape(source['geometry'])
        if geometry.is_empty:
            continue
        # ~110 m en France/alentours, ~440 m ailleurs, à l'échelle Natural Earth.
        # Garder plus de détail près de la Loire sans alourdir tous les deltas du monde.
        west, south, east, north = geometry.bounds
        tolerance = .001 if west <= 10 and east >= -6 and south <= 52 and north >= 41 else .004
        lines = [line.simplify(tolerance) for line in parts(geometry, 'LineString')]
        lines = [line for line in lines if not line.is_empty and line.length > .00001]
        if not lines:
            continue
        rivers.append(feature(MultiLineString(lines), {
            'name': props['name'], 'rank': rank,
            'min_zoom': 0 if rank <= 2 else float(props.get('min_zoom', rank)),
        }))

    uplands = [source for source in regions_source
               if source['properties']['FEATURECLA'] in ('Range/mtn', 'Plateau', 'Foothills')]
    land = unary_union([make_valid(shape(source['geometry'])) for source in land_source])
    # Fusionner les recouvrements : une seule nuance, même entre massif et plateau.
    relief_geometry = unary_union([make_valid(shape(source['geometry'])) for source in uplands])
    relief_geometry = relief_geometry.intersection(land).simplify(.003, preserve_topology=True)
    relief = [feature(polygon, {}) for polygon in parts(relief_geometry, 'Polygon')
              if polygon.area > .0001]
    return {
        'rivers': {'type': 'FeatureCollection', 'features': rivers},
        'relief': {'type': 'FeatureCollection', 'features': relief},
        'sources': {
            'provider': 'Natural Earth', 'license': 'Public domain',
            'rivers': 'ne_10m_rivers_lake_centerlines',
            'relief': 'ne_10m_geography_regions_polys (Range/mtn, Plateau, Foothills)',
            'relief_regions': len(uplands),
            'sha256': {path.name: hashlib.sha256(path.read_bytes()).hexdigest()
                       for path in (rivers_path, regions_path, land_path)},
            'description': 'Grands massifs et plateaux stylisés ; pas un modèle altimétrique.',
        },
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--rivers', type=Path, required=True)
    parser.add_argument('--regions', type=Path, required=True)
    parser.add_argument('--land', type=Path, default=Path('data/geography/countries.geojson'))
    parser.add_argument('--output', type=Path, default=Path('data/geography/physical.json'))
    args = parser.parse_args()
    result = prepare(args.rivers, args.regions, args.land)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"{len(result['rivers']['features'])} tracés hydrographiques, "
          f"{len(result['relief']['features'])} zones de relief, "
          f"{args.output.stat().st_size / 1024:.0f} Kio")
