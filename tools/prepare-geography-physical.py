#!/usr/bin/env python3
"""Contours d'altitude ETOPO locaux ; préparation hors navigateur."""
import argparse
import hashlib
import json
from pathlib import Path

import contourpy
import numpy as np
from scipy.ndimage import gaussian_filter, zoom
from shapely import make_valid
from shapely.geometry import mapping, shape, Polygon
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


def collection(features):
    return {'type': 'FeatureCollection', 'features': features}


def clip_features(features, boundary, kind):
    result = []
    for source in features:
        clipped = make_valid(shape(source['geometry'])).intersection(boundary)
        for part in parts(clipped, kind):
            if not part.is_empty:
                result.append(feature(part, source['properties']))
    return collection(result)


def prepare(elevation_path, header_path, existing_path, land_path, departments_path):
    header = dict(line.split() for line in header_path.read_text().splitlines())
    nx, ny = int(header['NCOLS']), int(header['NROWS'])
    step = float(header['CELLSIZE'])
    # BIL : première ligne au nord, little endian ; la grille ContourPy monte au nord.
    heights = np.fromfile(elevation_path, dtype='<i2').reshape(ny, nx)[::-1].astype(float)
    heights[heights == float(header['NODATA_VALUE'])] = 0
    heights = gaussian_filter(heights, sigma=.55, mode='nearest')
    # Interpolation pour des contours arrondis, sans prétendre augmenter la résolution source.
    heights = zoom(heights, 3, order=3, mode='nearest')
    x = np.linspace(float(header['XLLCENTER']), float(header['XLLCENTER']) + (nx - 1) * step, heights.shape[1])
    y = np.linspace(float(header['YLLCENTER']), float(header['YLLCENTER']) + (ny - 1) * step, heights.shape[0])
    contours = contourpy.contour_generator(x=x, y=y, z=heights, fill_type='OuterOffset')
    land_source = json.loads(land_path.read_text())
    land = unary_union([make_valid(shape(f['geometry'])) for f in land_source['features']])
    departments = json.loads(departments_path.read_text())
    metropole = unary_union([make_valid(shape(f['geometry'])) for f in departments['features']])
    relief = []
    for altitude, minimum in [(400, 3.75), (1000, 0), (2000, 2.75)]:
        rings, offsets = contours.filled(altitude, 10000)
        for points, boundaries in zip(rings, offsets):
            polygon = Polygon(points[boundaries[0]:boundaries[1]],
                              [points[a:b] for a, b in zip(boundaries[1:-1], boundaries[2:])])
            polygon = make_valid(polygon).intersection(land).simplify(.008, preserve_topology=True)
            for part in parts(polygon, 'Polygon'):
                if part.area < .006:
                    continue
                min_zoom = max(minimum, 5.5 if part.area < .15 else 3.75 if part.area < 3 else 0)
                relief.append(feature(part, {'elevation_m': altitude, 'min_zoom': min_zoom}))
    existing = json.loads(existing_path.read_text())
    return {
        'schema': 2,
        'rivers': existing['rivers'],
        'relief': collection(relief),
        'metropole': {
            'land': collection([feature(metropole, {})]),
            'rivers': clip_features(existing['rivers']['features'], metropole, 'LineString'),
            'relief': clip_features(relief, metropole, 'Polygon'),
        },
        'sources': {
            'rivers': existing['sources']['rivers'],
            'rivers_provider': 'Natural Earth', 'rivers_license': 'Public domain',
            'relief': 'ETOPO10 ice, dérivé du modèle ETOPO1 NOAA',
            'relief_url': 'https://github.com/g2e/etopo10',
            'relief_resolution_arc_minutes': step * 60,
            'relief_license': 'Public domain (NOAA) ; distribution ETOPO10 sous licence MIT, voir etopo-license.txt',
            'relief_levels_m': [400, 1000, 2000],
            'metropole': 'IGN / Admin Express via France GeoJSON (Licence ouverte Etalab)',
            'sha256': {p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                       for p in (elevation_path, header_path, land_path, departments_path)},
            'description': 'Contours altimétriques généralisés, ~18 km à l’équateur ; aucune précision locale inventée.',
        },
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--elevation', type=Path, required=True)
    parser.add_argument('--header', type=Path, required=True)
    parser.add_argument('--existing', type=Path, default=Path('data/geography/physical.json'))
    parser.add_argument('--land', type=Path, default=Path('data/geography/countries.geojson'))
    parser.add_argument('--departments', type=Path, default=Path('data/geography/departments.geojson'))
    parser.add_argument('--output', type=Path, default=Path('data/geography/physical.json'))
    args = parser.parse_args()
    result = prepare(args.elevation, args.header, args.existing, args.land, args.departments)
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(f"{len(result['rivers']['features'])} fleuves inchangés, "
          f"{len(result['relief']['features'])} contours d'altitude, "
          f"{args.output.stat().st_size / 1024:.0f} Kio")
