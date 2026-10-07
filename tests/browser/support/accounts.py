#!/usr/bin/env python3
"""API Supabase de contrôle, sans compte ni email réel."""
import base64
import json
import time
from urllib.parse import parse_qs, urlsplit

from .http import RepositoryHandler as Handler

A = '10000000-0000-4000-8000-000000000001'
B = '10000000-0000-4000-8000-000000000002'
HOST = 'https://jyuzvxhnolzwcviycljm.supabase.co'
profiles = [
    {'id': A, 'display_name': 'François', 'avatar_path': None, 'created_at': '2026-10-01'},
    {'id': B, 'display_name': 'Axel', 'avatar_path': None, 'created_at': '2026-10-02'},
]
profiles += [
    {
        'id': f'10000000-0000-4000-8000-{i:012d}',
        'display_name': name,
        'avatar_path': None,
        'created_at': '2026-10-03',
    }
    for i, name in enumerate(['Nico', 'Léa', 'Lou', 'Paul', 'Emma', 'Zoé'], 3)
]
events, calls, uploads, auth_calls = {}, [], [], []
control = {
    'drop_answer': False,
    'block_rpc': False,
    'offline': False,
    'email_confirmed': True,
    'email_error': None,
    'hold_stats': False,
    'profiles_error': False,
}
deferred_stats = []


def user(uid):
    return {
        'id': uid,
        'aud': 'authenticated',
        'role': 'authenticated',
        'email': 'private@example.test',
        'app_metadata': {'provider': 'email'},
        'user_metadata': {'display_name': 'François' if uid == A else 'Axel'},
        'created_at': '2026-10-01T00:00:00Z',
    }


def session(uid):
    encode = lambda x: base64.urlsafe_b64encode(json.dumps(x).encode()).decode().rstrip('=')
    token = (
        encode({'alg': 'HS256', 'typ': 'JWT'})
        + '.'
        + encode({'sub': uid, 'role': 'authenticated', 'exp': int(time.time()) + 3600})
        + '.testing'
    )
    return {
        'access_token': token,
        'refresh_token': 'test-refresh-' + uid,
        'token_type': 'bearer',
        'expires_in': 3600,
        'expires_at': int(time.time()) + 3600,
        'user': user(uid),
    }


def actor(request):
    try:
        part = request.headers['authorization'].split()[1].split('.')[1]
        return json.loads(base64.urlsafe_b64decode(part + '=' * (-len(part) % 4)))['sub']
    except Exception:
        return None


def backend(route):
    if control['offline']:
        route.abort('internetdisconnected')
        return
    request = route.request
    path = request.url.split(HOST)[-1].split('?')[0]
    data = (
        request.post_data_json
        if request.method in ['POST', 'PATCH']
        and 'application/json' in request.headers.get('content-type', '')
        else {}
    )
    if path.startswith('/auth/v1/') and request.method != 'OPTIONS':
        auth_calls.append({'path': path, 'url': request.url, 'data': data})
        if path in ['/auth/v1/signup', '/auth/v1/recover', '/auth/v1/resend']:
            # L'adresse de retour doit être le dossier du site, sans paramètres Auth.
            redirect = parse_qs(urlsplit(request.url).query).get('redirect_to', [None])[0]
            assert redirect == base, (path, redirect, base)
    headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
        'access-control-expose-headers': 'x-supabase-api-version',
        'x-supabase-api-version': '2024-01-01',
    }

    def reply(value, status=200):
        route.fulfill(
            status=status, content_type='application/json', body=json.dumps(value), headers=headers
        )

    if request.method == 'OPTIONS':
        reply({})
    elif (
        path in ['/auth/v1/signup', '/auth/v1/recover', '/auth/v1/resend']
        and control['email_error']
    ):
        code, status = control['email_error']
        reply(
            {'code': code, 'msg': 'Do not display this raw server message: private@example.test'},
            status,
        )
    elif path == '/auth/v1/token':
        if not control['email_confirmed']:
            reply({'msg': 'Email not confirmed', 'code': 'email_not_confirmed'}, 400)
        elif data.get('password') == 'wrong-password':
            reply({'msg': 'Invalid login credentials', 'code': 'invalid_credentials'}, 400)
        else:
            reply(session(B if data.get('email', '').startswith('axel') else A))
    elif path == '/auth/v1/signup':
        assert len(data['password']) >= 12
        reply({'user': user(A), 'identities': []})
    elif path in ['/auth/v1/logout', '/auth/v1/recover', '/auth/v1/resend']:
        reply({})
    elif path == '/auth/v1/verify':
        assert data['type'] in ['signup', 'recovery']
        reply(
            session(A) if data['token'] == '123456' else {'msg': 'Invalid code'},
            200 if data['token'] == '123456' else 403,
        )
    elif path == '/auth/v1/user':
        reply(user(actor(request) or A))
    elif path == '/rest/v1/profiles':
        assert actor(request), 'Les profils nécessitent une session'
        if request.method == 'PATCH':
            assert 'id=eq.' + actor(request) in request.url
            next(p for p in profiles if p['id'] == actor(request)).update(data)
            reply(None)
        else:
            assert all('email' not in p for p in profiles)
            reply({'message': 'unavailable'}, 503) if control['profiles_error'] else reply(profiles)
    elif path == '/rest/v1/player_statistics':
        if control['hold_stats']:
            deferred_stats.append(route)
            return
        totals = {}
        for event in events.values():
            for p in event['p_participants']:
                metrics = dict(p['metrics'])
                payload = event.get('p_payload', {})
                measured = payload.get('city_measurements', {}).get(p['account_id'])
                if (
                    event['p_mode'] == 'geography'
                    and payload.get('map_mode') == 'cities'
                    and measured
                ):
                    prefix = 'city_' + payload['zone']
                    metrics.update(measured)
                    metrics[prefix + '_turns'] = measured['distance_turns']
                    metrics[prefix + '_km'] = measured['measured_distance_km']
                for metric, value in metrics.items():
                    key = (p['account_id'], event['p_mode'], metric)
                    totals[key] = totals.get(key, 0) + value
        reply(
            [
                {'player_id': p, 'mode': mode, 'metric': metric, 'total': value}
                for (p, mode, metric), value in totals.items()
            ]
        )
    elif path == '/rest/v1/rpc/record_game_event':
        calls.append(data)
        assert data['p_host_id'] == actor(request), 'Un résultat ne peut changer d’organisateur'
        if control['block_rpc']:
            route.abort('failed')
            return
        old = events.get(data['p_event_id'])
        if not old or old['p_revision'] < data['p_revision']:
            events[data['p_event_id']] = data
        if control['drop_answer'] and data['p_payload'].get('question_id') == 'test-answer':
            control['drop_answer'] = False
            route.abort('failed')
        else:
            reply(not old or old['p_revision'] < data['p_revision'])
    elif path == '/storage/v1/object/sign/avatars':
        reply(
            [
                {'path': p, 'signedURL': '/object/sign/avatars/' + p + '?token=test'}
                for p in data['paths']
            ]
        )
    elif path.startswith('/storage/v1/object/avatars/') and request.method == 'POST':
        assert 'multipart/form-data' in request.headers.get('content-type', '')
        assert b'Content-Type: image/webp' in request.post_data_buffer
        assert b'RIFF' in request.post_data_buffer and b'WEBP' in request.post_data_buffer
        uploads.append(path)
        reply({'Key': path.split('/object/')[-1]})
    elif path == '/storage/v1/object/avatars' and request.method == 'DELETE':
        reply([])
    elif path.startswith('/storage/v1/object/sign/avatars/'):
        route.fulfill(
            content_type='image/png',
            body=base64.b64decode(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZsQAAAAASUVORK5CYII='
            ),
            headers=headers,
        )
    else:
        raise AssertionError(f'Requête Supabase imprévue : {request.method} {path}')
